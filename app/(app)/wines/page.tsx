'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, Wine, TastingNote } from '@/lib/supabase'
import { Badge } from '@/components/ui/badge'

const wineTypeLabel: Record<string, string> = {
  red: '레드', white: '화이트', orange: '오렌지',
  rose: '로제', sparkling: '스파클링', other: '기타',
}
const wineTypeFilter = ['전체', '레드', '화이트', '오렌지', '로제', '스파클링']
const filterToType: Record<string, string> = {
  '레드': 'red', '화이트': 'white', '오렌지': 'orange', '로제': 'rose', '스파클링': 'sparkling',
}

type WineWithStats = Wine & {
  notes: TastingNote[]
  avgRating: number | null
  topKeywords: string[]
  noteCount: number
}

function computeStats(wine: Wine & { tasting_notes: TastingNote[] }): WineWithStats {
  const notes = wine.tasting_notes ?? []
  const rated = notes.filter((n) => n.rating)
  const avgRating = rated.length > 0
    ? rated.reduce((s, n) => s + (n.rating ?? 0), 0) / rated.length
    : null

  const kwCount: Record<string, number> = {}
  notes.forEach((n) => {
    ;[...(n.aroma_keywords ?? []), ...(n.taste_keywords ?? []), ...(n.texture_keywords ?? [])].forEach((k) => {
      kwCount[k] = (kwCount[k] ?? 0) + 1
    })
  })
  const topKeywords = Object.entries(kwCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k]) => k)

  return { ...wine, notes, avgRating, topKeywords, noteCount: notes.length }
}

export default function WinesPage() {
  const [wines, setWines] = useState<WineWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('전체')

  useEffect(() => {
    supabase
      .from('wines')
      .select('*, tasting_notes(rating, aroma_keywords, taste_keywords, texture_keywords, user_id, created_at)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const computed = ((data ?? []) as any[]).map(computeStats)
        setWines(computed)
        setLoading(false)
      })
  }, [])

  const filtered = filter === '전체'
    ? wines
    : wines.filter((w) => w.wine_type === filterToType[filter])

  return (
    <div className="px-4 py-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-primary">와인</h1>
        <p className="text-sm text-muted-foreground">동호회에서 시음한 모든 와인</p>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {wineTypeFilter.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
              filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
            }`}>
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <div className="text-4xl">🫙</div>
          <p className="text-sm text-muted-foreground">아직 기록된 와인이 없어요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((wine) => (
            <Link key={wine.id} href={`/wines/${wine.id}`}>
              <div className="bg-card border border-border rounded-2xl p-4 space-y-2.5 hover:shadow-md transition-shadow active:scale-[0.99]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{wine.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[wine.producer, wine.region, wine.country].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {wine.wine_type && (
                      <Badge variant="secondary" className="text-xs">{wineTypeLabel[wine.wine_type]}</Badge>
                    )}
                    {wine.vintage && (
                      <span className="text-xs text-muted-foreground">{wine.vintage}년</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {wine.avgRating !== null ? (
                    <div className="flex items-center gap-1">
                      <span className="text-amber-400 text-sm">★</span>
                      <span className="text-sm font-semibold">{wine.avgRating.toFixed(1)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">평점 없음</span>
                  )}
                  <span className="text-xs text-muted-foreground">리뷰 {wine.noteCount}개</span>
                </div>

                {wine.topKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {wine.topKeywords.map((k) => (
                      <span key={k} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{k}</span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
