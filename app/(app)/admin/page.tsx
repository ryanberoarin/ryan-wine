'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, USER_PUBLIC_COLUMNS } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { getDeviceToken } from '@/lib/auth'
import type { User } from '@/lib/auth'

export default function AdminPage() {
  const { user } = useUser()
  const router = useRouter()
  const [members, setMembers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteCode, setInviteCode] = useState('')

  useEffect(() => {
    if (user && !user.is_admin) { router.push('/home'); return }
    fetchMembers()
    fetchInviteCode()
  }, [user, router])

  async function fetchInviteCode() {
    const res = await fetch('/api/admin-config', {
      headers: { 'x-device-token': getDeviceToken() },
    })
    if (res.ok) {
      const json = await res.json()
      setInviteCode(json.inviteCode)
    }
  }

  async function fetchMembers() {
    const { data } = await supabase.from('users').select(USER_PUBLIC_COLUMNS)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: true })
    setMembers((data as unknown as User[]) ?? [])
    setLoading(false)
  }

  // users 테이블 쓰기는 RLS로 차단 — 서버 API(service role) 경유
  async function updateMember(memberId: string, action: 'set_active' | 'set_subsidy', value: boolean) {
    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-token': getDeviceToken() },
      body: JSON.stringify({ userId: memberId, action, value }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      alert(json.error ?? '변경에 실패했어요.')
      return
    }
    const { user: updated } = await res.json()
    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, ...updated } : m))
  }

  function toggleActive(memberId: string, currentActive: boolean) {
    return updateMember(memberId, 'set_active', !currentActive)
  }

  function toggleSubsidyEligible(memberId: string, current: boolean) {
    return updateMember(memberId, 'set_subsidy', !current)
  }

  if (!user?.is_admin) return null

  const activeMembers = members.filter((m) => m.is_active)
  const activeCount = activeMembers.length
  const inactiveCount = members.filter((m) => !m.is_active).length
  // 복수가입자(subsidy_eligible=false)는 지원금 제외
  const eligibleCount = activeMembers.filter((m) => m.subsidy_eligible).length
  const monthlySubsidy = eligibleCount * 35000

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary">관리자 패널</h1>
        <p className="text-sm text-muted-foreground">동호회 멤버 및 지원금 관리</p>
      </div>

      {/* 초대 코드 */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-1">
        <p className="text-xs text-muted-foreground">초대 코드</p>
        <p className="text-2xl font-mono font-bold text-primary tracking-widest">
          {inviteCode || '···'}
        </p>
        <p className="text-xs text-muted-foreground">새 멤버에게 이 코드를 공유하세요</p>
      </div>

      {/* 지원금 현황 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-primary">{activeCount}명</p>
          <p className="text-xs text-muted-foreground mt-1">활성 멤버</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-primary">{monthlySubsidy.toLocaleString()}원</p>
          <p className="text-xs text-muted-foreground mt-1">월 총 지원금 (대상 {eligibleCount}명)</p>
        </div>
      </div>

      {/* 지원금 정책 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs space-y-1">
        <p className="font-semibold text-amber-800">지원금 정책 (인당 35,000원/월)</p>
        <p className="text-amber-700">· 매월 1일 기준 활성 멤버 수로 확정 (복수가입자 개인 납부 포함)</p>
        <p className="text-amber-700">· 참석자 → 35,000원 전액 당월 적용</p>
        <p className="text-amber-700">· 미참석자 → 17,500원 당월 + 17,500원 익월 이월</p>
        <p className="text-amber-700">· 복수가입자는 지원금 제외, 개인 직접 납부</p>
      </div>

      {/* 멤버 목록 */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">멤버 ({activeCount}명 활성 / {inactiveCount}명 비활성)</p>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {members.filter((m) => m.is_active).map((member) => (
              <div key={member.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{member.nickname}</p>
                    {member.is_admin && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">관리자</span>
                    )}
                    {!member.subsidy_eligible && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">복수가입</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(member.created_at).toLocaleDateString('ko-KR')} 가입</p>
                </div>
                {member.id !== user.id && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleSubsidyEligible(member.id, member.subsidy_eligible)}
                      className={`text-xs px-2 py-1 rounded-lg border ${member.subsidy_eligible ? 'text-orange-600 border-orange-300' : 'text-green-600 border-green-300'}`}>
                      {member.subsidy_eligible ? '복수가입 처리' : '지원금 복구'}
                    </button>
                    <button onClick={() => toggleActive(member.id, member.is_active)}
                      className="text-xs text-destructive border border-destructive/30 px-2 py-1 rounded-lg">
                      탈퇴 처리
                    </button>
                  </div>
                )}
              </div>
            ))}

            {inactiveCount > 0 && (
              <>
                <p className="text-xs text-muted-foreground pt-2">탈퇴 멤버</p>
                {members.filter((m) => !m.is_active).map((member) => (
                  <div key={member.id} className="bg-muted border border-border rounded-xl px-4 py-3 flex items-center justify-between opacity-60">
                    <div>
                      <p className="font-medium text-sm line-through">{member.nickname}</p>
                      <p className="text-xs text-muted-foreground">{new Date(member.created_at).toLocaleDateString('ko-KR')} 가입</p>
                    </div>
                    <button onClick={() => toggleActive(member.id, member.is_active)}
                      className="text-xs text-green-600 border border-green-300 px-2 py-1 rounded-lg">
                      복구
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <Link href="/sessions/new"
        className="block w-full text-center bg-primary text-primary-foreground text-sm font-medium px-4 py-3 rounded-xl">
        + 새 모임 만들기
      </Link>
    </div>
  )
}
