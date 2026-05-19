'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase, Session, SessionWine, SessionRsvp, CostItem, SessionPenalty } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const statusLabel: Record<string, string> = {
  planning: '준비 중', active: '진행 중', completed: '완료',
}
const categoryLabel: Record<string, string> = {
  wine: '🍷 와인', venue: '🏠 장소', taxi: '🚕 택시', food: '🍽️ 음식', other: '기타',
}
const SUBSIDY_PER_PERSON = 35000
type Tab = 'wines' | 'settlement'

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useUser()
  const [session, setSession] = useState<Session | null>(null)
  const [wines, setWines] = useState<SessionWine[]>([])
  const [rsvps, setRsvps] = useState<SessionRsvp[]>([])
  const [myRsvp, setMyRsvp] = useState<'attending' | 'not_attending' | null>(null)
  const [costItems, setCostItems] = useState<CostItem[]>([])
  const [totalActiveMembers, setTotalActiveMembers] = useState(0)
  const [tab, setTab] = useState<Tab>('wines')
  // 와인 추가
  const [showAddWine, setShowAddWine] = useState(false)
  const [newWineName, setNewWineName] = useState('')
  const [addingWine, setAddingWine] = useState(false)
  // 비용 추가
  const [newRound, setNewRound] = useState(1)
  const [newCategory, setNewCategory] = useState<CostItem['category']>('wine')
  const [newDescription, setNewDescription] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [addingCost, setAddingCost] = useState(false)
  const [showCostForm, setShowCostForm] = useState(false)
  // 이월 지원금
  const [carryoverInput, setCarryoverInput] = useState('0')
  const [savingCarryover, setSavingCarryover] = useState(false)
  // 벌금
  const [penalties, setPenalties] = useState<SessionPenalty[]>([])
  // 정산 공개
  const [publishingSettlement, setPublishingSettlement] = useState(false)
  // 후기 생성
  const [generatingReview, setGeneratingReview] = useState(false)
  const [review, setReview] = useState('')
  // 모임 정보 수정
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editVenue, setEditVenue] = useState('')
  const [editScheduledAt, setEditScheduledAt] = useState('')
  const [editRsvpDeadline, setEditRsvpDeadline] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  // 음용 순서
  type OrderItem = { session_wine_id: string; reason: string }
  const [recommending, setRecommending] = useState(false)
  const [recommendation, setRecommendation] = useState<OrderItem[] | null>(null)
  const [orderMode, setOrderMode] = useState(false)
  const [localOrder, setLocalOrder] = useState<SessionWine[]>([])
  const [savingOrder, setSavingOrder] = useState(false)

  useEffect(() => {
    supabase.from('sessions').select('*').eq('id', id).single()
      .then(({ data }) => {
        const s = data as Session
        setSession(s)
        setCarryoverInput(String(s?.subsidy_carryover ?? 0))
      })
    fetchWines()
    fetchRsvps()
    fetchCostItems()
    fetchPenalties()
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true)
      .then(({ count }) => setTotalActiveMembers(count ?? 0))
  }, [id])

  useEffect(() => {
    if (user) setMyRsvp(rsvps.find((r) => r.user_id === user.id)?.status ?? null)
  }, [rsvps, user])

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

  function calcPenalty(scheduledAt: string | null): { amount: number; label: string } | null {
    if (!scheduledAt) return null
    const daysUntil = Math.ceil((new Date(scheduledAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysUntil <= 0) return { amount: 20000, label: 'D-day' }
    if (daysUntil === 1) return { amount: 10000, label: 'D-1' }
    if (daysUntil <= 7) return { amount: 5000, label: `D-${daysUntil}` }
    return null
  }

  async function handleRsvp(status: 'attending' | 'not_attending') {
    if (!user) return

    // 마감 후 취소: 벌금 안내 후 기록
    if (isDeadlinePassed && status === 'not_attending' && myRsvp === 'attending') {
      const penalty = calcPenalty(session?.scheduled_at ?? null)
      const msg = penalty
        ? `투표 마감 후 취소입니다.\n${penalty.label} 기준 벌금 ${penalty.amount.toLocaleString()}원이 부과됩니다.\n계속하시겠어요?`
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

  async function addCostItem() {
    const amount = parseInt(newAmount.replace(/,/g, ''))
    if (isNaN(amount) || amount <= 0 || !user) return
    setAddingCost(true)
    await supabase.from('session_cost_items').insert({
      session_id: id, round_number: newRound, category: newCategory,
      description: newDescription.trim() || null, amount,
    })
    setNewAmount(''); setNewDescription(''); setShowCostForm(false)
    await fetchCostItems()
    setAddingCost(false)
  }

  async function deleteCostItem(itemId: string) {
    await supabase.from('session_cost_items').delete().eq('id', itemId)
    setCostItems((prev) => prev.filter((c) => c.id !== itemId))
  }

  async function saveCarryover() {
    const val = parseInt(carryoverInput.replace(/,/g, '')) || 0
    setSavingCarryover(true)
    await supabase.from('sessions').update({ subsidy_carryover: val }).eq('id', id)
    setSession((prev) => prev ? { ...prev, subsidy_carryover: val } : prev)
    setSavingCarryover(false)
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
        headers: { 'Content-Type': 'application/json' },
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

  async function toggleSettlementPublished() {
    if (!session) return
    setPublishingSettlement(true)
    const newVal = !session.settlement_published
    await supabase.from('sessions').update({ settlement_published: newVal }).eq('id', id)

    // 공개 시 다음 모임의 전월 이월 자동 업데이트
    if (newVal && session.scheduled_at) {
      const { data: nextSession } = await supabase
        .from('sessions')
        .select('id')
        .gt('scheduled_at', session.scheduled_at)
        .in('status', ['planning', 'active'])
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (nextSession) {
        await supabase.from('sessions')
          .update({ subsidy_carryover: carryoverToNext })
          .eq('id', nextSession.id)
      }
    }

    setSession((prev) => prev ? { ...prev, settlement_published: newVal } : prev)
    setPublishingSettlement(false)
  }

  async function recommendOrder() {
    setRecommending(true)
    setRecommendation(null)
    try {
      const res = await fetch('/api/recommend-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        supabase.from('session_wines').update({ order_index: i }).eq('id', sw.id)
      )
    )
    setWines(localOrder)
    setOrderMode(false)
    setRecommendation(null)
    setSavingOrder(false)
  }

  async function generateReview() {
    setGeneratingReview(true)
    setReview('')
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      })
      const json = await res.json()
      setReview(json.success ? json.review : '후기 생성에 실패했어요.')
    } catch {
      setReview('후기 생성에 실패했어요.')
    }
    setGeneratingReview(false)
  }

  // 정산 계산
  const attendingList = rsvps.filter((r) => r.status === 'attending')
  const notAttendingList = rsvps.filter((r) => r.status === 'not_attending')
  const attendingCount = attendingList.length
  // 정산용: 미투표자도 불참 처리 (지원금 반액 적립)
  const notAttendingCount = Math.max(0, totalActiveMembers - attendingCount)
  const subsidyAttending = attendingCount * SUBSIDY_PER_PERSON
  const subsidyNotAttending = notAttendingCount * (SUBSIDY_PER_PERSON / 2)
  const carryoverFromPrev = session?.subsidy_carryover ?? 0
  const totalSubsidy = subsidyAttending + subsidyNotAttending + carryoverFromPrev
  const carryoverToNext = notAttendingCount * (SUBSIDY_PER_PERSON / 2)
  const rounds = [...new Set(costItems.map((c) => c.round_number))].sort((a, b) => a - b)
  const totalCosts = costItems.reduce((sum, c) => sum + c.amount, 0)
  const totalPenalties = penalties.reduce((sum, p) => sum + p.amount, 0)
  const selfPay = Math.max(0, totalCosts - totalSubsidy - totalPenalties)
  const perPerson = attendingCount > 0 ? Math.ceil(selfPay / attendingCount) : 0
  const myPenalty = penalties.find((p) => p.user_id === user?.id)

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
        <button onClick={openEdit} className="text-xs text-primary/60 mt-1">✏️ 모임 정보 수정</button>
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
              ✕ 불참{isDeadlinePassed && myRsvp === 'attending' && calcPenalty(session.scheduled_at) ? ` (벌금 ${calcPenalty(session.scheduled_at)!.amount.toLocaleString()}원)` : ''}
            </button>
          </div>
          {rsvps.length > 0 && (
            <span className="text-xs text-muted-foreground">참석 {attendingCount}명 · 불참 {notAttendingList.length}명 / 전체 {totalActiveMembers}명</span>
          )}
        </div>
        {rsvps.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {attendingList.map((r) => (
              <span key={r.id} className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                ✓ {(r as any).user?.nickname ?? '멤버'}
              </span>
            ))}
            {notAttendingList.map((r) => (
              <span key={r.id} className="text-[11px] bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-full">
                ✕ {(r as any).user?.nickname ?? '멤버'}
              </span>
            ))}
          </div>
        )}
        {myPenalty && (
          <p className="text-xs text-destructive font-medium">
            ⚠️ 마감 후 취소 벌금 {myPenalty.amount.toLocaleString()}원 ({myPenalty.reason}) 부과됨
          </p>
        )}
      </div>
    </div>
  )

  // ─── 일반 멤버: 헤더(RSVP) + 와인 목록 + 정산 요약 ──────────────
  if (!user?.is_admin) {
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
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">이번 모임 와인</p>
              {wines.map((sw) => (
                <div key={sw.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{sw.wine?.name ?? '이름 없음'}</p>
                      <p className="text-xs text-muted-foreground">
                        {[sw.wine?.producer, sw.wine?.region, sw.wine?.vintage ? `${sw.wine.vintage}년` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Badge variant={sw.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs shrink-0">
                      {sw.status === 'confirmed' ? '확정' : '제안'}
                    </Badge>
                  </div>
                  <Link href={`/notes/new?wine_id=${sw.wine_id}&session_id=${id}`}
                    className="inline-block text-xs text-primary font-medium">
                    ✏️ 시음평 쓰기
                  </Link>
                </div>
              ))}
            </>
          )}

          {/* 정산 요약 - 관리자가 공개한 경우만 표시 */}
          {session.settlement_published && costItems.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-sm font-semibold">💰 정산 내역</p>

              {/* 비용 항목 */}
              <div className="bg-muted rounded-xl p-4 space-y-1.5 text-xs">
                {costItems.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {item.round_number}차 {categoryLabel[item.category].replace(/^.\s/, '')}
                      {item.description ? ` · ${item.description}` : ''}
                    </span>
                    <span>{item.amount.toLocaleString()}원</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold border-t border-border pt-2 mt-1">
                  <span>총 비용</span>
                  <span>{totalCosts.toLocaleString()}원</span>
                </div>
              </div>

              {/* 지원금 내역 */}
              <div className="bg-muted rounded-xl p-4 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">당월 참석자 지원금 ({attendingCount}명 × 35,000)</span>
                  <span className="text-green-600">{subsidyAttending.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">당월 불참석자 1/2 ({notAttendingCount}명 × 17,500)</span>
                  <span className="text-green-600">{subsidyNotAttending.toLocaleString()}원</span>
                </div>
                {carryoverFromPrev > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">전월 이월 지원금</span>
                    <span className="text-green-600">{carryoverFromPrev.toLocaleString()}원</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t border-border pt-2 mt-1">
                  <span>총 지원금</span>
                  <span className="text-green-600">- {totalSubsidy.toLocaleString()}원</span>
                </div>
                {totalPenalties > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">벌금 (풀 투입)</span>
                    <span className="text-destructive">- {totalPenalties.toLocaleString()}원</span>
                  </div>
                )}
              </div>

              {/* 1인당 */}
              {attendingCount > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
                  <p className="text-xs text-muted-foreground">참석자 실 부담금 · 1인당</p>
                  <p className="text-3xl font-bold text-primary mt-1">{perPerson.toLocaleString()}원</p>
                </div>
              )}
            </div>
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
                <div className="flex gap-3">
                  <Link href={`/notes/new?wine_id=${sw.wine_id}&session_id=${id}`} className="text-xs text-primary font-medium">시음평 쓰기</Link>
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
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* 참석자 현황 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">참석자 현황</p>
            <div className="flex flex-wrap gap-2">
              {attendingList.map((r) => (
                <span key={r.id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-full">
                  ✓ {(r as any).user?.nickname ?? '멤버'}
                </span>
              ))}
              {notAttendingList.map((r) => (
                <span key={r.id} className="text-xs bg-muted text-muted-foreground border border-border px-2 py-1 rounded-full">
                  ✕ {(r as any).user?.nickname ?? '멤버'}
                </span>
              ))}
              {rsvps.length === 0 && <p className="text-sm text-muted-foreground">아직 응답이 없어요</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              참석 {attendingCount}명 · 불참(투표) {notAttendingList.length}명 · 미응답 {Math.max(0, totalActiveMembers - rsvps.length)}명 / 전체 {totalActiveMembers}명
            </p>
          </div>

          {/* 비용 항목 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">비용 항목</p>
              <button onClick={() => setShowCostForm(!showCostForm)} className="text-xs text-primary font-medium">+ 추가</button>
            </div>
            {showCostForm && (
              <div className="bg-muted rounded-xl p-3 space-y-2">
                <div className="flex gap-2">
                  <select value={newRound} onChange={(e) => setNewRound(Number(e.target.value))}
                    className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background">
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}차</option>)}
                  </select>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value as CostItem['category'])}
                    className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background flex-1">
                    {Object.entries(categoryLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <Input placeholder="메모 (선택)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
                <div className="flex gap-2">
                  <Input placeholder="금액 (원)" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} type="number" className="flex-1" />
                  <Button size="sm" onClick={addCostItem} disabled={!newAmount || addingCost}>{addingCost ? '...' : '추가'}</Button>
                </div>
              </div>
            )}
            {rounds.length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 비용이 없어요</p>
            ) : (
              rounds.map((round) => {
                const items = costItems.filter((c) => c.round_number === round)
                const roundTotal = items.reduce((s, c) => s + c.amount, 0)
                return (
                  <div key={round} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground">{round}차</p>
                      <p className="text-xs font-semibold">{roundTotal.toLocaleString()}원</p>
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                        <div>
                          <span className="text-xs">{categoryLabel[item.category]}</span>
                          {item.description && <span className="text-xs text-muted-foreground ml-1">· {item.description}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{item.amount.toLocaleString()}원</span>
                          <button onClick={() => deleteCostItem(item.id)} className="text-xs text-destructive">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </div>

          {/* 지원금 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">지원금</p>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground whitespace-nowrap">전월 이월</span>
              <Input value={carryoverInput} onChange={(e) => setCarryoverInput(e.target.value)} type="number" className="flex-1" placeholder="0" />
              <Button size="sm" onClick={saveCarryover} disabled={savingCarryover}>{savingCarryover ? '...' : '저장'}</Button>
            </div>
            <div className="bg-muted rounded-xl p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">참석자 지원금 ({attendingCount}명 × 35,000)</span>
                <span>{subsidyAttending.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">불참자 지원금 1/2 ({notAttendingCount}명 × 17,500)</span>
                <span>{subsidyNotAttending.toLocaleString()}원</span>
              </div>
              {carryoverFromPrev > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">전월 이월</span>
                  <span>{carryoverFromPrev.toLocaleString()}원</span>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1">
                <span>총 지원금</span>
                <span className="text-green-600">{totalSubsidy.toLocaleString()}원</span>
              </div>
            </div>
          </div>

          {/* 벌금 내역 */}
          {penalties.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">⚠️ 벌금 내역</p>
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 space-y-1.5 text-xs">
                {penalties.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span className="text-muted-foreground">
                      {(p as any).user?.nickname ?? '멤버'} · {p.reason} 취소
                    </span>
                    <span className="text-destructive font-medium">- {p.amount.toLocaleString()}원</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold border-t border-destructive/20 pt-1.5 mt-1">
                  <span>벌금 합계 (정산 풀 투입)</span>
                  <span className="text-destructive">- {totalPenalties.toLocaleString()}원</span>
                </div>
              </div>
            </div>
          )}

          {/* 최종 정산 */}
          {totalCosts > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-semibold">최종 정산</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">총 비용</span><span>{totalCosts.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">총 지원금</span>
                  <span className="text-green-600">- {totalSubsidy.toLocaleString()}원</span>
                </div>
                {totalPenalties > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">벌금 (풀 투입)</span>
                    <span className="text-destructive">- {totalPenalties.toLocaleString()}원</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t border-primary/20 pt-1.5 mt-1">
                  <span>실부담금</span><span>{selfPay.toLocaleString()}원</span>
                </div>
              </div>
              {attendingCount > 0 && (
                <div className="text-center pt-2 border-t border-primary/20">
                  <p className="text-xs text-muted-foreground">1인당 ({attendingCount}명)</p>
                  <p className="text-2xl font-bold text-primary">{perPerson.toLocaleString()}원</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    수거 예상: {(perPerson * attendingCount).toLocaleString()}원
                    {perPerson * attendingCount !== selfPay && ` (차액 +${(perPerson * attendingCount - selfPay).toLocaleString()}원 이월 처리)`}
                  </p>
                </div>
              )}
              {/* 카톡 공지 복사 */}
              {attendingCount > 0 && (
                <button
                  onClick={() => {
                    const dateStr = session.scheduled_at
                      ? new Date(session.scheduled_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
                      : ''
                    const roundLines = rounds.map((r) => {
                      const items = costItems.filter((c) => c.round_number === r)
                      return items.map((item) => `  · ${item.description || categoryLabel[item.category].replace(/^[^\s]+ /, '')} ${item.amount.toLocaleString()}원`).join('\n')
                    }).join('\n')
                    const msg = [
                      `🍷 ${session.title} 정산 안내`,
                      dateStr ? `📅 ${dateStr}` : '',
                      '',
                      `참석 ${attendingCount}명 / 전체 ${totalActiveMembers}명`,
                      '',
                      '💰 비용 내역',
                      roundLines,
                      `합계: ${totalCosts.toLocaleString()}원`,
                      '',
                      `회사 지원금: ${totalSubsidy.toLocaleString()}원`,
                      `실 부담금: ${selfPay.toLocaleString()}원`,
                      '',
                      `✅ 1인당 ${perPerson.toLocaleString()}원`,
                    ].filter((l) => l !== undefined).join('\n')
                    navigator.clipboard.writeText(msg)
                    alert('카톡 공지 문구가 복사됐어요!')
                  }}
                  className="w-full mt-2 text-xs text-primary font-medium bg-primary/10 py-2 rounded-lg"
                >
                  📋 카톡 공지 복사
                </button>
              )}
            </div>
          )}

          {/* 익월 이월 */}
          {notAttendingCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs space-y-0.5">
              <p className="font-semibold text-amber-800">익월 이월 지원금</p>
              <p className="text-amber-700">불참 {notAttendingCount}명 × 17,500원 = <span className="font-bold">{carryoverToNext.toLocaleString()}원</span></p>
              <p className="text-amber-600">정산 공개 시 다음 모임에 자동 반영돼요</p>
            </div>
          )}

          {/* 멤버 공개 토글 */}
          {totalCosts > 0 && (
            <button
              onClick={toggleSettlementPublished}
              disabled={publishingSettlement}
              className={`w-full py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                session.settlement_published
                  ? 'bg-green-500 text-white border-green-500'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {publishingSettlement ? '처리 중...' : session.settlement_published ? '✓ 멤버에게 정산 공개 중 (탭하여 숨기기)' : '멤버에게 정산 공개하기'}
            </button>
          )}

          {/* AI 후기 */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div>
              <p className="text-sm font-semibold">모임 후기 자동 생성</p>
              <p className="text-xs text-muted-foreground mt-0.5">시음평을 바탕으로 회사 게시판용 후기를 AI가 작성해요</p>
            </div>
            <Button onClick={generateReview} disabled={generatingReview} className="w-full">
              {generatingReview ? '✍️ 작성 중...' : '✍️ 후기 생성하기'}
            </Button>
            {review && (
              <div className="space-y-2">
                <div className="bg-muted rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed">{review}</div>
                <button onClick={() => navigator.clipboard.writeText(review)} className="text-xs text-primary font-medium">📋 복사하기</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
