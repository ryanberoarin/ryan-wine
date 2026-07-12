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

function topByField(notes: TastingNote[], field: 'aroma_keywords' | 'taste_keywords' | 'texture_keywords', limit = 5): KeywordEntry[] {
  const freq: Record<string, number> = {}
  notes.forEach((n) => (n[field] ?? []).forEach((k) => { freq[k] = (freq[k] ?? 0) + 1 }))
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([keyword, count]) => ({ keyword, count }))
}

export default function WineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useUser()
  const [wine, setWine] = useState<Wine | null>(null)
  const [notes, setNotes] = useState<TastingNote[]>([])
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<Wine>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

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

  const aromaKw = topByField(notes, 'aroma_keywords')
  const tasteKw = topByField(notes, 'taste_keywords')
  const textureKw = topByField(notes, 'texture_keywords')
  const myNote = notes.find((n) => n.user_id === user?.id)

  function openEdit() {
    if (!wine) return
    setEditData({
      name: wine.name,
      producer: wine.producer,
      region: wine.region,
      country: wine.country,
      vintage: wine.vintage,
      grape_varieties: wine.grape_varieties ?? [],
      wine_type: wine.wine_type,
      is_natural: wine.is_natural,
      ai_description: wine.ai_description,
    })
    setEditMode(true)
  }

  async function saveEdit() {
    if (!wine) return
    setSaving(true)
    setSaveError('')
    const { data, error } = await supabase.from('wines').update({
      name: editData.name?.trim() || null,
      producer: editData.producer?.trim() || null,
      region: editData.region?.trim() || null,
      country: editData.country?.trim() || null,
      vintage: editData.vintage || null,
      grape_varieties: editData.grape_varieties ?? [],
      wine_type: editData.wine_type || null,
      is_natural: editData.is_natural ?? false,
      ai_description: editData.ai_description?.trim() || null,
    }).eq('id', id).select().single()
    if (error) {
      setSaveError('저장에 실패했어요. 다시 시도해주세요.')
    } else if (data) {
      setWine(data as Wine)
      setEditMode(false)
    }
    setSaving(false)
  }

  return (
    <div className="px-4 py-6 space-y-6 pb-24">
      {/* 와인 기본 정보 */}
      <div className="space-y-3">
        {wine.label_image_url && (
          <img src={wine.label_image_url} alt="라벨" className="w-full max-h-56 object-contain rounded-xl bg-muted" />
        )}

        {editMode ? (
          <div className="space-y-2">
            <div className="flex gap-1.5 flex-wrap">
              {(['red', 'white', 'orange', 'rose', 'sparkling', 'other'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setEditData(p => ({ ...p, wine_type: type }))}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${editData.wine_type === type ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background'}`}
                >
                  {wineTypeLabel[type]}
                </button>
              ))}
            </div>
            <input
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              placeholder="와인명"
              value={editData.name ?? ''}
              onChange={(e) => setEditData(p => ({ ...p, name: e.target.value }))}
            />
            <input
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              placeholder="생산자"
              value={editData.producer ?? ''}
              onChange={(e) => setEditData(p => ({ ...p, producer: e.target.value }))}
            />
            <div className="flex gap-2">
              <input
                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background"
                placeholder="지역"
                value={editData.region ?? ''}
                onChange={(e) => setEditData(p => ({ ...p, region: e.target.value }))}
              />
              <input
                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background"
                placeholder="국가"
                value={editData.country ?? ''}
                onChange={(e) => setEditData(p => ({ ...p, country: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <input
                className="w-24 text-sm border border-border rounded-lg px-3 py-2 bg-background"
                placeholder="빈티지"
                type="number"
                value={editData.vintage ?? ''}
                onChange={(e) => setEditData(p => ({ ...p, vintage: e.target.value ? parseInt(e.target.value) : null }))}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer flex-1">
                <input
                  type="checkbox"
                  checked={editData.is_natural ?? false}
                  onChange={(e) => setEditData(p => ({ ...p, is_natural: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                내추럴 와인
              </label>
            </div>
            <input
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
              placeholder="품종 (쉼표로 구분)"
              value={editData.grape_varieties?.join(', ') ?? ''}
              onChange={(e) => setEditData(p => ({ ...p, grape_varieties: e.target.value ? e.target.value.split(',').map(s => s.trim()).filter(Boolean) : [] }))}
            />
            <textarea
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background resize-none"
              placeholder="와인 설명"
              rows={3}
              value={editData.ai_description ?? ''}
              onChange={(e) => setEditData(p => ({ ...p, ai_description: e.target.value }))}
            />
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex-1 bg-primary text-primary-foreground text-sm font-medium py-2.5 rounded-xl disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
              <button
                onClick={() => { setEditMode(false); setSaveError('') }}
                className="flex-1 border border-border text-sm font-medium py-2.5 rounded-xl"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
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
                {user?.is_admin && (
                  <button onClick={openEdit} className="text-xs text-primary/60 mt-1">✏️ 수정</button>
                )}
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
          </>
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

          {/* 카테고리별 키워드 시각화 */}
          {(aromaKw.length > 0 || tasteKw.length > 0 || textureKw.length > 0) && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">키워드</p>
              {([
                { label: '향', items: aromaKw, color: 'bg-violet-400' },
                { label: '맛', items: tasteKw, color: 'bg-primary' },
                { label: '질감', items: textureKw, color: 'bg-amber-400' },
              ] as { label: string; items: KeywordEntry[]; color: string }[])
                .filter(({ items }) => items.length > 0)
                .map(({ label, items, color }) => (
                  <div key={label}>
                    <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">{label}</p>
                    <div className="space-y-1.5">
                      {items.map(({ keyword, count }) => (
                        <div key={keyword} className="flex items-center gap-2">
                          <span className="text-xs w-16 shrink-0 truncate text-right text-muted-foreground">{keyword}</span>
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full ${color} rounded-full transition-all`}
                              style={{ width: `${(count / items[0].count) * 100}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground w-3 shrink-0">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 내 시음평 바로가기 */}
      <div className="flex gap-2">
        {myNote ? (
          <Link href={`/notes/new?wine_id=${id}${myNote.session_id ? `&session_id=${myNote.session_id}` : ''}`}
            className="flex-1 bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 text-xs text-primary font-medium text-center">
            ✓ 내 시음평 작성 완료 · 수정하기
          </Link>
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
