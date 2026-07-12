import type { SessionRsvp, SessionPenalty, CostItem, User } from './supabase'

export const SUBSIDY_PER_PERSON = 35000

export const CATEGORY_LABEL: Record<string, string> = {
  wine: '🍷 와인', venue: '🏠 장소', taxi: '🚕 택시', food: '🍽️ 음식', other: '기타',
}

export type RoundStat = {
  round: number
  cost: number
  selfPay: number
  attendees: SessionRsvp[]
  perPerson: number
}

export type AttendeeGroup = { rounds: number[]; count: number; total: number }

export type Settlement = {
  attendingList: SessionRsvp[]
  notAttendingList: SessionRsvp[]
  attendingCount: number
  unvotedMembers: User[]
  totalActiveMembers: number
  // 지원금 대상(subsidy_eligible) 기준 집계 — 복수가입자는 제외
  eligibleTotal: number
  attendingEligibleCount: number
  notAttendingEligibleCount: number
  subsidyAttending: number
  subsidyNotAttending: number
  carryoverFromPrev: number
  totalSubsidy: number
  carryoverToNext: number
  rounds: number[]
  totalCosts: number
  totalPenalties: number
  selfPay: number
  perPerson: number
  hasRoundData: boolean
  roundStats: RoundStat[]
  memberShares: Record<string, number>
  attendeeGroups: AttendeeGroup[]
}

export function calcSettlement(args: {
  rsvps: SessionRsvp[]
  allMembers: User[]
  costItems: CostItem[]
  penalties: SessionPenalty[]
  carryoverFromPrev: number
}): Settlement {
  const { rsvps, allMembers, costItems, penalties, carryoverFromPrev } = args

  const attendingList = rsvps.filter((r) => r.status === 'attending')
  const notAttendingList = rsvps.filter((r) => r.status === 'not_attending')
  const attendingCount = attendingList.length
  const votedUserIds = new Set(rsvps.map((r) => r.user_id))
  const unvotedMembers = allMembers.filter((m) => !votedUserIds.has(m.id))
  const totalActiveMembers = allMembers.length

  // 지원금은 subsidy_eligible 멤버만 계산 (미투표자는 불참 처리)
  const eligibleIds = new Set(allMembers.filter((m) => m.subsidy_eligible).map((m) => m.id))
  const eligibleTotal = eligibleIds.size
  const attendingEligibleCount = attendingList.filter((r) => eligibleIds.has(r.user_id)).length
  const notAttendingEligibleCount = Math.max(0, eligibleTotal - attendingEligibleCount)

  const subsidyAttending = attendingEligibleCount * SUBSIDY_PER_PERSON
  const subsidyNotAttending = notAttendingEligibleCount * (SUBSIDY_PER_PERSON / 2)
  const totalSubsidy = subsidyAttending + subsidyNotAttending + carryoverFromPrev
  const carryoverToNext = notAttendingEligibleCount * (SUBSIDY_PER_PERSON / 2)

  const rounds = [...new Set(costItems.map((c) => c.round_number))].sort((a, b) => a - b)
  const totalCosts = costItems.reduce((sum, c) => sum + c.amount, 0)
  const totalPenalties = penalties.reduce((sum, p) => sum + p.amount, 0)
  const selfPay = Math.max(0, totalCosts - totalSubsidy - totalPenalties)
  const perPerson = attendingCount > 0 ? Math.ceil(selfPay / attendingCount) : 0

  const hasRoundData = attendingList.some((r) => r.attended_rounds !== null && r.attended_rounds !== undefined)
  const roundStats: RoundStat[] = rounds.map((r) => {
    const roundCost = costItems.filter((c) => c.round_number === r).reduce((s, c) => s + c.amount, 0)
    const roundSelfPay = totalCosts > 0 ? selfPay * (roundCost / totalCosts) : 0
    const roundAttendees = attendingList.filter((rsvp) => {
      const ar = rsvp.attended_rounds
      return ar === null || ar === undefined || ar.includes(r)
    })
    const roundPerPerson = roundAttendees.length > 0 ? Math.ceil(roundSelfPay / roundAttendees.length) : 0
    return { round: r, cost: roundCost, selfPay: roundSelfPay, attendees: roundAttendees, perPerson: roundPerPerson }
  })

  const memberShares: Record<string, number> = {}
  for (const rsvp of attendingList) {
    memberShares[rsvp.user_id] = roundStats.reduce((total, rs) => {
      if (rs.attendees.some((a) => a.user_id === rsvp.user_id)) return total + rs.perPerson
      return total
    }, 0)
  }

  // 참석 차수 조합이 같은 사람끼리 묶어 인당 최종 부담금을 계산
  const attendeeGroups: AttendeeGroup[] = hasRoundData
    ? Array.from(
        attendingList.reduce((map, r) => {
          const memberRounds = (r.attended_rounds ?? rounds).slice().sort((a, b) => a - b)
          const key = memberRounds.join(',')
          const g = map.get(key)
          if (g) g.count += 1
          else map.set(key, { rounds: memberRounds, count: 1, total: memberShares[r.user_id] ?? 0 })
          return map
        }, new Map<string, AttendeeGroup>()).values()
      ).sort((a, b) => b.rounds.length - a.rounds.length || a.rounds[0] - b.rounds[0])
    : []

  return {
    attendingList, notAttendingList, attendingCount, unvotedMembers, totalActiveMembers,
    eligibleTotal, attendingEligibleCount, notAttendingEligibleCount,
    subsidyAttending, subsidyNotAttending, carryoverFromPrev, totalSubsidy, carryoverToNext,
    rounds, totalCosts, totalPenalties, selfPay, perPerson,
    hasRoundData, roundStats, memberShares, attendeeGroups,
  }
}

// 정산 확정 시 sessions.settlement_snapshot 에 저장되는 고정본.
// 멤버 화면은 이 스냅샷만 렌더링해서, 확정 후 데이터가 바뀌어도 금액이 조용히 변하지 않는다.
export type SettlementSnapshot = {
  confirmed_at: string
  attending_count: number
  total_active_members: number
  cost_items: { round_number: number; category: string; description: string | null; amount: number }[]
  total_costs: number
  attending_eligible_count: number
  not_attending_eligible_count: number
  subsidy_attending: number
  subsidy_not_attending: number
  carryover_from_prev: number
  total_subsidy: number
  total_penalties: number
  self_pay: number
  per_person: number
  has_round_data: boolean
  round_stats: { round: number; attendee_count: number; per_person: number }[]
  member_shares: Record<string, number>
  carryover_to_next: number
}

export function buildSnapshot(s: Settlement, costItems: CostItem[]): SettlementSnapshot {
  return {
    confirmed_at: new Date().toISOString(),
    attending_count: s.attendingCount,
    total_active_members: s.totalActiveMembers,
    cost_items: costItems.map((c) => ({
      round_number: c.round_number, category: c.category, description: c.description, amount: c.amount,
    })),
    total_costs: s.totalCosts,
    attending_eligible_count: s.attendingEligibleCount,
    not_attending_eligible_count: s.notAttendingEligibleCount,
    subsidy_attending: s.subsidyAttending,
    subsidy_not_attending: s.subsidyNotAttending,
    carryover_from_prev: s.carryoverFromPrev,
    total_subsidy: s.totalSubsidy,
    total_penalties: s.totalPenalties,
    self_pay: s.selfPay,
    per_person: s.perPerson,
    has_round_data: s.hasRoundData,
    round_stats: s.roundStats.map((rs) => ({
      round: rs.round, attendee_count: rs.attendees.length, per_person: rs.perPerson,
    })),
    member_shares: s.memberShares,
    carryover_to_next: s.carryoverToNext,
  }
}
