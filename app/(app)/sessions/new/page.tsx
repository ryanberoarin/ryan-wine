'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function NewSessionPage() {
  const router = useRouter()
  const { user } = useUser()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)

  if (!user?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">관리자만 모임을 만들 수 있어요.</p>
      </div>
    )
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
        scheduled_at: scheduledAt || null,
        created_by: user!.id,
      })
      .select()
      .single()
    if (!error && data) {
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
            placeholder="ex. 6월 내추럴와인 모임"
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
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="date">날짜 <span className="text-muted-foreground font-normal">(선택)</span></Label>
          <Input
            id="date"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>

        <Button type="submit" disabled={!title.trim() || saving} className="w-full">
          {saving ? '만드는 중...' : '모임 만들기'}
        </Button>
      </form>
    </div>
  )
}
