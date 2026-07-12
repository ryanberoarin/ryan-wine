'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, Session } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Card } from '@/components/ui/card'

const statusLabel: Record<string, { label: string; color: string }> = {
  planning: { label: '준비 중', color: 'bg-yellow-100 text-yellow-800' },
  active: { label: '진행 중', color: 'bg-green-100 text-green-800' },
  completed: { label: '완료', color: 'bg-muted text-muted-foreground' },
}

function isPast(session: Session): boolean {
  if (session.status === 'completed') return true
  if (!session.scheduled_at) return false
  return new Date(session.scheduled_at) < new Date()
}

function SessionCard({ session, dimmed }: { session: Session; dimmed: boolean }) {
  const st = statusLabel[session.status]
  return (
    <Link href={`/sessions/${session.id}`}>
      <Card className={`p-4 space-y-2 hover:shadow-md transition-shadow ${dimmed ? 'opacity-50' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{session.title}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${st.color}`}>
            {st.label}
          </span>
        </div>
        {session.description && (
          <p className="text-sm text-muted-foreground line-clamp-1">{session.description}</p>
        )}
        {session.scheduled_at && (
          <p className="text-xs text-muted-foreground">
            {new Date(session.scheduled_at).toLocaleDateString('ko-KR', {
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        )}
      </Card>
    </Link>
  )
}

export default function SessionsPage() {
  const { user } = useUser()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('sessions')
      .select('*')
      .order('scheduled_at', { ascending: false })
      .then(({ data }) => {
        setSessions((data as Session[]) ?? [])
        setLoading(false)
      })
  }, [])

  // 다가오는 모임(날짜 가까운 순) 위, 지난 모임(최신순) 아래 디밍 처리
  const upcoming = sessions.filter((s) => !isPast(s))
    .sort((a, b) => {
      if (!a.scheduled_at) return -1
      if (!b.scheduled_at) return 1
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    })
  const past = sessions.filter(isPast)
    .sort((a, b) => new Date(b.scheduled_at ?? 0).getTime() - new Date(a.scheduled_at ?? 0).getTime())

  return (
    <div className="px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">모임</h1>
          <p className="text-sm text-muted-foreground">함께 마시는 와인 기록</p>
        </div>
        {user?.is_admin && (
          <Link
            href="/sessions/new"
            className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-full"
          >
            + 모임 만들기
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="text-5xl">🥂</div>
          <p className="text-muted-foreground">아직 모임이 없어요</p>
          {user?.is_admin && (
            <Link href="/sessions/new" className="text-primary text-sm font-medium underline">
              첫 모임 만들기
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-3">
              {upcoming.map((session) => (
                <SessionCard key={session.id} session={session} dimmed={false} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2 border-t border-border">
                지난 모임
              </p>
              {past.map((session) => (
                <SessionCard key={session.id} session={session} dimmed />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
