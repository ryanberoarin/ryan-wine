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

  return (
    <div className="px-4 py-6 space-y-6">
      {/* 와인 정보 */}
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

      {/* 시음평 목록 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">시음평 {notes.length}개</h2>
          <Link href={`/notes/new?wine_id=${id}`} className="text-sm text-primary font-medium">
            + 내 시음평
          </Link>
        </div>

        {notes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            아직 시음평이 없어요
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{(note as any).user?.nickname}</span>
                {note.rating && (
                  <span className="text-sm text-amber-500">
                    {'★'.repeat(note.rating)}{'☆'.repeat(5 - note.rating)}
                  </span>
                )}
              </div>

              {(note.aroma_keywords?.length || note.taste_keywords?.length || note.texture_keywords?.length) ? (
                <div className="flex flex-wrap gap-1">
                  {[
                    ...(note.aroma_keywords ?? []).map((k) => ({ k, type: '향' })),
                    ...(note.taste_keywords ?? []).map((k) => ({ k, type: '맛' })),
                    ...(note.texture_keywords ?? []).map((k) => ({ k, type: '질감' })),
                  ].map(({ k, type }) => (
                    <span key={`${type}-${k}`} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{k}</span>
                  ))}
                </div>
              ) : null}

              {note.memo && <p className="text-sm text-muted-foreground">{note.memo}</p>}

              <p className="text-xs text-muted-foreground">
                {new Date(note.created_at).toLocaleDateString('ko-KR')}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
