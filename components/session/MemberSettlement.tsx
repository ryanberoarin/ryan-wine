'use client'

import type { SettlementSnapshot } from '@/lib/settlement'
import { CATEGORY_LABEL } from '@/lib/settlement'

type Props = {
  snap: SettlementSnapshot
  confirmed: boolean // true면 확정 스냅샷, false면 (구버전 세션) 실시간 계산 폴백
  userId: string | undefined
  isAttending: boolean
  paidAt: string | null
  paymentInfo: { bank: string; account: string } | null
}

// 멤버에게 보이는 정산 내역. 확정 스냅샷을 렌더링해서
// 공개 후 비용/투표가 바뀌어도 금액이 조용히 변하지 않는다.
export default function MemberSettlement({ snap, confirmed, userId, isAttending, paidAt, paymentInfo }: Props) {
  const myShare = snap.has_round_data
    ? (userId ? snap.member_shares[userId] ?? 0 : 0)
    : snap.per_person

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">💰 정산 내역</p>
        {confirmed && (
          <span className="text-[11px] text-muted-foreground">
            {new Date(snap.confirmed_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 확정
          </span>
        )}
      </div>

      {/* 비용 항목 */}
      <div className="bg-muted rounded-xl p-4 space-y-1.5 text-xs">
        {snap.cost_items.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-muted-foreground">
              {item.round_number}차 {(CATEGORY_LABEL[item.category] ?? item.category).replace(/^.\s/, '')}
              {item.description ? ` · ${item.description}` : ''}
            </span>
            <span>{item.amount.toLocaleString()}원</span>
          </div>
        ))}
        <div className="flex justify-between font-semibold border-t border-border pt-2 mt-1">
          <span>총 비용</span>
          <span>{snap.total_costs.toLocaleString()}원</span>
        </div>
      </div>

      {/* 지원금 내역 */}
      <div className="bg-muted rounded-xl p-4 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">참석 지원금 (대상 {snap.attending_eligible_count}명 × 35,000)</span>
          <span className="text-green-600">{snap.subsidy_attending.toLocaleString()}원</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">불참 지원금 1/2 (대상 {snap.not_attending_eligible_count}명 × 17,500)</span>
          <span className="text-green-600">{snap.subsidy_not_attending.toLocaleString()}원</span>
        </div>
        {snap.carryover_from_prev > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">전월 이월 지원금</span>
            <span className="text-green-600">{snap.carryover_from_prev.toLocaleString()}원</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t border-border pt-2 mt-1">
          <span>총 지원금</span>
          <span className="text-green-600">- {snap.total_subsidy.toLocaleString()}원</span>
        </div>
        {snap.total_penalties > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">불참비 (풀 투입)</span>
            <span className="text-destructive">- {snap.total_penalties.toLocaleString()}원</span>
          </div>
        )}
      </div>

      {/* 1인당 / 내 부담금 */}
      {snap.attending_count > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-3">
          {snap.has_round_data && isAttending ? (
            <>
              <p className="text-xs text-muted-foreground">내 부담금</p>
              <p className="text-3xl font-bold text-primary mt-1">{myShare.toLocaleString()}원</p>
              {snap.round_stats.length > 1 && (
                <div className="mt-2 space-y-0.5">
                  {snap.round_stats.map((rs) => (
                    <p key={rs.round} className="text-[11px] text-muted-foreground">
                      {rs.round}차 ({rs.attendee_count}명): {rs.per_person.toLocaleString()}원/인
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">참석자 실 부담금 · 1인당</p>
              <p className="text-3xl font-bold text-primary mt-1">{snap.per_person.toLocaleString()}원</p>
            </>
          )}

          {isAttending && paidAt && (
            <p className="text-xs font-medium text-green-600">✓ 입금 확인 완료</p>
          )}

          {(() => {
            if (!isAttending || paidAt) return null
            const amount = snap.has_round_data ? myShare : snap.per_person
            const bank = paymentInfo?.bank
            const account = paymentInfo?.account
            if (!bank || !account || amount <= 0) return null
            const tossUrl = `supertoss://send?amount=${amount}&bank=${bank}&accountNo=${account}&origin=와인클럽정산`
            return (
              <a
                href={tossUrl}
                className="block w-full bg-[#0064FF] text-white text-sm font-semibold py-3 rounded-xl text-center"
              >
                토스로 송금하기 · {amount.toLocaleString()}원
              </a>
            )
          })()}
        </div>
      )}
    </div>
  )
}
