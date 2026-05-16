'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, TastingNote, Session } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const wineTypeLabel: Record<string, string> = {
  red: '레드', white: '화이트', orange: '오렌지',
  rose: '로제', sparkling: '스파클링', other: '기타',
}

const ratingComment: Record<number, string> = {
  5: '완벽했어요', 4: '정말 좋았어요', 3: '괜찮았어요', 2: '아쉬웠어요', 1: '별로였어요',
}

export default function HomePage() {
  const { user } = useUser()
  const [notes, setNotes] = useState<TastingNote[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase
        .from('tasting_notes')
        .select('*, wine:wines(*), user:users(nickname)')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('sessions')
        .select('*')
        .in('status', ['planning', 'active'])
        .order('scheduled_at', { ascending: true })
        .limit(3),
    ]).then(([notesRes, sessionsRes]) => {
      setNotes((notesRes.data as TastingNote[]) ?? [])
      setUpcomingSessions((sessionsRes.data as Session[]) ?? [])
      setLoading(false)
    })
  }, [])

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">안녕하세요, {user?.nickname}님 🍷</h1>
          <p className="text-sm text-muted-foreground">동호회 최근 기록</p>
        </div>
        <Link href="/scan"
          className="bg-primary text-primary-foreground text-sm font-medium px-4 py-2 rounded-full">
          + 와인 추가
        </Link>
      </div>

      {/* 다가오는 모임 */}
      {upcomingSessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">다가오는 모임</p>
          {upcomingSessions.map((s) => (
            <Link key={s.id} href={`/sessions/${s.id}`}>
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-primary">{s.title}</p>
                  {s.scheduled_at && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.scheduled_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {s.status === 'active' ? '진행 중' : '준비 중'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 피드 */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">최근 시음 기록</p>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="text-5xl">🫙</div>
            <p className="text-muted-foreground">아직 기록된 와인이 없어요</p>
            <Link href="/scan" className="text-primary text-sm font-medium underline">첫 와인 스캔하기</Link>
          </div>
        ) : (
          notes.map((note) => {
            const nickname = (note as any).user?.nickname ?? ''
            const isMe = note.user_id === user?.id
            const allKeywords = [
              ...(note.aroma_keywords ?? []),
              ...(note.taste_keywords ?? []),
              ...(note.texture_keywords ?? []),
            ]
            return (
              <Link key={note.id} href={`/wines/${note.wine_id}`}>
                <Card className="p-4 space-y-2 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{note.wine?.name ?? '알 수 없는 와인'}</p>
                      <p className="text-xs text-muted-foreground">
                        {note.wine?.producer}{note.wine?.vintage ? ` · ${note.wine.vintage}` : ''}
                      </p>
                    </div>
                    {note.wine?.wine_type && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {wineTypeLabel[note.wine.wine_type]}
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm">
                    <span className="font-medium">{isMe ? '내가' : `${nickname}님이`}</span>
                    {note.rating ? (
                      <>
                        {' '}<span className="text-amber-500">{'★'.repeat(note.rating)}</span>{' '}
                        <span className="text-muted-foreground">— {ratingComment[note.rating]}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground"> 시음평을 남겼어요</span>
                    )}
                  </p>

                  {allKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {allKeywords.slice(0, 5).map((kw) => (
                        <span key={kw} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                          {kw}
                        </span>
                      ))}
                      {allKeywords.length > 5 && (
                        <span className="text-xs text-muted-foreground">+{allKeywords.length - 5}</span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {new Date(note.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                  </p>
                </Card>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
