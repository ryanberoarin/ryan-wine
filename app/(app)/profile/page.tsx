'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, TastingNote } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { logout } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function ProfilePage() {
  const { user, setUser } = useUser()
  const router = useRouter()
  const [notes, setNotes] = useState<TastingNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('tasting_notes')
      .select('*, wine:wines(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setNotes((data as TastingNote[]) ?? [])
        setLoading(false)
      })
  }, [user])

  function handleLogout() {
    logout()
    setUser(null)
    router.push('/login')
  }

  if (!user) return null

  const avgRating = notes.filter((n) => n.rating).length > 0
    ? (notes.reduce((sum, n) => sum + (n.rating ?? 0), 0) / notes.filter((n) => n.rating).length).toFixed(1)
    : null

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary">{user.nickname}</h1>
          {user.is_admin && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">관리자</span>}
        </div>
        <button onClick={handleLogout} className="text-sm text-muted-foreground">
          로그아웃
        </button>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '시음한 와인', value: notes.length },
          { label: '평균 별점', value: avgRating ? `★ ${avgRating}` : '-' },
          { label: '메모', value: notes.filter((n) => n.memo).length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-primary">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* 내 시음평 */}
      <div className="space-y-3">
        <h2 className="font-semibold">내 시음 기록</h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <div className="text-4xl">🫙</div>
            <p className="text-sm text-muted-foreground">아직 시음 기록이 없어요</p>
            <Link href="/scan" className="text-primary text-sm underline">와인 스캔하기</Link>
          </div>
        ) : (
          notes.map((note) => (
            <Link key={note.id} href={`/wines/${note.wine_id}`}>
              <Card className="p-4 space-y-1 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm truncate">{note.wine?.name ?? '알 수 없는 와인'}</p>
                  {note.rating && (
                    <span className="text-xs text-amber-500 shrink-0">
                      {'★'.repeat(note.rating)}
                    </span>
                  )}
                </div>
                {note.wine?.producer && (
                  <p className="text-xs text-muted-foreground">{note.wine.producer}</p>
                )}
                {(note.aroma_keywords?.length || note.taste_keywords?.length) ? (
                  <div className="flex flex-wrap gap-1">
                    {[...(note.aroma_keywords ?? []), ...(note.taste_keywords ?? [])].slice(0, 4).map((kw) => (
                      <span key={kw} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{kw}</span>
                    ))}
                  </div>
                ) : null}
              </Card>
            </Link>
          ))
        )}
      </div>

      {user.is_admin && (
        <div className="border-t border-border pt-4">
          <Link href="/admin" className="text-sm text-primary font-medium">
            관리자 패널 →
          </Link>
        </div>
      )}
    </div>
  )
}
