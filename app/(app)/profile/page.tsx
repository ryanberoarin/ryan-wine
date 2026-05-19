'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase, TastingNote } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { logout } from '@/lib/auth'
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

  const ratedNotes = notes.filter((n) => n.rating)
  const avgRating = ratedNotes.length > 0
    ? (ratedNotes.reduce((sum, n) => sum + (n.rating ?? 0), 0) / ratedNotes.length).toFixed(1)
    : null

  // 선호 타입 집계
  const typeCount: Record<string, number> = {}
  notes.forEach((n) => { if (n.wine?.wine_type) typeCount[n.wine.wine_type] = (typeCount[n.wine.wine_type] ?? 0) + 1 })
  const topTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // 자주 쓴 키워드
  const kwCount: Record<string, number> = {}
  notes.forEach((n) => {
    ;[...(n.aroma_keywords ?? []), ...(n.taste_keywords ?? []), ...(n.texture_keywords ?? [])].forEach((k) => {
      kwCount[k] = (kwCount[k] ?? 0) + 1
    })
  })
  const topKw = Object.entries(kwCount).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const wineTypeLabel: Record<string, string> = {
    red: '레드', white: '화이트', orange: '오렌지', rose: '로제', sparkling: '스파클링', other: '기타',
  }

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

      {/* 선호 타입 & 키워드 */}
      {notes.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          {topTypes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">선호 타입</p>
              {topTypes.map(([type, count]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className="text-xs w-14 shrink-0 text-right text-muted-foreground">{wineTypeLabel[type] ?? type}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(count / topTypes[0][1]) * 100}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground w-3">{count}</span>
                </div>
              ))}
            </div>
          )}
          {topKw.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">자주 쓴 키워드</p>
              <div className="flex flex-wrap gap-1.5">
                {topKw.map(([kw, count]) => (
                  <span key={kw} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                    {kw} <span className="opacity-60">×{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
            {user.is_admin && (
              <Link href="/scan" className="text-primary text-sm underline">와인 스캔하기</Link>
            )}
          </div>
        ) : (
          notes.map((note) => (
            <Link key={note.id} href={`/wines/${note.wine_id}`}>
              <Card className="p-4 space-y-2 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{note.wine?.name ?? '알 수 없는 와인'}</p>
                    <p className="text-xs text-muted-foreground">
                      {[note.wine?.producer, note.wine?.vintage ? `${note.wine.vintage}년` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {note.wine?.wine_type && (
                      <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full">{wineTypeLabel[note.wine.wine_type] ?? note.wine.wine_type}</span>
                    )}
                    {note.rating && (
                      <span className="text-xs text-amber-500">{'★'.repeat(note.rating)}{'☆'.repeat(5 - note.rating)}</span>
                    )}
                  </div>
                </div>
                {(note.aroma_keywords?.length || note.taste_keywords?.length) ? (
                  <div className="flex flex-wrap gap-1">
                    {[...(note.aroma_keywords ?? []), ...(note.taste_keywords ?? [])].slice(0, 4).map((kw) => (
                      <span key={kw} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{kw}</span>
                    ))}
                  </div>
                ) : null}
                <p className="text-[11px] text-muted-foreground">{new Date(note.created_at).toLocaleDateString('ko-KR')}</p>
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
