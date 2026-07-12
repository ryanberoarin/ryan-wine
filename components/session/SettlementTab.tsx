'use client'

import { useState } from 'react'
import { supabase, Session, SessionRsvp, SessionPenalty, CostItem, User } from '@/lib/supabase'
import { getDeviceToken } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Settlement, CATEGORY_LABEL, buildSnapshot } from '@/lib/settlement'

type Props = {
  sessionId: string
  session: Session
  settlement: Settlement
  costItems: CostItem[]
  penalties: SessionPenalty[]
  allMembers: User[]
  dataLoaded: boolean
  onSessionChange: (patch: Partial<Session>) => void
  refetchCostItems: () => Promise<void>
  refetchPenalties: () => Promise<void>
  refetchRsvps: () => Promise<void>
}

export default function SettlementTab({
  sessionId, session, settlement: s, costItems, penalties, allMembers, dataLoaded,
  onSessionChange, refetchCostItems, refetchPenalties, refetchRsvps,
}: Props) {
  // 비용 추가
  const [newRound, setNewRound] = useState(1)
  const [newCategory, setNewCategory] = useState<CostItem['category']>('wine')
  const [newDescription, setNewDescription] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [addingCost, setAddingCost] = useState(false)
  const [showCostForm, setShowCostForm] = useState(false)
  // 이월 지원금
  const [carryoverInput, setCarryoverInput] = useState(String(session.subsidy_carryover ?? 0))
  const [savingCarryover, setSavingCarryover] = useState(false)
  // 벌금
  const [showAddPenalty, setShowAddPenalty] = useState(false)
  const [newPenaltyUserId, setNewPenaltyUserId] = useState('')
  const [newPenaltyAmount, setNewPenaltyAmount] = useState('')
  const [newPenaltyReason, setNewPenaltyReason] = useState('D-day')
  const [addingPenalty, setAddingPenalty] = useState(false)
  // 정산 확정
  const [publishing, setPublishing] = useState(false)
  // 차수별 참석 저장 중인 userId
  const [savingRounds, setSavingRounds] = useState<string | null>(null)
  // 입금 확인 저장 중인 rsvp id
  const [savingPaid, setSavingPaid] = useState<string | null>(null)
  // 후기 생성
  const [generatingReview, setGeneratingReview] = useState(false)
  const [review, setReview] = useState('')

  async function addCostItem() {
    const amount = parseInt(newAmount.replace(/,/g, ''))
    if (isNaN(amount) || amount <= 0) return
    setAddingCost(true)
    await supabase.from('session_cost_items').insert({
      session_id: sessionId, round_number: newRound, category: newCategory,
      description: newDescription.trim() || null, amount,
    })
    setNewAmount(''); setNewDescription(''); setShowCostForm(false)
    await refetchCostItems()
    setAddingCost(false)
  }

  async function deleteCostItem(itemId: string) {
    await supabase.from('session_cost_items').delete().eq('id', itemId)
    await refetchCostItems()
  }

  async function saveCarryover() {
    const val = parseInt(carryoverInput.replace(/,/g, '')) || 0
    setSavingCarryover(true)
    await supabase.from('sessions').update({ subsidy_carryover: val }).eq('id', sessionId)
    onSessionChange({ subsidy_carryover: val })
    setSavingCarryover(false)
  }

  async function addManualPenalty() {
    if (!newPenaltyUserId || !newPenaltyAmount) return
    const amount = parseInt(newPenaltyAmount.replace(/,/g, ''))
    if (isNaN(amount) || amount <= 0) return
    setAddingPenalty(true)
    await supabase.from('session_penalties').insert({
      session_id: sessionId, user_id: newPenaltyUserId, amount, reason: newPenaltyReason,
    })
    await refetchPenalties()
    setNewPenaltyUserId(''); setNewPenaltyAmount(''); setNewPenaltyReason('D-day')
    setShowAddPenalty(false)
    setAddingPenalty(false)
  }

  async function deletePenaltyById(penaltyId: string) {
    await supabase.from('session_penalties').delete().eq('id', penaltyId)
    await refetchPenalties()
  }

  async function toggleRound(userId: string, round: number, currentRounds: number[] | null) {
    const base = currentRounds ?? s.rounds
    const newRounds = base.includes(round)
      ? base.filter((r) => r !== round)
      : [...base, round].sort((a, b) => a - b)
    // 전체 차수 참석이면 null로 저장 (기본값)
    const toStore = newRounds.length === s.rounds.length ? null : newRounds
    setSavingRounds(userId)
    await supabase.from('session_rsvps')
      .update({ attended_rounds: toStore })
      .eq('session_id', sessionId).eq('user_id', userId)
    await refetchRsvps()
    setSavingRounds(null)
  }

  async function togglePaid(rsvp: SessionRsvp) {
    setSavingPaid(rsvp.id)
    const newVal = rsvp.paid_at ? null : new Date().toISOString()
    await supabase.from('session_rsvps').update({ paid_at: newVal }).eq('id', rsvp.id)
    await refetchRsvps()
    setSavingPaid(null)
  }

  async function syncCarryoverToNext(amount: number) {
    if (!session.scheduled_at) return
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
        .update({ subsidy_carryover: amount })
        .eq('id', nextSession.id)
    }
  }

  // 확정 = 스냅샷 저장 + 공개 + 다음 모임 이월 동기화.
  // 확정 후 데이터가 바뀌면 자동 반영하지 않고 '다시 확정'으로만 갱신한다.
  async function confirmSettlement() {
    setPublishing(true)
    const snap = buildSnapshot(s, costItems)
    const { error } = await supabase.from('sessions')
      .update({ settlement_published: true, settlement_snapshot: snap })
      .eq('id', sessionId)
    if (error) {
      alert(`정산 확정에 실패했어요: ${error.message}`)
    } else {
      await syncCarryoverToNext(snap.carryover_to_next)
      onSessionChange({ settlement_published: true, settlement_snapshot: snap })
    }
    setPublishing(false)
  }

  async function hideSettlement() {
    setPublishing(true)
    await supabase.from('sessions').update({ settlement_published: false }).eq('id', sessionId)
    onSessionChange({ settlement_published: false })
    setPublishing(false)
  }

  async function generateReview() {
    setGeneratingReview(true)
    setReview('')
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': getDeviceToken() },
        body: JSON.stringify({ sessionId }),
      })
      const json = await res.json()
      setReview(json.success ? json.review : '후기 생성에 실패했어요.')
    } catch {
      setReview('후기 생성에 실패했어요.')
    }
    setGeneratingReview(false)
  }

  function copyKakaoSettlement() {
    const dateStr = session.scheduled_at
      ? new Date(session.scheduled_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
      : ''
    const roundLines = s.rounds.map((r) => {
      const items = costItems.filter((c) => c.round_number === r)
      return items.map((item) => `  · ${item.description || (CATEGORY_LABEL[item.category] ?? item.category).replace(/^[^\s]+ /, '')} ${item.amount.toLocaleString()}원`).join('\n')
    }).join('\n')
    const settlementLines = s.hasRoundData
      ? s.attendeeGroups.map((g) => {
          const label = g.rounds.length === s.rounds.length ? '전체 참석' : `${g.rounds.join('+')}차만 참석`
          return `  · ${label} (${g.count}명): ${g.total.toLocaleString()}원`
        }).join('\n')
      : `  · 1인당 ${s.perPerson.toLocaleString()}원 (${s.attendingCount}명)`
    const penaltyLines = penalties.length > 0
      ? penalties.map((p) => `  · ${(p as any).user?.nickname ?? '멤버'}: ${p.amount.toLocaleString()}원 (${p.reason})`).join('\n')
      : ''
    const msg = [
      `🍷 ${session.title} 정산 안내`,
      dateStr ? `📅 ${dateStr}` : '',
      '',
      `참석 ${s.attendingCount}명 / 전체 ${s.totalActiveMembers}명`,
      '',
      '💰 비용 내역',
      roundLines,
      `합계: ${s.totalCosts.toLocaleString()}원`,
      '',
      `회사 지원금: ${s.totalSubsidy.toLocaleString()}원`,
      ...(s.totalPenalties > 0 ? [`불참비 (풀 투입): ${s.totalPenalties.toLocaleString()}원`] : []),
      `실 부담금: ${s.selfPay.toLocaleString()}원`,
      '',
      s.hasRoundData ? '✅ 정산 (참석 유형별 인당 금액)' : '✅ 정산',
      settlementLines,
      ...(penaltyLines ? ['', '⚠️ 불참비 대상 (개인 부담, 별도 입금)', penaltyLines] : []),
    ].filter((l) => l !== undefined).join('\n')
    navigator.clipboard.writeText(msg)
    alert('카톡 공지 문구가 복사됐어요!')
  }

  // 확정본과 현재 계산이 어긋났는지 (다시 확정 안내용)
  const snapshotStale = session.settlement_published && session.settlement_snapshot != null && (
    session.settlement_snapshot.self_pay !== s.selfPay ||
    session.settlement_snapshot.per_person !== s.perPerson ||
    session.settlement_snapshot.total_costs !== s.totalCosts ||
    session.settlement_snapshot.carryover_to_next !== s.carryoverToNext ||
    JSON.stringify(session.settlement_snapshot.member_shares) !== JSON.stringify(s.memberShares)
  )

  const paidCount = s.attendingList.filter((r) => r.paid_at).length

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {/* 참석자 현황 */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">참석자 현황</p>
        <div className="flex flex-wrap gap-2">
          {s.attendingList.map((r) => (
            <span key={r.id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-full">
              ✓ {(r as any).user?.nickname ?? '멤버'}
            </span>
          ))}
          {s.notAttendingList.map((r) => (
            <span key={r.id} className="text-xs bg-muted text-muted-foreground border border-border px-2 py-1 rounded-full">
              ✕ {(r as any).user?.nickname ?? '멤버'}
            </span>
          ))}
          {s.unvotedMembers.map((m) => (
            <span key={m.id} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full">
              ? {m.nickname}
            </span>
          ))}
          {s.attendingList.length === 0 && s.notAttendingList.length === 0 && s.unvotedMembers.length === 0 && (
            <p className="text-sm text-muted-foreground">아직 응답이 없어요</p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          참석 {s.attendingCount}명 · 불참 {s.notAttendingList.length}명 · 미투표 {s.unvotedMembers.length}명 / 전체 {s.totalActiveMembers}명
        </p>

        {/* 차수별 참석 설정 */}
        {s.attendingList.length > 0 && s.rounds.length > 0 && (
          <div className="bg-muted/60 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">차수별 참석 설정</p>
            {s.attendingList.map((rsvp) => {
              const ar = rsvp.attended_rounds
              const attendedRounds = ar ?? s.rounds
              return (
                <div key={rsvp.id} className="flex items-center gap-2">
                  <span className="text-xs font-medium w-16 shrink-0 truncate">{(rsvp as any).user?.nickname ?? '멤버'}</span>
                  <div className="flex gap-1">
                    {s.rounds.map((r) => (
                      <button
                        key={r}
                        onClick={() => toggleRound(rsvp.user_id, r, ar)}
                        disabled={savingRounds === rsvp.user_id}
                        className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                          attendedRounds.includes(r)
                            ? 'bg-green-500 text-white border-green-500'
                            : 'bg-background text-muted-foreground border-border'
                        } disabled:opacity-50`}
                      >
                        {r}차
                      </button>
                    ))}
                  </div>
                  {s.hasRoundData && (
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {(s.memberShares[rsvp.user_id] ?? 0).toLocaleString()}원
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <Input placeholder="메모 (선택)" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            <div className="flex gap-2">
              <Input placeholder="금액 (원)" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} type="number" className="flex-1" />
              <Button size="sm" onClick={addCostItem} disabled={!newAmount || addingCost}>{addingCost ? '...' : '추가'}</Button>
            </div>
          </div>
        )}
        {s.rounds.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 비용이 없어요</p>
        ) : (
          s.rounds.map((round) => {
            const items = costItems.filter((c) => c.round_number === round)
            const roundTotal = items.reduce((sum, c) => sum + c.amount, 0)
            return (
              <div key={round} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">{round}차</p>
                  <p className="text-xs font-semibold">{roundTotal.toLocaleString()}원</p>
                </div>
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                    <div>
                      <span className="text-xs">{CATEGORY_LABEL[item.category] ?? item.category}</span>
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
            <span className="text-muted-foreground">참석 지원금 (대상 {s.attendingEligibleCount}명 × 35,000)</span>
            <span>{s.subsidyAttending.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">불참 지원금 1/2 (대상 {s.notAttendingEligibleCount}명 × 17,500)</span>
            <span>{s.subsidyNotAttending.toLocaleString()}원</span>
          </div>
          {s.carryoverFromPrev > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">전월 이월</span>
              <span>{s.carryoverFromPrev.toLocaleString()}원</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t border-border pt-1.5 mt-1">
            <span>총 지원금</span>
            <span className="text-green-600">{s.totalSubsidy.toLocaleString()}원</span>
          </div>
          {s.eligibleTotal < s.totalActiveMembers && (
            <p className="text-[10px] text-muted-foreground pt-0.5">
              * 복수가입 {s.totalActiveMembers - s.eligibleTotal}명은 지원금 제외 (개인 납부)
            </p>
          )}
        </div>
      </div>

      {/* 벌금 내역 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">⚠️ 불참비 내역</p>
          <button onClick={() => setShowAddPenalty(!showAddPenalty)} className="text-xs text-primary font-medium">+ 수동 추가</button>
        </div>
        {showAddPenalty && (
          <div className="bg-muted rounded-xl p-3 space-y-2">
            <select
              value={newPenaltyUserId}
              onChange={(e) => setNewPenaltyUserId(e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
            >
              <option value="">멤버 선택</option>
              {allMembers.map(m => (
                <option key={m.id} value={m.id}>{m.nickname}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select
                value={newPenaltyReason}
                onChange={(e) => setNewPenaltyReason(e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-2 bg-background"
              >
                <option value="D-day">D-day (2만원)</option>
                <option value="D-1">D-1 (1만원)</option>
                <option value="기타">기타</option>
              </select>
              <input
                type="number"
                placeholder="금액"
                value={newPenaltyAmount}
                onChange={(e) => setNewPenaltyAmount(e.target.value)}
                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background"
              />
            </div>
            <button
              onClick={addManualPenalty}
              disabled={!newPenaltyUserId || !newPenaltyAmount || addingPenalty}
              className="w-full bg-destructive text-white text-sm font-medium py-2 rounded-xl disabled:opacity-50"
            >
              {addingPenalty ? '추가 중...' : '불참비 추가'}
            </button>
          </div>
        )}
        {penalties.length > 0 && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 space-y-1.5 text-xs">
            {penalties.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {(p as any).user?.nickname ?? '멤버'} · {p.reason} 취소
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-destructive font-medium">- {p.amount.toLocaleString()}원</span>
                  <button onClick={() => deletePenaltyById(p.id)} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
                </div>
              </div>
            ))}
            <div className="flex justify-between font-semibold border-t border-destructive/20 pt-1.5 mt-1">
              <span>불참비 합계 (정산 풀 투입)</span>
              <span className="text-destructive">- {s.totalPenalties.toLocaleString()}원</span>
            </div>
          </div>
        )}
      </div>

      {/* 최종 정산 */}
      {s.totalCosts > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-semibold">최종 정산</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">총 비용</span><span>{s.totalCosts.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">총 지원금</span>
              <span className="text-green-600">- {s.totalSubsidy.toLocaleString()}원</span>
            </div>
            {s.totalPenalties > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">불참비 (풀 투입)</span>
                <span className="text-destructive">- {s.totalPenalties.toLocaleString()}원</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-primary/20 pt-1.5 mt-1">
              <span>실부담금</span><span>{s.selfPay.toLocaleString()}원</span>
            </div>
          </div>
          {/* 차수별 인당 비용 */}
          {s.hasRoundData && s.roundStats.length > 1 && (
            <div className="space-y-1 pt-2 border-t border-primary/20">
              <p className="text-xs font-semibold text-muted-foreground">차수별 인당 부담금</p>
              {s.roundStats.map((rs) => (
                <div key={rs.round} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{rs.round}차 ({rs.attendees.length}명)</span>
                  <span className="font-medium">{rs.perPerson.toLocaleString()}원/인</span>
                </div>
              ))}
            </div>
          )}
          {s.attendingCount > 0 && (
            <div className="text-center pt-2 border-t border-primary/20">
              {s.hasRoundData ? (
                <>
                  <p className="text-xs text-muted-foreground">멤버별 부담금 (차수 기준)</p>
                  <div className="mt-1.5 space-y-1">
                    {s.attendingList.map((r) => (
                      <div key={r.id} className="flex justify-between text-sm">
                        <span className="font-medium">{(r as any).user?.nickname ?? '멤버'}</span>
                        <span className="font-bold text-primary">{(s.memberShares[r.user_id] ?? 0).toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">1인당 ({s.attendingCount}명)</p>
                  <p className="text-2xl font-bold text-primary">{s.perPerson.toLocaleString()}원</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    수거 예상: {(s.perPerson * s.attendingCount).toLocaleString()}원
                    {s.perPerson * s.attendingCount !== s.selfPay && ` (차액 +${(s.perPerson * s.attendingCount - s.selfPay).toLocaleString()}원 이월 처리)`}
                  </p>
                </>
              )}
            </div>
          )}
          {/* 카톡 공지 복사 */}
          {s.attendingCount > 0 && (
            <button
              onClick={copyKakaoSettlement}
              className="w-full mt-2 text-xs text-primary font-medium bg-primary/10 py-2 rounded-lg"
            >
              📋 카톡 공지 복사
            </button>
          )}
        </div>
      )}

      {/* 입금 확인 */}
      {s.totalCosts > 0 && s.attendingCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">💸 입금 확인</p>
            <span className="text-xs text-muted-foreground">{paidCount}/{s.attendingCount}명 완료</span>
          </div>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            {s.attendingList.map((r) => {
              const amount = s.hasRoundData ? (s.memberShares[r.user_id] ?? 0) : s.perPerson
              return (
                <div key={r.id} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium truncate">{(r as any).user?.nickname ?? '멤버'}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{amount.toLocaleString()}원</span>
                  </div>
                  <button
                    onClick={() => togglePaid(r)}
                    disabled={savingPaid === r.id}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors shrink-0 ${
                      r.paid_at
                        ? 'bg-green-500 text-white border-green-500'
                        : 'bg-background text-muted-foreground border-border'
                    } disabled:opacity-50`}
                  >
                    {r.paid_at ? '✓ 입금됨' : '미입금'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 익월 이월 */}
      {s.notAttendingEligibleCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs space-y-0.5">
          <p className="font-semibold text-amber-800">익월 이월 지원금</p>
          <p className="text-amber-700">불참(지원 대상) {s.notAttendingEligibleCount}명 × 17,500원 = <span className="font-bold">{s.carryoverToNext.toLocaleString()}원</span></p>
          <p className="text-amber-600">정산 확정 시 다음 모임에 자동 반영돼요</p>
        </div>
      )}

      {/* 정산 확정 / 공개 */}
      {s.totalCosts > 0 && (
        <div className="space-y-2">
          {snapshotStale && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ 확정 후 비용/참석 정보가 바뀌었어요. 멤버에게는 아직 이전 확정본이 보여요.
            </p>
          )}
          <button
            onClick={confirmSettlement}
            disabled={publishing || !dataLoaded}
            className={`w-full py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
              session.settlement_published && !snapshotStale
                ? 'bg-green-500 text-white border-green-500'
                : 'border-primary text-primary'
            } disabled:opacity-50`}
          >
            {publishing
              ? '처리 중...'
              : session.settlement_published
                ? snapshotStale ? '현재 값으로 다시 확정하기' : '✓ 정산 확정·공개 중 (다시 확정 가능)'
                : '정산 확정하고 멤버에게 공개하기'}
          </button>
          {session.settlement_published && (
            <button
              onClick={hideSettlement}
              disabled={publishing}
              className="w-full py-2 rounded-xl text-xs text-muted-foreground border border-border"
            >
              멤버 공개 숨기기
            </button>
          )}
        </div>
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
  )
}
