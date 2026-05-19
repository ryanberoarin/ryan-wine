import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()

    const { data: sessionWines } = await supabase
      .from('session_wines')
      .select('id, wine_id, wine:wines(*)')
      .eq('session_id', sessionId)
      .neq('status', 'removed')
      .order('created_at')

    if (!sessionWines || sessionWines.length < 2) {
      return NextResponse.json({ success: false, error: '와인이 2개 이상 있어야 순서를 추천할 수 있어요' }, { status: 400 })
    }

    const wineList = sessionWines.map((sw: any) => ({
      session_wine_id: sw.id,
      name: sw.wine?.name ?? '이름 미상',
      producer: sw.wine?.producer ?? null,
      vintage: sw.wine?.vintage ?? null,
      wine_type: sw.wine?.wine_type ?? null,
      region: sw.wine?.region ?? null,
      grape_varieties: sw.wine?.grape_varieties ?? [],
      is_natural: sw.wine?.is_natural ?? false,
      ai_description: sw.wine?.ai_description ?? null,
    }))

    const prompt = `내추럴와인 모임에서 마실 와인들의 최적 음용 순서를 추천해줘.

와인 목록:
${wineList.map((w, i) => [
  `${i + 1}. [ID: ${w.session_wine_id}] ${w.name}${w.producer ? ` / ${w.producer}` : ''}${w.vintage ? ` ${w.vintage}년` : ''}`,
  `   타입: ${w.wine_type ?? '미상'}${w.grape_varieties?.length ? ` | 품종: ${w.grape_varieties.join(', ')}` : ''}${w.region ? ` | 산지: ${w.region}` : ''}`,
  w.ai_description ? `   설명: ${w.ai_description}` : '',
].filter(Boolean).join('\n')).join('\n\n')}

순서 결정 기준:
- 스파클링 → 화이트/오렌지 → 로제 → 레드 순 (일반 원칙)
- 같은 색상 내: 가볍고 산도 높은 것 → 바디감 있고 탄닌 강한 것
- 빈티지 어린 것 → 오래된 것 (일반적으로)
- 내추럴와인 특성(펫낫, 앰포라, 마세라시옹 등) 고려
- 정보가 없는 경우 합리적으로 추론

아래 JSON 형식으로만 응답해 (다른 텍스트 없이):
{
  "order": [
    { "session_wine_id": "<정확한 ID>", "reason": "한 줄 이유 (15자 이내)" },
    ...
  ]
}

반드시 위 목록의 모든 와인을 포함하고, session_wine_id는 정확히 입력받은 값 그대로 사용해.`

    const response = await genai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts: [{ text: prompt }] }],
    })

    const text = response.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('JSON 파싱 실패')

    const parsed = JSON.parse(jsonMatch[0])

    // 유효한 session_wine_id만 필터
    const validIds = new Set(wineList.map((w) => w.session_wine_id))
    const filteredOrder = (parsed.order ?? []).filter((item: any) => validIds.has(item.session_wine_id))

    // 누락된 와인 뒤에 append
    const includedIds = new Set(filteredOrder.map((item: any) => item.session_wine_id))
    for (const w of wineList) {
      if (!includedIds.has(w.session_wine_id)) {
        filteredOrder.push({ session_wine_id: w.session_wine_id, reason: '순서 미지정' })
      }
    }

    return NextResponse.json({ success: true, order: filteredOrder })
  } catch (err: any) {
    console.error('recommend-order error:', err)
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 })
  }
}
