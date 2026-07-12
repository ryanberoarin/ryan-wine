'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { getDeviceToken } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

function defaultTitle() {
  const next = (new Date().getMonth() + 2) % 12 || 12
  return `${next}월 정기모임`
}

function computeRsvpDeadline(scheduledAt: string): string {
  const d = new Date(scheduledAt)
  d.setDate(d.getDate() - 14)
  d.setHours(18, 0, 0, 0)
  // datetime-local format: YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`
}

export default function NewSessionPage() {
  const router = useRouter()
  const { user } = useUser()
  const [title, setTitle] = useState(defaultTitle())
  const [description, setDescription] = useState('')
  const [venue, setVenue] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [rsvpDeadline, setRsvpDeadline] = useState('')
  const [carryover, setCarryover] = useState(0)
  const [carryoverLoading, setCarryoverLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function fetchCarryover() {
      const { data: lastSession } = await supabase
        .from('sessions')
        .select('id')
        .eq('settlement_published', true)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!lastSession) { setCarryoverLoading(false); return }

      // 이월은 지원금 대상(복수가입 제외) 불참자 기준.
      // 직전 정산이 스냅샷으로 확정됐으면 그 값을 그대로 사용.
      const { data: lastFull } = await supabase
        .from('sessions')
        .select('settlement_snapshot, subsidy_carryover')
        .eq('id', lastSession.id)
        .single()

      if (lastFull?.settlement_snapshot?.carryover_to_next !== undefined) {
        setCarryover(lastFull.settlement_snapshot.carryover_to_next)
        setCarryoverLoading(false)
        return
      }

      const [{ count: totalEligible }, { data: attendingRows }] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true })
          .eq('is_active', true).eq('subsidy_eligible', true),
        supabase.from('session_rsvps').select('user_id, user:users(subsidy_eligible)')
          .eq('session_id', lastSession.id).eq('status', 'attending'),
      ])

      const attendingEligible = (attendingRows ?? [])
        .filter((r: any) => r.user?.subsidy_eligible !== false).length
      const notAttending = Math.max(0, (totalEligible ?? 0) - attendingEligible)
      setCarryover(notAttending * 17500)
      setCarryoverLoading(false)
    }
    fetchCarryover()
  }, [])

  if (!user?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">관리자만 모임을 만들 수 있어요.</p>
      </div>
    )
  }

  function handleScheduledAtChange(value: string) {
    setScheduledAt(value)
    if (value) setRsvpDeadline(computeRsvpDeadline(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        venue: venue.trim() || null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        rsvp_deadline: rsvpDeadline ? new Date(rsvpDeadline).toISOString() : null,
        subsidy_carryover: carryover,
        created_by: user!.id,
      })
      .select()
      .single()
    if (!error && data) {
      // 참석 투표 시작 알림 발송
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': getDeviceToken() },
        body: JSON.stringify({
          title: '🥂 새 모임 참석 투표가 시작됐어요!',
          body: `${data.title} 참석 여부를 알려주세요.${data.rsvp_deadline ? ` 마감: ${new Date(data.rsvp_deadline).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}` : ''}`,
          url: `/sessions/${data.id}`,
        }),
      }).catch(() => {})
      router.push(`/sessions/${data.id}`)
    }
    setSaving(false)
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-primary">새 모임 만들기</h1>
        <p className="text-sm text-muted-foreground">와인 리스트를 함께 짜고 시음평을 나눠보세요</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">모임 이름</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="desc">설명 <span className="text-muted-foreground font-normal">(선택)</span></Label>
          <Textarea
            id="desc"
            placeholder="어떤 테마의 모임인지..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="venue">장소 <span className="text-muted-foreground font-normal">(선택)</span></Label>
          <Input
            id="venue"
            placeholder="ex. 강남구 와인바 오르치아"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">모임 날짜 <span className="text-muted-foreground font-normal">(선택)</span></Label>
          <Input
            id="date"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => handleScheduledAtChange(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rsvp">
            참석 투표 마감
            <span className="text-muted-foreground font-normal ml-1">(모임 2주 전 오후 6시 자동 설정)</span>
          </Label>
          <Input
            id="rsvp"
            type="datetime-local"
            value={rsvpDeadline}
            onChange={(e) => setRsvpDeadline(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="carryover">
            전월 이월 지원금
            <span className="text-muted-foreground font-normal ml-1">
              {carryoverLoading ? '(계산 중...)' : carryover > 0 ? '(자동 계산됨)' : '(이전 정산 없음)'}
            </span>
          </Label>
          <Input
            id="carryover"
            type="number"
            value={carryover}
            onChange={(e) => setCarryover(parseInt(e.target.value) || 0)}
            placeholder="0"
          />
          {!carryoverLoading && carryover > 0 && (
            <p className="text-xs text-muted-foreground">직전 정산 불참자 이월금이 자동 입력됐어요. 필요 시 수정 가능해요.</p>
          )}
        </div>

        <Button type="submit" disabled={!title.trim() || saving} className="w-full">
          {saving ? '만드는 중...' : '모임 만들기'}
        </Button>
      </form>
    </div>
  )
}
