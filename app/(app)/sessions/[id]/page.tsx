'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase, Session, SessionWine, SessionRsvp, CostItem, SessionPenalty, User, USER_PUBLIC_COLUMNS } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { getDeviceToken } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { calcSettlement, buildSnapshot } from '@/lib/settlement'
import SettlementTab from '@/components/session/SettlementTab'
import MemberSettlement from '@/components/session/MemberSettlement'
import QuickRating from '@/components/session/QuickRating'

const statusLabel: Record<string, string> = {
  planning: '준비 중', active: '진행 중', completed: '완료',
}
type Tab = 'wines' | 'settlement'
type MyNote = { id: string; rating: number | null }

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useUser()
  const [session, setSession] = useState<Session | null>(null)
  const [wines, setWines] = useState<SessionWine[]>([])
  const [rsvps, setRsvps] = useState<SessionRsvp[]>([])
  const [rsvpsLoaded, setRsvpsLoaded] = useState(false)
  const [myRsvp, setMyRsvp] = useState<'attending' | 'not_attending' | null>(null)
  const [costItems, setCostItems] = useState<CostItem[]>([])
  const [penalties, setPenalties] = useState<SessionPenalty[]>([])
  const [allMembers, setAllMembers] = useState<User[]>([])
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('wines')
  // 와인 추가
  const [showAddWine, setShowAddWine] = useState(false)
  const [newWineName, setNewWineName] = useState('')
  const [addingWine, setAddingWine] = useState(false)
  // 모임 정보 수정
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editVenue, setEditVenue] = useState('')
  const [editScheduledAt, setEditScheduledAt] = useState('')
  const [editRsvpDeadline, setEditRsvpDeadline] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  // 카톡 리마인드 복사
  const [reminderCopied, setReminderCopied] = useState(false)
  // 음용 순서
  type OrderItem = { session_wine_id: string; reason: string }
  const [recommending, setRecommending] = useState(false)
  const [recommendation, setRecommendation] = useState<OrderItem[] | null>(null)
  const [orderMode, setOrderMode] = useState(false)
  const [localOrder, setLocalOrder] = useState<SessionWine[]>([])
  const [savingOrder, setSavingOrder] = useState(false)
  // 계좌 정보 (서버에서 안전하게 조회)
  const [paymentInfo, setPaymentInfo] = useState<{ bank: string; account: string } | null>(null)
  // 퀵 레이팅: wine_id → 내 시음평
  const [myNotes, setMyNotes] = useState<Record<string, MyNote>>({})
  const [savingNoteWineId, setSavingNoteWineId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('sessions').select('*').eq('id', id).single()
      .then(({ data }) => setSession(data as Session))
    fetchWines()
    fetchRsvps()
    fetchCostItems()
    fetchPenalties()
    supabase.from('users').select(USER_PUBLIC_COLUMNS).eq('is_active', true).order('nickname')
      .then(({ data }) => {
        setAllMembers((data as unknown as User[]) ?? [])
        setMembersLoaded(true)
      })
    fetch('/api/payment-info', { headers: { 'x-device-token': getDeviceToken() } })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => { if (json) setPaymentInfo({ bank: json.bank, account: json.account }) })
  }, [id])

  useEffect(() => {
    if (user) setMyRsvp(rsvps.find((r) => r.user_id === user.id)?.status ?? null)
  }, [rsvps, user])

  // 내 시음평 (퀵 레이팅 표시용)
  useEffect(() => {
    if (!user) return
    supabase.from('tasting_notes')
      .select('id, wine_id, rating')
      .eq('session_id', id).eq('user_id', user.id)
      .then(({ data }) => {
        const map: Record<string, MyNote> = {}
        for (const n of (data ?? []) as { id: string; wine_id: string; rating: number | null }[]) {
          map[n.wine_id] = { id: n.id, rating: n.rating }
        }
        setMyNotes(map)
      })
  }, [id, user])

  async function fetchWines() {
    const { data } = await supabase
      .from('session_wines').select('*, wine:wines(*), user:users(nickname)')
      .eq('session_id', id).neq('status', 'removed').order('order_index')
    setWines((data as SessionWine[]) ?? [])
  }
  async function fetchRsvps() {
    const { data } = await supabase
      .from('session_rsvps').select('*, user:users(nickname)').eq('session_id', id)
    setRsvps((data as SessionRsvp[]) ?? [])
    setRsvpsLoaded(true)
  }
  async function fetchCostItems() {
    const { data } = await supabase
      .from('session_cost_items').select('*')
      .eq('session_id', id).order('round_number').order('created_at')
    setCostItems((data as CostItem[]) ?? [])
  }
  async function fetchPenalties() {
    const { data } = await supabase
      .from('session_penalties').select('*, user:users(nickname)')
      .eq('session_id', id).order('created_at')
    setPenalties((data as SessionPenalty[]) ?? [])
  }

  // 별점만 빠르게 기록. 이미 쓴 시음평이 있으면 별점만 갱신.
  async function quickRate(wineId: string, n: number) {
    if (!user) return
    const existing = myNotes[wineId]
    const newRating = existing?.rating === n ? null : n // 같은 별점 다시 탭하면 해제
    setSavingNoteWineId(wineId)
    if (existing) {
      await supabase.from('tasting_notes').update({ rating: newRating }).eq('id', existing.id)
      setMyNotes((prev) => ({ ...prev, [wineId]: { ...existing, rating: newRating } }))
    } else if (newRating !== null) {
      const { data } = await supabase.from('tasting_notes').insert({
        wine_id: wineId, user_id: user.id, session_id: id, rating: newRating,
        aroma_keywords: [], taste_keywords: [], texture_keywords: [],
      }).select('id, wine_id, rating').single()
      if (data) setMyNotes((prev) => ({ ...prev, [wineId]: { id: data.id, rating: data.rating } }))
    }
    setSavingNoteWineId(null)
  }

  function calcPenalty(scheduledAt: string | null): { amount: number; label: string } | null {
    if (!scheduledAt) return null
    const now = new Date()
    const event = new Date(scheduledAt)
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate())
    const diffDays = Math.round((eventDay.getTime() - nowDay.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays <= 0) return { amount: 20000, label: 'D-day' }
    if (diffDays === 1) return { amount: 10000, label: 'D-1' }
    if (diffDays <= 7) return { amount: 5000, label: `D-${diffDays}` }
    return null
  }

  async function handleRsvp(status: 'attending' | 'not_attending') {
    if (!user) return

    // 마감 후 취소: 벌금 안내 후 기록
    if (isDeadlinePassed && status === 'not_attending' && myRsvp === 'attending') {
      const penalty = calcPenalty(session?.scheduled_at ?? null)
      const msg = penalty
        ? `투표 마감 후 취소입니다.\n${penalty.label} 기준 불참비 ${penalty.amount.toLocaleString()}원이 부과됩니다.\n계속하시겠어요?`
        : '투표 마감 후 취소입니다. 계속하시겠어요?'
      if (!window.confirm(msg)) return
      if (penalty) {
        await supabase.from('session_penalties').insert({
          session_id: id, user_id: user.id, amount: penalty.amount, reason: penalty.label,
        })
        fetchPenalties()
      }
    }

    // 마감 후 재참석: 기존 벌금 취소
    if (isDeadlinePassed && status === 'attending' && myRsvp === 'not_attending') {
      await supabase.from('session_penalties')
        .delete().eq('session_id', id).eq('user_id', user.id)
      fetchPenalties()
    }

    await supabase.from('session_rsvps').upsert(
      { session_id: id, user_id: user.id, status },
      { onConflict: 'session_id,user_id' }
    )
    setMyRsvp(status)
    fetchRsvps()
  }

  async function addWineByName() {
    if (!newWineName.trim() || !user) return
    setAddingWine(true)
    const { data: wine } = await supabase.from('wines')
      .insert({ name: newWineName.trim(), created_by: user.id }).select().single()
    if (wine) {
      await supabase.from('session_wines').insert({ session_id: id, wine_id: wine.id, added_by: user.id })
      await fetchWines()
      setNewWineName('')
      setShowAddWine(false)
      if (orderMode) { setOrderMode(false); setRecommendation(null) }
    }
    setAddingWine(false)
  }

  async function confirmWine(swId: string) {
    await supabase.from('session_wines').update({ status: 'confirmed' }).eq('id', swId)
    setWines((prev) => prev.map((w) => w.id === swId ? { ...w, status: 'confirmed' } : w))
  }

  async function removeWine(swId: string) {
    await supabase.from('session_wines').update({ status: 'removed' }).eq('id', swId)
    setWines((prev) => prev.filter((w) => w.id !== swId))
    if (orderMode) { setOrderMode(false); setRecommendation(null) }
  }

  function toLocalDTInput(isoStr: string): string {
    const d = new Date(isoStr)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function openEdit() {
    setEditTitle(session!.title)
    setEditDescription(session!.description ?? '')
    setEditVenue(session!.venue ?? '')
    setEditScheduledAt(session!.scheduled_at ? toLocalDTInput(session!.scheduled_at) : '')
    setEditRsvpDeadline(session!.rsvp_deadline ? toLocalDTInput(session!.rsvp_deadline) : '')
    setShowEdit(true)
  }

  async function adminToggleRsvp(userId: string, currentStatus: 'attending' | 'not_attending' | null) {
    const newStatus = currentStatus === 'attending' ? 'not_attending' : 'attending'
    await supabase.from('session_rsvps').upsert(
      { session_id: id, user_id: userId, status: newStatus },
      { onConflict: 'session_id,user_id' }
    )
    fetchRsvps()
  }

  function copyKakaoReminder() {
    if (!session) return
    const d = session.scheduled_at ? new Date(session.scheduled_at) : null
    const dateStr = d ? d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }) : ''
    const timeStr = d ? d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : ''
    const attendingNames = settlement.attendingList.map((r) => (r as any).user?.nickname ?? '멤버').join(', ')
    const lines = [
      `🍷 ${session.title} 리마인드`,
      '',
      ...(dateStr ? [`📅 ${dateStr}${timeStr ? ` ${timeStr}` : ''}`] : []),
      ...(session.venue ? [`📍 ${session.venue}`] : []),
      '',
      `✅ 참석 확정 (${settlement.attendingCount}명)`,
      attendingNames || '(아직 없음)',
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setReminderCopied(true)
    setTimeout(() => setReminderCopied(false), 2000)
  }

  async function saveEdit() {
    if (!editTitle.trim()) return
    setSavingEdit(true)
    const { data } = await supabase.from('sessions').update({
      title: editTitle.trim(),
      description: editDescription.trim() || null,
      venue: editVenue.trim() || null,
      scheduled_at: editScheduledAt ? new Date(editScheduledAt).toISOString() : null,
      rsvp_deadline: editRsvpDeadline ? new Date(editRsvpDeadline).toISOString() : null,
    }).eq('id', id).select().single()
    if (data) setSession(data as Session)
    setSavingEdit(false)
    setShowEdit(false)
  }

  async function sendReminderPush() {
    try {
      await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': getDeviceToken() },
        body: JSON.stringify({
          title: `📣 참석 투표 마감 임박`,
          body: `${session?.title} 참석 여부를 아직 응답하지 않은 분들은 지금 바로 투표해주세요!`,
          url: `/sessions/${id}`,
        }),
      })
      alert('리마인더를 발송했어요!')
    } catch {
      alert('발송 실패. 다시 시도해주세요.')
    }
  }

  async function recommendOrder() {
    setRecommending(true)
    setRecommendation(null)
    try {
      const res = await fetch('/api/recommend-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': getDeviceToken() },
        body: JSON.stringify({ sessionId: id }),
      })
      const json = await res.json()
      if (json.success) {
        setRecommendation(json.order)
        // 추천 순서대로 localOrder 세팅
        const orderMap = new Map<string, number>()
        json.order.forEach((item: { session_wine_id: string }, i: number) => {
          orderMap.set(item.session_wine_id, i)
        })
        const sorted = [...wines].sort((a, b) => (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99))
        setLocalOrder(sorted)
        setOrderMode(true)
      } else {
        alert(json.error ?? '순서 추천에 실패했어요.')
      }
    } catch {
      alert('순서 추천에 실패했어요.')
    }
    setRecommending(false)
  }

  function moveWine(index: number, dir: -1 | 1) {
    const next = [...localOrder]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setLocalOrder(next)
  }

  async function saveOrder() {
    setSavingOrder(true)
    await Promise.all(
      localOrder.map((sw, i) =>
        supabase.from('session_wines').update({ order_index: i + 1 }).eq('id', sw.id)
      )
    )
    setWines(localOrder)
    setOrderMode(false)
    setRecommendation(null)
    setSavingOrder(false)
  }

  // 정산 계산 (순수 함수)
  const settlement = calcSettlement({
    rsvps, allMembers, costItems, penalties,
    carryoverFromPrev: session?.subsidy_carryover ?? 0,
  })
  const dataLoaded = rsvpsLoaded && membersLoaded
  const myPenalty = penalties.find((p) => p.user_id === user?.id)
  const myRsvpRow = user ? rsvps.find((r) => r.user_id === user.id) : undefined

  // RSVP 마감 계산
  const deadline = session?.rsvp_deadline ? new Date(session.rsvp_deadline) : null
  const isDeadlinePassed = deadline ? new Date() > deadline : false
  const dDiff = deadline ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

  if (!session) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-pulse">🍷</div></div>
  }

  // ─── 헤더 (공통) ────────────────────────────────────────────────
  const Header = (
    <div className="px-4 py-4 border-b border-border bg-card shrink-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-primary">{session.title}</h1>
          <p className="text-xs text-muted-foreground">{statusLabel[session.status]}</p>
        </div>
        <div className="text-right space-y-0.5">
          {session.scheduled_at && (
            <p className="text-xs text-muted-foreground">
              {new Date(session.scheduled_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {session.venue && <p className="text-xs text-muted-foreground">📍 {session.venue}</p>}
        </div>
      </div>
      {user?.is_admin && !showEdit && (
        <div className="flex items-center gap-3 mt-1">
          <button onClick={openEdit} className="text-xs text-primary/60">✏️ 모임 정보 수정</button>
          <button onClick={copyKakaoReminder} className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${reminderCopied ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}`}>
            {reminderCopied ? '✓ 복사됨!' : '📋 카톡 리마인드 복사'}
          </button>
        </div>
      )}
      {showEdit && (
        <div className="mt-3 space-y-2 bg-muted rounded-xl p-3">
          <Input placeholder="모임 이름" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          <Input placeholder="장소 (선택)" value={editVenue} onChange={(e) => setEditVenue(e.target.value)} />
          <Input placeholder="설명 (선택)" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          <div className="flex gap-2">
            <div className="flex-1 space-y-0.5">
              <p className="text-[10px] text-muted-foreground">모임 날짜</p>
              <Input type="datetime-local" value={editScheduledAt} onChange={(e) => setEditScheduledAt(e.target.value)} />
            </div>
            <div className="flex-1 space-y-0.5">
              <p className="text-[10px] text-muted-foreground">투표 마감</p>
              <Input type="datetime-local" value={editRsvpDeadline} onChange={(e) => setEditRsvpDeadline(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit} disabled={!editTitle.trim() || savingEdit} className="flex-1">
              {savingEdit ? '저장 중...' : '저장'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowEdit(false)} className="flex-1">취소</Button>
          </div>
        </div>
      )}

      {/* RSVP */}
      <div className="mt-3 space-y-2">
        {deadline && (
          <div className={`flex items-center gap-2 text-xs ${isDeadlinePassed ? 'text-destructive' : dDiff! <= 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
            <span>
              {isDeadlinePassed
                ? '✕ 참석 투표 마감됨'
                : `⏰ 투표 마감 D-${dDiff} (${deadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })})`}
            </span>
            {user?.is_admin && !isDeadlinePassed && (
              <button onClick={sendReminderPush} className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                📣 리마인더 발송
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <button onClick={() => handleRsvp('attending')}
              disabled={isDeadlinePassed && myRsvp !== 'not_attending'}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${myRsvp === 'attending' ? 'bg-green-500 text-white border-green-500' : 'border-border text-muted-foreground'} ${isDeadlinePassed && myRsvp !== 'not_attending' ? 'opacity-40 cursor-not-allowed' : ''}`}>
              ✓ 참석
            </button>
            <button onClick={() => handleRsvp('not_attending')}
              disabled={isDeadlinePassed && myRsvp !== 'attending'}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${myRsvp === 'not_attending' ? 'bg-muted text-foreground border-foreground/30' : 'border-border text-muted-foreground'} ${isDeadlinePassed && myRsvp !== 'attending' ? 'opacity-40 cursor-not-allowed' : ''}`}>
              ✕ 불참{isDeadlinePassed && myRsvp === 'attending' && calcPenalty(session.scheduled_at) ? ` (불참비 ${calcPenalty(session.scheduled_at)!.amount.toLocaleString()}원)` : ''}
            </button>
          </div>
          {allMembers.length > 0 && (
            <span className="text-xs text-muted-foreground">
              참석 {settlement.attendingCount}명 · 불참 {settlement.notAttendingList.length}명 · 미투표 {settlement.unvotedMembers.length}명 / 전체 {settlement.totalActiveMembers}명
            </span>
          )}
        </div>
        {(rsvps.length > 0 || settlement.unvotedMembers.length > 0) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {settlement.attendingList.map((r) => (
              <button key={r.id}
                onClick={() => user?.is_admin ? adminToggleRsvp(r.user_id, 'attending') : undefined}
                className={`text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full ${user?.is_admin ? 'active:opacity-60' : ''}`}>
                ✓ {(r as any).user?.nickname ?? '멤버'}
              </button>
            ))}
            {settlement.notAttendingList.map((r) => (
              <button key={r.id}
                onClick={() => user?.is_admin ? adminToggleRsvp(r.user_id, 'not_attending') : undefined}
                className={`text-[11px] bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-full ${user?.is_admin ? 'active:opacity-60' : ''}`}>
                ✕ {(r as any).user?.nickname ?? '멤버'}
              </button>
            ))}
            {settlement.unvotedMembers.map((m) => (
              <button key={m.id}
                onClick={() => user?.is_admin ? adminToggleRsvp(m.id, null) : undefined}
                className={`text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full ${user?.is_admin ? 'active:opacity-60' : ''}`}>
                ? {m.nickname}
              </button>
            ))}
          </div>
        )}
        {myPenalty && (
          <p className="text-xs text-destructive font-medium">
            ⚠️ 마감 후 취소 불참비 {myPenalty.amount.toLocaleString()}원 ({myPenalty.reason}) 부과됨
          </p>
        )}
      </div>
    </div>
  )

  // ─── 일반 멤버: 헤더(RSVP) + 와인 목록(퀵 레이팅) + 정산 ────────
  if (!user?.is_admin) {
    // 확정 스냅샷 우선, 없으면(구버전 세션) 실시간 계산 폴백
    const memberSnap = session.settlement_snapshot ?? buildSnapshot(settlement, costItems)
    const showSettlement = session.settlement_published &&
      (session.settlement_snapshot != null || costItems.length > 0)

    return (
      <div className="flex flex-col h-[calc(100vh-5rem)]">
        {Header}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {wines.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <div className="text-4xl">🫙</div>
              <p className="text-sm text-muted-foreground">아직 와인 목록이 없어요</p>
            </div>
          ) : (
            <>
              {(() => {
                const hasOrder = wines.some(sw => ((sw as any).order_index ?? 0) > 0)
                return (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {hasOrder ? '✨ 오늘의 시음 순서' : '이번 모임 와인'}
                    </p>
                    {wines.map((sw, i) => (
                      <div key={sw.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {hasOrder && (
                              <span className="text-lg font-bold text-primary/40 w-5 mt-0.5 shrink-0">{i + 1}</span>
                            )}
                            <div>
                              <p className="font-medium text-sm">{sw.wine?.name ?? '이름 없음'}</p>
                              <p className="text-xs text-muted-foreground">
                                {[sw.wine?.producer, sw.wine?.region, sw.wine?.vintage ? `${sw.wine.vintage}년` : null].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>
                          <Badge variant={sw.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs shrink-0">
                            {sw.status === 'confirmed' ? '확정' : '제안'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <QuickRating
                            rating={myNotes[sw.wine_id]?.rating ?? null}
                            onRate={(n) => quickRate(sw.wine_id, n)}
                            disabled={savingNoteWineId === sw.wine_id}
                          />
                          <Link href={`/notes/new?wine_id=${sw.wine_id}&session_id=${id}`}
                            className="text-xs text-primary font-medium shrink-0">
                            ✏️ {myNotes[sw.wine_id] ? '시음평 이어쓰기' : '시음평 쓰기'}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </>
                )
              })()}
            </>
          )}

          {/* 정산 내역 - 관리자가 확정·공개한 경우만 표시 */}
          {showSettlement && (
            <MemberSettlement
              snap={memberSnap}
              confirmed={session.settlement_snapshot != null}
              userId={user?.id}
              isAttending={myRsvp === 'attending'}
              paidAt={myRsvpRow?.paid_at ?? null}
              paymentInfo={paymentInfo}
            />
          )}
        </div>
      </div>
    )
  }

  // ─── 관리자: 와인 + 정산 탭 ─────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {Header}

      {/* 탭 */}
      <div className="px-4 pt-3 pb-0 border-b border-border bg-card shrink-0 flex gap-2">
        {([['wines', `🍾 와인 (${wines.length})`], ['settlement', '💰 정산']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-sm px-3 py-1.5 rounded-t-lg transition-colors font-medium ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 와인 탭 */}
      {tab === 'wines' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">제안된 와인 목록</p>
            <div className="flex gap-2">
              <button onClick={() => setShowAddWine(!showAddWine)} className="text-xs text-primary font-medium">+ 이름으로 제안</button>
              <Link href={`/scan?session_id=${id}`} className="text-xs text-muted-foreground">라벨 스캔</Link>
            </div>
          </div>
          {showAddWine && (
            <div className="bg-muted rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <Input placeholder="ex. Coulée de Serrant 2019" value={newWineName}
                  onChange={(e) => setNewWineName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addWineByName() }}
                  className="flex-1" autoFocus />
                <Button size="sm" onClick={addWineByName} disabled={!newWineName.trim() || addingWine}>
                  {addingWine ? '...' : '추가'}
                </Button>
              </div>
            </div>
          )}

          {/* 순서 추천 */}
          {wines.length >= 2 && !orderMode && (
            <button
              onClick={recommendOrder}
              disabled={recommending}
              className="w-full text-xs py-2 rounded-xl border border-primary/30 text-primary font-medium bg-primary/5 disabled:opacity-50"
            >
              {recommending ? '✨ AI 분석 중...' : '✨ 음용 순서 AI 추천'}
            </button>
          )}

          {/* 순서 편집 모드 */}
          {orderMode && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-primary">AI 추천 순서 — 조정 후 저장하세요</p>
                <button
                  onClick={() => { setOrderMode(false); setRecommendation(null) }}
                  className="text-xs text-muted-foreground"
                >
                  취소
                </button>
              </div>
              {localOrder.map((sw, i) => {
                const reason = recommendation?.find((r) => r.session_wine_id === sw.id)?.reason
                return (
                  <div key={sw.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
                    <span className="text-lg font-bold text-primary/40 w-5 text-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{sw.wine?.name ?? '이름 없음'}</p>
                      {reason && <p className="text-xs text-muted-foreground truncate">{reason}</p>}
                    </div>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveWine(i, -1)}
                        disabled={i === 0}
                        className="text-xs px-1.5 py-0.5 rounded bg-muted disabled:opacity-20"
                      >▲</button>
                      <button
                        onClick={() => moveWine(i, 1)}
                        disabled={i === localOrder.length - 1}
                        className="text-xs px-1.5 py-0.5 rounded bg-muted disabled:opacity-20"
                      >▼</button>
                    </div>
                  </div>
                )
              })}
              <Button size="sm" onClick={saveOrder} disabled={savingOrder} className="w-full">
                {savingOrder ? '저장 중...' : '이 순서로 저장'}
              </Button>
            </div>
          )}

          {wines.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <div className="text-4xl">🫙</div>
              <p className="text-sm text-muted-foreground">아직 와인이 없어요</p>
              <button onClick={() => setShowAddWine(true)} className="text-primary text-sm underline">와인 제안하기</button>
            </div>
          ) : (
            wines.map((sw, i) => (
              <div key={sw.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {wines.length > 1 && (
                      <span className="text-xs text-muted-foreground font-medium w-4 mt-0.5 shrink-0">{i + 1}</span>
                    )}
                    <div>
                      <p className="font-medium text-sm">{sw.wine?.name ?? '이름 없음'}</p>
                      <p className="text-xs text-muted-foreground">
                        {[(sw as any).user?.nickname && `제안: ${(sw as any).user?.nickname}`, sw.wine?.producer, sw.wine?.vintage].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={sw.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs shrink-0">
                    {sw.status === 'confirmed' ? '확정' : '제안'}
                  </Badge>
                </div>
                <QuickRating
                  rating={myNotes[sw.wine_id]?.rating ?? null}
                  onRate={(n) => quickRate(sw.wine_id, n)}
                  disabled={savingNoteWineId === sw.wine_id}
                />
                <div className="flex gap-3">
                  <Link href={`/notes/new?wine_id=${sw.wine_id}&session_id=${id}`} className="text-xs text-primary font-medium">시음평 쓰기</Link>
                  <Link href={`/wines/${sw.wine_id}`} className="text-xs text-muted-foreground font-medium">정보 수정</Link>
                  {sw.status !== 'confirmed' && (
                    <button onClick={() => confirmWine(sw.id)} className="text-xs text-green-600 font-medium">확정</button>
                  )}
                  <button onClick={() => removeWine(sw.id)} className="text-xs text-destructive font-medium">제거</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 정산 탭 */}
      {tab === 'settlement' && (
        <SettlementTab
          sessionId={id}
          session={session}
          settlement={settlement}
          costItems={costItems}
          penalties={penalties}
          allMembers={allMembers}
          dataLoaded={dataLoaded}
          onSessionChange={(patch) => setSession((prev) => prev ? { ...prev, ...patch } : prev)}
          refetchCostItems={fetchCostItems}
          refetchPenalties={fetchPenalties}
          refetchRsvps={fetchRsvps}
        />
      )}
    </div>
  )
}
