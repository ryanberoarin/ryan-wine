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

type BatchItem = {
  id: string
  preview: string
  base64: string
  status: 'queued' | 'scanning' | 'done' | 'error'
  wineData?: WineData
  error?: string
}

const wineTypeLabels: Record<string, string> = {
  red: '레드', white: '화이트', orange: '오렌지',
  rose: '로제', sparkling: '스파클링', other: '기타',
}

async function processWineImage(file: File): Promise<{ dataUrl: string; base64: string }> {
  const blobUrl = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(blobUrl)
      const { naturalWidth: iw, naturalHeight: ih } = img
      const TARGET = 3 / 4

      let cropX: number, cropY: number, cropW: number, cropH: number

      if (iw / ih > TARGET) {
        cropH = ih
        cropW = Math.round(ih * TARGET)
        cropX = Math.round((iw - cropW) / 2)
        cropY = 0
      } else {
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

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  // Single mode state
  const [preview, setPreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [wineData, setWineData] = useState<WineData | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Batch mode state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [batchScanning, setBatchScanning] = useState(false)
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchSaved, setBatchSaved] = useState(false)

  if (user && !user.is_admin) {
    router.replace('/home')
    return null
  }

  const isBatchMode = batchItems.length > 0

  async function processSingleFile(file: File) {
    setProcessing(true)
    setPreview(null)
    setWineData(null)
    setError('')
    setBatchItems([])
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

  async function handleCameraChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await processSingleFile(file)
  }

  async function handleGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''

    if (files.length === 1) {
      await processSingleFile(files[0])
      return
    }

    setProcessing(true)
    setPreview(null)
    setWineData(null)
    setError('')
    setBatchSaved(false)

    try {
      const results = await Promise.allSettled(
        files.map(async (file, i): Promise<BatchItem> => {
          const { dataUrl, base64 } = await processWineImage(file)
          return {
            id: `${Date.now()}_${i}`,
            preview: dataUrl,
            base64,
            status: 'queued' as const,
          }
        })
      )

      const items: BatchItem[] = results
        .filter((r): r is PromiseFulfilledResult<BatchItem> => r.status === 'fulfilled')
        .map(r => r.value)

      if (items.length === 0) {
        setError('이미지 처리에 실패했어요.')
      } else {
        setBatchItems(items)
      }
    } catch {
      setError('이미지 처리에 실패했어요.')
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
        headers: { 'Content-Type': 'application/json', 'x-device-token': user!.device_token },
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

  async function handleBatchScan() {
    setBatchScanning(true)
    const snapshot = [...batchItems]

    for (const item of snapshot) {
      if (item.status !== 'queued') continue

      setBatchItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'scanning' } : it))

      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-device-token': user!.device_token },
          body: JSON.stringify({ imageBase64: item.base64, mediaType: 'image/jpeg' }),
        })
        const json = await res.json()
        if (!json.success) throw new Error(json.error)
        setBatchItems(prev => prev.map(it =>
          it.id === item.id ? { ...it, status: 'done', wineData: json.data } : it
        ))
      } catch (err: any) {
        setBatchItems(prev => prev.map(it =>
          it.id === item.id ? { ...it, status: 'error', error: err.message ?? '인식 실패' } : it
        ))
      }
    }

    setBatchScanning(false)
  }

  async function handleBatchSave() {
    if (!user) return
    setBatchSaving(true)

    const doneItems = batchItems.filter(it => it.status === 'done' && it.wineData)

    for (const item of doneItems) {
      try {
        let labelImageUrl: string | null = null
        const blob = await fetch(`data:image/jpeg;base64,${item.base64}`).then(r => r.blob())
        const { data: uploadData } = await supabase.storage
          .from('wine-labels')
          .upload(`${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`, blob, { contentType: 'image/jpeg' })
        if (uploadData) {
          labelImageUrl = supabase.storage.from('wine-labels').getPublicUrl(uploadData.path).data.publicUrl
        }

        const { data: wine, error: wineError } = await supabase
          .from('wines')
          .insert({ ...item.wineData, label_image_url: labelImageUrl, created_by: user.id })
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
      } catch (err) {
        console.error('batch item save error:', err)
      }
    }

    setBatchSaving(false)
    setBatchSaved(true)
  }

  function handleReset() {
    setPreview(null)
    setWineData(null)
    setImageBase64(null)
    setError('')
    if (cameraRef.current) cameraRef.current.value = ''
  }

  function handleBatchReset() {
    setBatchItems([])
    setBatchScanning(false)
    setBatchSaving(false)
    setBatchSaved(false)
    setError('')
    if (galleryRef.current) galleryRef.current.value = ''
  }

  const doneCount = batchItems.filter(it => it.status === 'done').length

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary">와인 스캔</h1>
        <p className="text-sm text-muted-foreground">
          {sessionId ? '모임에 와인을 추가해요' : '라벨 사진으로 AI가 정보를 읽어드려요'}
        </p>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleCameraChange} className="hidden" />
      <input ref={galleryRef} type="file" accept="image/*" multiple onChange={handleGalleryChange} className="hidden" />

      {/* Processing indicator */}
      {processing && (
        <div className="h-52 rounded-2xl bg-muted flex items-center justify-center">
          <div className="text-center space-y-2">
            <div className="text-3xl animate-pulse">🍷</div>
            <p className="text-sm text-muted-foreground">이미지 처리 중...</p>
          </div>
        </div>
      )}

      {/* ── BATCH MODE ── */}
      {isBatchMode && !processing && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{batchItems.length}장 선택됨</span>
            {!batchScanning && !batchSaved && (
              <button onClick={handleBatchReset} className="text-sm text-muted-foreground underline underline-offset-2">
                다시 선택
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {batchItems.map(item => (
              <div
                key={item.id}
                className="relative rounded-xl overflow-hidden bg-muted"
                style={{ aspectRatio: '3/4' }}
              >
                <img src={item.preview} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-2">
                  {item.status === 'queued' && (
                    <span className="text-white/60 text-xs">대기중</span>
                  )}
                  {item.status === 'scanning' && (
                    <span className="text-2xl animate-pulse">🍷</span>
                  )}
                  {item.status === 'done' && (
                    <>
                      <span className="text-xl">✅</span>
                      <p className="text-white text-xs font-medium text-center mt-1 line-clamp-2">
                        {item.wineData?.name ?? '분석완료'}
                      </p>
                    </>
                  )}
                  {item.status === 'error' && (
                    <>
                      <span className="text-xl">❌</span>
                      <p className="text-red-300 text-xs text-center mt-1">인식 실패</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Batch: start scan */}
          {!batchScanning && !batchSaved && batchItems.every(it => it.status === 'queued') && (
            <Button onClick={handleBatchScan} className="w-full">
              라벨 분석 시작
            </Button>
          )}

          {/* Batch: scanning progress */}
          {batchScanning && (
            <p className="text-center text-sm text-muted-foreground animate-pulse">
              분석 중... ({batchItems.filter(it => it.status === 'done' || it.status === 'error').length}/{batchItems.length})
            </p>
          )}

          {/* Batch: save */}
          {!batchScanning && !batchSaved && doneCount > 0 && (
            <Button onClick={handleBatchSave} disabled={batchSaving} className="w-full">
              {batchSaving ? '저장 중...' : `${doneCount}개 와인 저장하기`}
            </Button>
          )}

          {/* Batch: saved */}
          {batchSaved && (
            <div className="space-y-3">
              <div className="bg-card border border-border rounded-2xl p-4 text-center">
                <p className="font-bold text-lg">🎉 저장 완료!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {doneCount}개 와인이 등록되었어요
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleBatchReset} className="flex-1">
                  더 추가하기
                </Button>
                <Button
                  onClick={() => router.push(sessionId ? '/sessions' : '/home')}
                  className="flex-1"
                >
                  {sessionId ? '모임 보기' : '홈으로'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SINGLE MODE ── */}
      {!isBatchMode && !processing && (
        <>
          {/* Initial selection */}
          {!preview && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 transition-colors cursor-pointer"
              >
                <span className="text-4xl">📷</span>
                <span className="text-sm font-medium">사진 찍기</span>
              </button>
              <button
                onClick={() => galleryRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl h-40 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 transition-colors cursor-pointer"
              >
                <span className="text-4xl">🖼️</span>
                <span className="text-sm font-medium">갤러리 선택</span>
                <span className="text-xs opacity-70">여러 장 가능</span>
              </button>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div
              onClick={!wineData ? () => cameraRef.current?.click() : undefined}
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

          {/* Scan button */}
          {preview && !wineData && (
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
        </>
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
