'use client'

import { useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type WineData = {
  name: string | null
  producer: string | null
  region: string | null
  country: string | null
  vintage: number | null
  grape_varieties: string[]
  wine_type: string | null
  natural: boolean
  ai_description: string | null
}

const wineTypeLabels: Record<string, string> = {
  red: '레드', white: '화이트', orange: '오렌지',
  rose: '로제', sparkling: '스파클링', other: '기타',
}

function ScanContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const { user } = useUser()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<string>('image/jpeg')
  const [scanning, setScanning] = useState(false)
  const [wineData, setWineData] = useState<WineData | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMediaType(file.type || 'image/jpeg')
    setPreview(URL.createObjectURL(file))
    setWineData(null)
    setError('')
    const reader = new FileReader()
    reader.onload = () => setImageBase64((reader.result as string).split(',')[1])
    reader.readAsDataURL(file)
  }

  async function handleScan() {
    if (!imageBase64) return
    setScanning(true)
    setError('')
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mediaType }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setWineData(json.data)
    } catch (err: any) {
      setError(err.message ?? '인식 실패. 다시 시도해주세요.')
    } finally {
      setScanning(false)
    }
  }

  async function handleSave() {
    if (!wineData || !user) return
    setSaving(true)
    try {
      let labelImageUrl: string | null = null
      if (imageBase64 && mediaType) {
        const ext = mediaType.split('/')[1] || 'jpg'
        const blob = await fetch(`data:${mediaType};base64,${imageBase64}`).then((r) => r.blob())
        const { data: uploadData } = await supabase.storage
          .from('wine-labels')
          .upload(`${Date.now()}.${ext}`, blob, { contentType: mediaType })
        if (uploadData) {
          labelImageUrl = supabase.storage.from('wine-labels').getPublicUrl(uploadData.path).data.publicUrl
        }
      }

      const { data: wine, error: wineError } = await supabase
        .from('wines')
        .insert({ ...wineData, label_image_url: labelImageUrl, created_by: user.id })
        .select()
        .single()
      if (wineError) throw wineError

      if (sessionId) {
        await supabase.from('session_wines').insert({
          session_id: sessionId,
          wine_id: wine.id,
          added_by: user.id,
        })
      }

      const noteUrl = `/notes/new?wine_id=${wine.id}${sessionId ? `&session_id=${sessionId}` : ''}`
      router.push(noteUrl)
    } catch (err: any) {
      setError(err.message ?? '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary">와인 스캔</h1>
        <p className="text-sm text-muted-foreground">
          {sessionId ? '모임에 와인을 추가해요' : '라벨 사진을 찍으면 AI가 정보를 읽어드려요'}
        </p>
      </div>

      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-border rounded-2xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
      >
        {preview ? (
          <img src={preview} alt="라벨 미리보기" className="w-full object-contain max-h-64" />
        ) : (
          <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <span className="text-4xl">📷</span>
            <span className="text-sm">탭해서 사진 선택</span>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />

      {preview && !wineData && (
        <Button onClick={handleScan} disabled={scanning} className="w-full">
          {scanning ? '분석 중...' : '라벨 분석하기'}
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {wineData && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-lg">{wineData.name ?? '이름 미확인'}</p>
                <p className="text-sm text-muted-foreground">
                  {[wineData.producer, wineData.region, wineData.country].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-col gap-1 items-end">
                {wineData.wine_type && <Badge>{wineTypeLabels[wineData.wine_type] ?? wineData.wine_type}</Badge>}
                {wineData.vintage && <span className="text-xs text-muted-foreground">{wineData.vintage}년</span>}
              </div>
            </div>
            {wineData.grape_varieties.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {wineData.grape_varieties.map((g) => (
                  <span key={g} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{g}</span>
                ))}
              </div>
            )}
            {wineData.ai_description && (
              <p className="text-sm text-muted-foreground">{wineData.ai_description}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { setWineData(null); setPreview(null) }} className="flex-1">
              다시 찍기
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? '저장 중...' : '시음평 쓰기 →'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-pulse">🍷</div></div>}>
      <ScanContent />
    </Suspense>
  )
}
