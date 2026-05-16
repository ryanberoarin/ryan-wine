'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, Wine } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const KEYWORDS = {
  aroma: {
    label: '향',
    icon: '👃',
    items: [
      // 과일
      '복숭아', '살구', '체리', '딸기', '라즈베리', '자두', '블루베리', '크랜베리', '포도',
      // 내추럴 특유
      '효모', '사워도우', '막걸리', '식초', '사이다', '발효', '브레타', '펑키', '반다이드',
      // 자연/흙
      '흙냄새', '버섯', '낙엽', '젖은 돌', '광물', '화약', '연기',
      // 꽃/허브
      '꽃향', '장미', '제비꽃', '허브', '라벤더', '박하',
      // 기타
      '시트러스', '레몬', '자몽', '오렌지 껍질', '후추', '계피',
    ],
  },
  taste: {
    label: '맛',
    icon: '👅',
    items: [
      '산미 강함', '산미 낮음', '산미 생생함',
      '탄닌 강함', '탄닌 부드러움', '탄닌 없음',
      '미네랄', '짭짤함', '감칠맛',
      '드라이', '약간 달콤', '달콤',
      'CO₂ 느낌', '페티앙', '스파클링',
      '균형감 좋음', '날카로움', '거침',
    ],
  },
  texture: {
    label: '질감',
    icon: '🖐️',
    items: [
      '가볍다', '중간', '묵직하다',
      '부드럽다', '실키', '거칠다', '탄탄하다',
      '복잡하다', '단순하다', '생동감 있다',
      '탁하다', '자연스러운 탁함', '맑다',
      '여운 길다', '여운 짧다', '깔끔하게 끝난다',
      '마시기 편하다', '개성 강하다',
    ],
  },
}

function NewNoteContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const wineId = searchParams.get('wine_id')
  const sessionId = searchParams.get('session_id')
  const { user } = useUser()

  const [wine, setWine] = useState<Wine | null>(null)
  const [rating, setRating] = useState(0)
  const [selected, setSelected] = useState<Record<string, string[]>>({
    aroma: [], taste: [], texture: [],
  })
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!wineId) return
    supabase.from('wines').select('*').eq('id', wineId).single()
      .then(({ data }) => setWine(data as Wine))
  }, [wineId])

  function toggleKeyword(category: string, kw: string) {
    setSelected((prev) => {
      const current = prev[category]
      return {
        ...prev,
        [category]: current.includes(kw)
          ? current.filter((k) => k !== kw)
          : [...current, kw],
      }
    })
  }

  async function handleSave() {
    if (!wineId || !user) return
    setSaving(true)
    try {
      await supabase.from('tasting_notes').insert({
        wine_id: wineId,
        user_id: user.id,
        session_id: sessionId ?? null,
        rating: rating > 0 ? rating : null,
        aroma_keywords: selected.aroma,
        taste_keywords: selected.taste,
        texture_keywords: selected.texture,
        memo: memo.trim() || null,
      })
      router.push(sessionId ? `/sessions/${sessionId}` : `/wines/${wineId}`)
    } finally {
      setSaving(false)
    }
  }

  const wineTypeLabel: Record<string, string> = {
    red: '레드', white: '화이트', orange: '오렌지',
    rose: '로제', sparkling: '스파클링', other: '기타',
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary">시음평 쓰기</h1>
        {wine && (
          <p className="text-sm text-muted-foreground mt-1">
            {wine.name}
            {wine.wine_type ? ` · ${wineTypeLabel[wine.wine_type] ?? wine.wine_type}` : ''}
          </p>
        )}
      </div>

      {/* 별점 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">총평</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n === rating ? 0 : n)}
              className={`text-3xl transition-opacity ${n <= rating ? 'opacity-100' : 'opacity-25'}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      {/* 키워드 */}
      {Object.entries(KEYWORDS).map(([key, { label, icon, items }]) => (
        <div key={key} className="space-y-2">
          <p className="text-sm font-medium">{icon} {label}</p>
          <div className="flex flex-wrap gap-2">
            {items.map((kw) => {
              const isSelected = selected[key].includes(kw)
              return (
                <button
                  key={kw}
                  onClick={() => toggleKeyword(key, kw)}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {kw}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* 메모 */}
      <div className="space-y-2">
        <p className="text-sm font-medium">메모 <span className="text-muted-foreground font-normal">(선택)</span></p>
        <Textarea
          placeholder="자유롭게 적어보세요..."
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
        />
      </div>

      <Button
        onClick={handleSave}
        disabled={saving || (rating === 0 && Object.values(selected).every((a) => a.length === 0))}
        className="w-full"
      >
        {saving ? '저장 중...' : '시음평 저장'}
      </Button>
    </div>
  )
}

export default function NewNotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-pulse">🍷</div></div>}>
      <NewNoteContent />
    </Suspense>
  )
}
