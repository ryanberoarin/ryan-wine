'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import type { User } from '@/lib/auth'
import { Card } from '@/components/ui/card'

export default function AdminPage() {
  const { user } = useUser()
  const router = useRouter()
  const [members, setMembers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && !user.is_admin) {
      router.push('/home')
      return
    }
    supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setMembers((data as User[]) ?? [])
        setLoading(false)
      })
  }, [user, router])

  if (!user?.is_admin) return null

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary">관리자 패널</h1>
        <p className="text-sm text-muted-foreground">동호회 멤버 및 초대 코드 관리</p>
      </div>

      {/* 초대 코드 */}
      <Card className="p-4 space-y-2">
        <p className="text-sm font-semibold">초대 코드</p>
        <p className="text-2xl font-mono font-bold text-primary tracking-widest">
          {process.env.NEXT_PUBLIC_INVITE_CODE ?? 'naturalvin'}
        </p>
        <p className="text-xs text-muted-foreground">이 코드를 새 멤버에게 공유하세요</p>
      </Card>

      {/* 멤버 목록 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">멤버 ({members.length}명)</p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : (
          members.map((member) => (
            <div key={member.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{member.nickname}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(member.created_at).toLocaleDateString('ko-KR')} 가입
                </p>
              </div>
              {member.is_admin && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">관리자</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* 바로가기 */}
      <div className="border-t border-border pt-4 space-y-2">
        <Link href="/sessions/new"
          className="block w-full text-center bg-primary text-primary-foreground text-sm font-medium px-4 py-3 rounded-xl">
          + 새 모임 만들기
        </Link>
      </div>
    </div>
  )
}
