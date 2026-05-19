'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, Session, SessionRsvp, Wine, TastingNote } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Badge } from '@/components/ui/badge'
import WineLogo from '@/components/WineLogo'

const wineTypeLabel: Record<string, string> = {
  red: '레드', white: '화이트', orange: '오렌지',
  rose: '로제', sparkling: '스파클링', other: '기타',
}

type WineHighlight = Wine & { avgRating: number | null; noteCount: number; topKeyword: string | null }

export default function HomePage() {
  const { user } = useUser()
  const [session, setSession] = useState<Session | null>(null)
  const [myRsvp, setMyRsvp] = useState<'attending' | 'not_attending' | null>(null)
  const [attendingCount, setAttendingCount] = useState(0)
  const [totalMembers, setTotalMembers] = useState(0)
  const [loading, setLoading] = useState(true)
  const [wineHighlights, setWineHighlights] = useState<WineHighlight[]>([])
  type ClubStats = { totalWines: number; totalNotes: number; avgRating: number | null; topTypes: [string, number][]; topKw: [string, number][] }
  const [clubStats, setClubStats] = useState<ClubStats | null>(null)
  // 관리자용
  const [activeCount, setActiveCount] = useState(0)

  useEffect(() => {
    if (!user) return

    const fetchAll = async () => {
      try {
        const { data: sessions } = await supabase
          .from('sessions')
          .select('*')
          .in('status', ['planning', 'active'])
          .order('scheduled_at', { ascending: true })
          .limit(1)

        const s = sessions?.[0] as Session | undefined
        setSession(s ?? null)

        if (s) {
          const [rsvpRes, allRsvpRes] = await Promise.all([
            supabase.from('session_rsvps').select('status').eq('session_id', s.id).eq('user_id', user.id).maybeSingle(),
            supabase.from('session_rsvps').select('*', { count: 'exact', head: true }).eq('session_id', s.id).eq('status', 'attending'),
          ])
          setMyRsvp((rsvpRes.data as SessionRsvp | null)?.status ?? null)
          setAttendingCount(allRsvpRes.count ?? 0)
        }

        const { count: memberCount } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
        setTotalMembers(memberCount ?? 0)

        if (user.is_admin) setActiveCount(memberCount ?? 0)

        const { data: winesData } = await supabase
          .from('wines')
          .select('*, tasting_notes(rating, aroma_keywords, taste_keywords, texture_keywords)')
          .order('created_at', { ascending: false })
          .limit(20)

        const allWinesWithNotes = ((winesData ?? []) as any[]).map((w) => {
          const notes: TastingNote[] = w.tasting_notes ?? []
          const rated = notes.filter((n: any) => n.rating)
          const avgRating = rated.length > 0
            ? rated.reduce((s: number, n: any) => s + n.rating, 0) / rated.length
            : null
          const kwFreq: Record<string, number> = {}
          notes.forEach((n: any) => {
            ;[...(n.aroma_keywords ?? []), ...(n.taste_keywords ?? [])].forEach((k: string) => {
              kwFreq[k] = (kwFreq[k] ?? 0) + 1
            })
          })
          const topKeyword = Object.entries(kwFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
          return { ...w, avgRating, noteCount: notes.length, topKeyword, kwFreq }
        })

        const highlights: WineHighlight[] = allWinesWithNotes
          .filter((w) => w.noteCount > 0)
          .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
          .slice(0, 4)

        setWineHighlights(highlights)

        // 클럽 통계 집계
        const allNotes = allWinesWithNotes.flatMap((w) => w.tasting_notes ?? []) as any[]
        const ratedAll = allNotes.filter((n) => n.rating)
        const typeFreq: Record<string, number> = {}
        allWinesWithNotes.forEach((w) => { if (w.wine_type && w.noteCount > 0) typeFreq[w.wine_type] = (typeFreq[w.wine_type] ?? 0) + w.noteCount })
        const kwFreqAll: Record<string, number> = {}
        allWinesWithNotes.forEach((w) => Object.entries(w.kwFreq).forEach(([k, v]) => { kwFreqAll[k] = (kwFreqAll[k] ?? 0) + (v as number) }))
        setClubStats({
          totalWines: allWinesWithNotes.filter((w) => w.noteCount > 0).length,
          totalNotes: allNotes.length,
          avgRating: ratedAll.length > 0 ? ratedAll.reduce((s: number, n: any) => s + n.rating, 0) / ratedAll.length : null,
          topTypes: Object.entries(typeFreq).sort((a, b) => b[1] - a[1]).slice(0, 3) as [string, number][],
          topKw: Object.entries(kwFreqAll).sort((a, b) => b[1] - a[1]).slice(0, 6) as [string, number][],
        })
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [user])

  async function handleRsvp(status: 'attending' | 'not_attending') {
    if (!session || !user) return
    const deadline = session.rsvp_deadline ? new Date(session.rsvp_deadline) : null
    if (deadline && new Date() > deadline) return

    await supabase.from('session_rsvps').upsert(
      { session_id: session.id, user_id: user.id, status },
      { onConflict: 'session_id,user_id' }
    )
    setMyRsvp(status)
    setAttendingCount((prev) => {
      if (status === 'attending' && myRsvp !== 'attending') return prev + 1
      if (status === 'not_attending' && myRsvp === 'attending') return prev - 1
      return prev
    })
  }

  const deadline = session?.rsvp_deadline ? new Date(session.rsvp_deadline) : null
  const isDeadlinePassed = deadline ? new Date() > deadline : false
  const dDiff = deadline ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

  if (loading) {
    return <div className="px-4 py-6 space-y-4">{[1, 2].map((i) => <div key={i} className="h-24 bg-muted rounded-2xl animate-pulse" />)}</div>
  }

  // ─── 일반 멤버 뷰 ───────────────────────────────────────────────
  if (!user?.is_admin) {
    return (
      <div className="px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <WineLogo size={40} />
          <div>
            <h1 className="text-xl font-bold text-primary">안녕하세요, {user?.nickname}님</h1>
            <p className="text-sm text-muted-foreground">내추럴와인 동호회</p>
          </div>
        </div>

        {session ? (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">다가오는 모임</p>
              <p className="font-bold text-lg text-primary">{session.title}</p>
              {session.scheduled_at && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {new Date(session.scheduled_at).toLocaleDateString('ko-KR', {
                    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
              {session.venue && (
                <p className="text-sm text-muted-foreground">📍 {session.venue}</p>
              )}
            </div>

            {deadline && (
              <p className={`text-xs font-medium ${isDeadlinePassed ? 'text-destructive' : dDiff! <= 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {isDeadlinePassed ? '✕ 참석 투표 마감됨' : `⏰ 투표 마감 D-${dDiff} · ${deadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}`}
              </p>
            )}

            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() => handleRsvp('attending')}
                  disabled={isDeadlinePassed}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    myRsvp === 'attending'
                      ? 'bg-green-500 text-white border-green-500'
                      : 'border-border text-muted-foreground'
                  } ${isDeadlinePassed ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  ✓ 참석
                </button>
                <button
                  onClick={() => handleRsvp('not_attending')}
                  disabled={isDeadlinePassed}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                    myRsvp === 'not_attending'
                      ? 'bg-foreground text-background border-foreground'
                      : 'border-border text-muted-foreground'
                  } ${isDeadlinePassed ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  ✕ 불참
                </button>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                현재 참석 {attendingCount}명 / 전체 {totalMembers}명
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <div className="text-5xl">🍷</div>
            <p className="font-medium">아직 예정된 모임이 없어요</p>
            <p className="text-sm text-muted-foreground">다음 모임 공지를 기다려주세요</p>
          </div>
        )}

        {/* 클럽 통계 */}
        {clubStats && clubStats.totalWines > 0 && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <p className="text-sm font-semibold">📊 동호회 통계</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-bold text-primary">{clubStats.totalWines}</p>
                <p className="text-[11px] text-muted-foreground">시음 와인</p>
              </div>
              <div>
                <p className="text-xl font-bold text-primary">{clubStats.totalNotes}</p>
                <p className="text-[11px] text-muted-foreground">시음평</p>
              </div>
              <div>
                <p className="text-xl font-bold text-primary">{clubStats.avgRating ? `★${clubStats.avgRating.toFixed(1)}` : '-'}</p>
                <p className="text-[11px] text-muted-foreground">평균 별점</p>
              </div>
            </div>
            {clubStats.topTypes.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground">선호 타입</p>
                {clubStats.topTypes.map(([type, count]) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-xs w-12 shrink-0 text-right text-muted-foreground">{wineTypeLabel[type] ?? type}</span>
                    <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(count / clubStats.topTypes[0][1]) * 100}%` }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground w-3">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {clubStats.topKw.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground">인기 키워드</p>
                <div className="flex flex-wrap gap-1.5">
                  {clubStats.topKw.map(([kw, count]) => (
                    <span key={kw} className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {kw} <span className="opacity-60">×{count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 와인 하이라이트 */}
        {wineHighlights.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">🏆 동호회 인기 와인</p>
              <Link href="/wines" className="text-xs text-primary font-medium">전체 보기 →</Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {wineHighlights.map((wine) => (
                <Link key={wine.id} href={`/wines/${wine.id}`}>
                  <div className="bg-card border border-border rounded-xl p-3 space-y-1.5 hover:shadow-sm transition-shadow active:scale-[0.98]">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium leading-tight line-clamp-2 flex-1">{wine.name}</p>
                      {wine.wine_type && (
                        <Badge variant="secondary" className="text-[10px] shrink-0 px-1.5">{wineTypeLabel[wine.wine_type]}</Badge>
                      )}
                    </div>
                    {wine.avgRating !== null && (
                      <div className="flex items-center gap-1">
                        <span className="text-amber-400 text-xs">★</span>
                        <span className="text-sm font-bold">{wine.avgRating.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">({wine.noteCount})</span>
                      </div>
                    )}
                    {wine.topKeyword && (
                      <span className="inline-block text-[10px] bg-secondary px-1.5 py-0.5 rounded-full">{wine.topKeyword}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── 관리자 뷰 ─────────────────────────────────────────────────
  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <WineLogo size={40} />
        <div>
          <h1 className="text-xl font-bold text-primary">안녕하세요, {user?.nickname}님</h1>
          <p className="text-sm text-muted-foreground">관리자</p>
        </div>
      </div>

      {/* 다가오는 모임 */}
      {session ? (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold text-primary">{session.title}</p>
              {session.scheduled_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(session.scheduled_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                </p>
              )}
              {session.venue && <p className="text-xs text-muted-foreground">📍 {session.venue}</p>}
            </div>
            <Link href={`/sessions/${session.id}`}
              className="text-xs text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-full">
              관리 →
            </Link>
          </div>
          <div className="flex gap-3 text-xs">
            <span className={`${isDeadlinePassed ? 'text-destructive' : dDiff !== null && dDiff <= 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
              {deadline
                ? isDeadlinePassed ? '투표 마감됨' : `투표 마감 D-${dDiff}`
                : '투표 마감일 미설정'}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">참석 {attendingCount}명 / 전체 {totalMembers}명</span>
          </div>
        </div>
      ) : (
        <Link href="/sessions/new"
          className="block bg-primary text-primary-foreground text-sm font-semibold text-center px-4 py-3 rounded-2xl">
          + 새 모임 만들기
        </Link>
      )}

      {/* 지원금 현황 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-primary">{activeCount}명</p>
          <p className="text-xs text-muted-foreground mt-1">활성 멤버</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-primary">{(activeCount * 35000).toLocaleString()}원</p>
          <p className="text-xs text-muted-foreground mt-1">월 총 지원금</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Link href="/sessions/new"
          className="flex-1 text-center bg-primary text-primary-foreground text-sm font-medium px-4 py-2.5 rounded-xl">
          + 새 모임
        </Link>
        <Link href="/admin"
          className="flex-1 text-center border border-border text-sm font-medium px-4 py-2.5 rounded-xl">
          멤버 관리
        </Link>
      </div>

      {/* 와인 하이라이트 */}
      {wineHighlights.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">🏆 인기 와인</p>
            <Link href="/wines" className="text-xs text-primary font-medium">전체 보기 →</Link>
          </div>
          <div className="space-y-2">
            {wineHighlights.slice(0, 3).map((wine, i) => (
              <Link key={wine.id} href={`/wines/${wine.id}`}>
                <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  <span className="text-lg font-bold text-muted-foreground/40 w-6 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{wine.name}</p>
                    {wine.topKeyword && <p className="text-xs text-muted-foreground">{wine.topKeyword}</p>}
                  </div>
                  {wine.avgRating !== null && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <span className="text-amber-400 text-xs">★</span>
                      <span className="text-sm font-bold">{wine.avgRating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
