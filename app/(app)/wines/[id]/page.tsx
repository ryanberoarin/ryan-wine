'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase, Wine, TastingNote } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Badge } from '@/components/ui/badge'

const wineTypeLabel: Record<string, string> = {
  red: '레드', white: '화이트', orange: '오렌지',
  rose: '로제', sparkling: '스파클링', other: '기타',
}

type KeywordEntry = { keyword: string; count: number }

function topKeywords(notes: TastingNote[]): KeywordEntry[] {
  const freq: Record<string, number> = {}
  notes.forEach((n) => {
    ;[...(n.aroma_keywords ?? []), ...(n.taste_keywords ?? []), ...(n.texture_keywords ?? [])].forEach((k) => {
      freq[k] = (freq[k] ?? 0) + 1
    })
  })
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([keyword, count]) => ({ keyword, count }))
}

export default function WineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useUser()
  const [wine, setWine] = useState<Wine | null>(null)
  const [notes, setNotes] = useState<TastingNote[]>([])

  useEffect(() => {
    supabase.from('wines').select('*').eq('id', id).single()
      .then(({ data }) => setWine(data as Wine))

    supabase.from('tasting_notes')
      .select('*, user:users(nickname)')
      .eq('wine_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setNotes((data as TastingNote[]) ?? []))
  }, [id])

  if (!wine) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-pulse">🍷</div></div>
  }

  const rated = notes.filter((n) => n.rating)
  const avgRating = rated.length > 0
    ? rated.reduce((s, n) => s + (n.rating ?? 0), 0) / rated.length
    : null

  const ratingDist = [5, 4, 3, 2, 1].map((r) => ({
    r,
    count: rated.filter((n) => n.rating === r).length,
  }))

  const keywords = topKeywords(notes)
  const myNote = notes.find((n) => n.user_id === user?.id)

  return (
    <div className="px-4 py-6 space-y-6 pb-24">
      {/* 와인 기본 정보 */}
      <div className="space-y-3">
        {wine.label_image_url && (
          <img src={wine.label_image_url} alt="라벨" className="w-full max-h-56 object-contain rounded-xl bg-muted" />
        )}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{wine.name}</h1>
            <p className="text-sm text-muted-foreground">
              {[wine.producer, wine.region, wine.country].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-col gap-1 items-end shrink-0">
            {wine.wine_type && <Badge>{wineTypeLabel[wine.wine_type]}</Badge>}
            {wine.vintage && <span className="text-xs text-muted-foreground">{wine.vintage}년</span>}
          </div>
        </div>
        {wine.grape_varieties && wine.grape_varieties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {wine.grape_varieties.map((g) => (
              <span key={g} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{g}</span>
            ))}
          </div>
        )}
        {wine.ai_description && (
          <p className="text-sm text-muted-foreground bg-muted rounded-xl px-4 py-3">{wine.ai_description}</p>
        )}
      </div>

      {/* 시음 요약 */}
      {notes.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold">멤버 시음 요약</p>

          {/* 평점 */}
          {avgRating !== null && (
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-4xl font-bold text-primary">{avgRating.toFixed(1)}</p>
                <p className="text-amber-400 text-lg">{'★'.repeat(Math.round(avgRating))}</p>
                <p className="text-xs text-muted-foreground">{rated.length}명 평가</p>
              </div>
              <div className="flex-1 space-y-1">
                {ratingDist.map(({ r, count }) => (
                  <div key={r} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-4 text-right">{r}</span>
                    <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: rated.length > 0 ? `${(count / rated.length) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-muted-foreground w-4">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 인기 키워드 */}
          {keywords.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">인기 키워드</p>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map(({ keyword, count }) => (
                  <span key={keyword}
                    className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
                    {keyword}
                    {count > 1 && <span className="ml-1 opacity-60">×{count}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 내 시음평 바로가기 */}
      <div className="flex gap-2">
        {myNote ? (
          <div className="flex-1 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-xs text-primary font-medium text-center">
            ✓ 내 시음평 작성 완료
          </div>
        ) : (
          <Link href={`/notes/new?wine_id=${id}`}
            className="flex-1 bg-primary text-primary-foreground text-sm font-medium text-center px-4 py-2.5 rounded-xl">
            ✏️ 내 시음평 쓰기
          </Link>
        )}
      </div>

      {/* 개별 시음평 */}
      <div className="space-y-3">
        <h2 className="font-semibold">시음평 {notes.length}개</h2>

        {notes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">아직 시음평이 없어요</div>
        ) : (
          notes.map((note) => {
            const isMe = note.user_id === user?.id
            const allKw = [
              ...(note.aroma_keywords ?? []).map((k) => ({ k, cat: '향' })),
              ...(note.taste_keywords ?? []).map((k) => ({ k, cat: '맛' })),
              ...(note.texture_keywords ?? []).map((k) => ({ k, cat: '질감' })),
            ]
            return (
              <div key={note.id} className={`border rounded-xl p-4 space-y-2 ${isMe ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {isMe ? '나' : (note as any).user?.nickname}
                    {isMe && <span className="ml-1 text-xs text-primary">(내 리뷰)</span>}
                  </span>
                  {note.rating && (
                    <span className="text-sm text-amber-500">
                      {'★'.repeat(note.rating)}{'☆'.repeat(5 - note.rating)}
                    </span>
                  )}
                </div>
                {allKw.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allKw.map(({ k, cat }) => (
                      <span key={`${cat}-${k}`} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{k}</span>
                    ))}
                  </div>
                )}
                {note.memo && <p className="text-sm text-muted-foreground">{note.memo}</p>}
                <p className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleDateString('ko-KR')}</p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
