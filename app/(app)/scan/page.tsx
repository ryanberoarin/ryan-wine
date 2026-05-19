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
  is_natural: boolean
  ai_description: string | null
}

const wineTypeLabels: Record<string, string> = {
  red: '레드', white: '화이트', orange: '오렌지',
  rose: '로제', sparkling: '스파클링', other: '기타',
}

// Auto-process: center-crop to 3:4 portrait, max 1080px wide
async function processWineImage(file: File): Promise<{ dataUrl: string; base64: string }> {
  const blobUrl = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      const { naturalWidth: iw, naturalHeight: ih } = img
      const TARGET = 3 / 4  // portrait aspect ratio for wine labels

      let cropX: number, cropY: number, cropW: number, cropH: number

      if (iw / ih > TARGET) {
        // landscape → crop width to portrait
        cropH = ih
        cropW = Math.round(ih * TARGET)
        cropX = Math.round((iw - cropW) / 2)
        cropY = 0
      } else {
        // portrait/square → crop height, offset slightly up (labels are usually upper half)
        cropW = iw
        cropH = Math.min(ih, Math.round(iw / TARGET))
        cropX = 0
        cropY = Math.round(Math.max(0, ih - cropH) * 0.3)
      }

      const scale = Math.min(1, 1080 / cropW)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(cropW * scale)
      canvas.height = Math.round(cropH * scale)
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
      resolve({ dataUrl, base64: dataUrl.split(',')[1] })
    }
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('이미지 처리 실패')) }
    img.src = blobUrl
  })
}

function ScanContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const { user } = useUser()

  if (user && !user.is_admin) {
    router.replace('/home')
    return null
  }

  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [wineData, setWineData] = useState<WineData | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcessing(true)
    setPreview(null)
    setWineData(null)
    setError('')
    try {
      const { dataUrl, base64 } = await processWineImage(file)
      setPreview(dataUrl)
      setImageBase64(base64)
    } catch {
      setError('이미지 처리에 실패했어요. 다른 사진으로 시도해보세요.')
    } finally {
      setProcessing(false)
    }
  }

  async function handleScan() {
    if (!imageBase64) return
    setScanning(true)
    setError('')
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mediaType: 'image/jpeg' }),
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
      if (imageBase64) {
        const blob = await fetch(`data:image/jpeg;base64,${imageBase64}`).then((r) => r.blob())
        const { data: uploadData } = await supabase.storage
          .from('wine-labels')
          .upload(`${Date.now()}.jpg`, blob, { contentType: 'image/jpeg' })
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

      router.push(`/notes/new?wine_id=${wine.id}${sessionId ? `&session_id=${sessionId}` : ''}`)
    } catch (err: any) {
      setError(err.message ?? '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setPreview(null)
    setWineData(null)
    setImageBase64(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary">와인 스캔</h1>
        <p className="text-sm text-muted-foreground">
          {sessionId ? '모임에 와인을 추가해요' : '라벨 사진을 찍으면 AI가 정보를 읽어드려요'}
        </p>
      </div>

      {/* No image yet */}
      {!preview && !processing && (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border rounded-2xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
        >
          <div className="h-52 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <span className="text-5xl">📷</span>
            <span className="text-sm font-medium">탭해서 사진 선택</span>
          </div>
        </div>
      )}

      {/* Processing */}
      {processing && (
        <div className="h-52 rounded-2xl bg-muted flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-3xl animate-pulse">🍷</div>
            <p className="text-sm text-muted-foreground">이미지 처리 중...</p>
          </div>
        </div>
      )}

      {/* Processed preview */}
      {preview && (
        <div
          onClick={!wineData ? () => fileRef.current?.click() : undefined}
          className={`rounded-2xl overflow-hidden bg-muted ${!wineData ? 'cursor-pointer' : ''}`}
        >
          <img
            src={preview}
            alt="라벨 미리보기"
            className="w-full object-cover"
            style={{ aspectRatio: '3/4', objectPosition: 'center' }}
          />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />

      {/* Scan button */}
      {preview && !wineData && !processing && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset} className="flex-1">다시 찍기</Button>
          <Button onClick={handleScan} disabled={scanning} className="flex-1">
            {scanning ? '분석 중...' : '라벨 분석하기'}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Results */}
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
              <div className="flex flex-col gap-1 items-end shrink-0">
                {wineData.wine_type && <Badge>{wineTypeLabels[wineData.wine_type] ?? wineData.wine_type}</Badge>}
                {wineData.vintage && <span className="text-xs text-muted-foreground">{wineData.vintage}년</span>}
                {wineData.is_natural && <Badge variant="secondary">내추럴</Badge>}
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
            <Button variant="outline" onClick={handleReset} className="flex-1">다시 찍기</Button>
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
