import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/api-auth'
import { allow, retryAfterSeconds } from '@/lib/rate-limit'

export const maxDuration = 30

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  if (!user.is_admin) return NextResponse.json({ error: '관리자만 사용할 수 있어요.' }, { status: 403 })

  if (!allow(`review:${user.id}`, 10, 60 * 60 * 1000)) {
    const retry = retryAfterSeconds(`review:${user.id}`)
    return NextResponse.json(
      { success: false, error: `1시간에 10회까지 생성할 수 있어요. ${retry}초 후 다시 시도해주세요.` },
      { status: 429 }
    )
  }

  try {
    const { sessionId } = await req.json()

    const [sessionRes, winesRes, notesRes, rsvpRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('session_wines')
        .select('*, wine:wines(*)')
        .eq('session_id', sessionId)
        .neq('status', 'removed'),
      supabase.from('tasting_notes')
        .select('*, wine:wines(name), user:users(nickname)')
        .eq('session_id', sessionId),
      supabase.from('session_rsvps')
        .select('*, user:users(nickname)')
        .eq('session_id', sessionId)
        .eq('status', 'attending'),
    ])

    const session = sessionRes.data
    const wines = winesRes.data ?? []
    const notes = notesRes.data ?? []
    const attendees = rsvpRes.data ?? []

    const winesSummary = wines.map((sw: any) => {
      const wineNotes = notes.filter((n: any) => n.wine_id === sw.wine_id)
      const avgRating = wineNotes.filter((n: any) => n.rating).length > 0
        ? (wineNotes.reduce((s: number, n: any) => s + (n.rating ?? 0), 0) / wineNotes.filter((n: any) => n.rating).length).toFixed(1)
        : null
      const allKeywords = wineNotes.flatMap((n: any) => [
        ...(n.aroma_keywords ?? []),
        ...(n.taste_keywords ?? []),
        ...(n.texture_keywords ?? []),
      ])
      const keywordCounts: Record<string, number> = {}
      allKeywords.forEach((k: string) => { keywordCounts[k] = (keywordCounts[k] ?? 0) + 1 })
      const topKeywords = Object.entries(keywordCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k]) => k)

      return `- ${sw.wine?.name ?? '이름 미상'}${sw.wine?.producer ? ` (${sw.wine.producer})` : ''}${sw.wine?.vintage ? ` ${sw.wine.vintage}` : ''}: 평균 ${avgRating ?? '-'}점, 키워드: ${topKeywords.join(', ') || '없음'}`
    }).join('\n')

    const memos = notes
      .filter((n: any) => n.memo)
      .map((n: any) => `${(n as any).user?.nickname}: "${n.memo}"`)
      .join('\n')

    const prompt = `내추럴와인 동호회 모임 후기를 회사 사내 게시판 스타일로 작성해줘.

모임 정보:
- 모임명: ${session?.title}
- 날짜: ${session?.scheduled_at ? new Date(session.scheduled_at).toLocaleDateString('ko-KR') : '미정'}
- 참석자: ${attendees.map((a: any) => a.user?.nickname).join(', ') || '미정'} (총 ${attendees.length}명)

시음한 와인 및 평가:
${winesSummary || '정보 없음'}

인상적인 메모:
${memos || '없음'}

작성 조건:
- 친근하고 따뜻한 톤
- 이모지 2~3개 자연스럽게 포함
- 와인별 간단한 소개 + 멤버들 반응 포함
- 다음 모임 기대감으로 마무리
- 300~400자 분량`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const review = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ success: true, review })
  } catch (err: any) {
    console.error('review error:', err)
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 })
  }
}
