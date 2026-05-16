'use client'

import { useEffect, useState, useRef, use } from 'react'
import Link from 'next/link'
import { supabase, Session, SessionWine, Message, SessionRsvp } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const statusLabel: Record<string, string> = {
  planning: '준비 중', active: '진행 중', completed: '완료',
}

type Tab = 'chat' | 'wines' | 'settlement'

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useUser()
  const [session, setSession] = useState<Session | null>(null)
  const [wines, setWines] = useState<SessionWine[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [rsvps, setRsvps] = useState<SessionRsvp[]>([])
  const [myRsvp, setMyRsvp] = useState<'attending' | 'not_attending' | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [tab, setTab] = useState<Tab>('chat')
  const [showAddWine, setShowAddWine] = useState(false)
  const [newWineName, setNewWineName] = useState('')
  const [addingWine, setAddingWine] = useState(false)
  const [costInput, setCostInput] = useState('')
  const [savingCost, setSavingCost] = useState(false)
  const [generatingReview, setGeneratingReview] = useState(false)
  const [review, setReview] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('sessions').select('*').eq('id', id).single()
      .then(({ data }) => {
        const s = data as Session
        setSession(s)
        if (s?.total_cost) setCostInput(String(s.total_cost))
      })

    fetchWines()
    fetchRsvps()

    supabase.from('messages')
      .select('*, user:users(nickname), wine:wines(name)')
      .eq('session_id', id)
      .order('created_at')
      .then(({ data }) => setMessages((data as Message[]) ?? []))

    const channel = supabase
      .channel(`session:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${id}` },
        async (payload) => {
          const { data } = await supabase
            .from('messages')
            .select('*, user:users(nickname), wine:wines(name)')
            .eq('id', payload.new.id)
            .single()
          if (data) setMessages((prev) => [...prev, data as Message])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [id])

  useEffect(() => {
    if (user) {
      const mine = rsvps.find((r) => r.user_id === user.id)
      setMyRsvp(mine?.status ?? null)
    }
  }, [rsvps, user])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchWines() {
    const { data } = await supabase
      .from('session_wines')
      .select('*, wine:wines(*), user:users(nickname)')
      .eq('session_id', id)
      .neq('status', 'removed')
      .order('order_index')
    setWines((data as SessionWine[]) ?? [])
  }

  async function fetchRsvps() {
    const { data } = await supabase
      .from('session_rsvps')
      .select('*, user:users(nickname)')
      .eq('session_id', id)
    setRsvps((data as SessionRsvp[]) ?? [])
  }

  async function handleRsvp(status: 'attending' | 'not_attending') {
    if (!user) return
    await supabase.from('session_rsvps').upsert(
      { session_id: id, user_id: user.id, status },
      { onConflict: 'session_id,user_id' }
    )
    setMyRsvp(status)
    fetchRsvps()
  }

  async function sendMessage() {
    if (!text.trim() || !user) return
    setSending(true)
    await supabase.from('messages').insert({
      session_id: id, user_id: user.id, message_type: 'text', content: text.trim(),
    })
    setText('')
    setSending(false)
  }

  async function addWineByName() {
    if (!newWineName.trim() || !user) return
    setAddingWine(true)
    const { data: wine } = await supabase
      .from('wines')
      .insert({ name: newWineName.trim(), created_by: user.id })
      .select()
      .single()
    if (wine) {
      await supabase.from('session_wines').insert({
        session_id: id, wine_id: wine.id, added_by: user.id,
      })
      await fetchWines()
      setNewWineName('')
      setShowAddWine(false)
    }
    setAddingWine(false)
  }

  async function confirmWine(swId: string) {
    await supabase.from('session_wines').update({ status: 'confirmed' }).eq('id', swId)
    setWines((prev) => prev.map((w) => w.id === swId ? { ...w, status: 'confirmed' } : w))
  }

  async function removeWine(swId: string) {
    await supabase.from('session_wines').update({ status: 'removed' }).eq('id', swId)
    setWines((prev) => prev.filter((w) => w.id !== swId))
  }

  async function saveCost() {
    const cost = parseInt(costInput.replace(/,/g, ''))
    if (isNaN(cost) || cost <= 0) return
    setSavingCost(true)
    await supabase.from('sessions').update({ total_cost: cost }).eq('id', id)
    setSession((prev) => prev ? { ...prev, total_cost: cost } : prev)
    setSavingCost(false)
  }

  async function generateReview() {
    setGeneratingReview(true)
    setReview('')
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: id }),
      })
      const json = await res.json()
      if (json.success) setReview(json.review)
      else setReview('후기 생성에 실패했어요. 다시 시도해주세요.')
    } catch {
      setReview('후기 생성에 실패했어요. 다시 시도해주세요.')
    }
    setGeneratingReview(false)
  }

  const attendingList = rsvps.filter((r) => r.status === 'attending')
  const attendingCount = attendingList.length
  const perPerson = session?.total_cost && attendingCount > 0
    ? Math.ceil(session.total_cost / attendingCount)
    : null

  if (!session) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-4xl animate-pulse">🍷</div></div>
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* 헤더 */}
      <div className="px-4 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-primary">{session.title}</h1>
            <p className="text-xs text-muted-foreground">{statusLabel[session.status]}</p>
          </div>
          {session.scheduled_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(session.scheduled_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
            </span>
          )}
        </div>

        {/* RSVP */}
        <div className="flex items-center gap-3 mt-3">
          <div className="flex gap-2">
            <button
              onClick={() => handleRsvp('attending')}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                myRsvp === 'attending'
                  ? 'bg-green-500 text-white border-green-500'
                  : 'border-border text-muted-foreground'
              }`}
            >
              ✓ 참석
            </button>
            <button
              onClick={() => handleRsvp('not_attending')}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                myRsvp === 'not_attending'
                  ? 'bg-muted text-foreground border-foreground/30'
                  : 'border-border text-muted-foreground'
              }`}
            >
              ✕ 불참
            </button>
          </div>
          {attendingCount > 0 && (
            <span className="text-xs text-muted-foreground">참석 {attendingCount}명</span>
          )}
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mt-3">
          {([['chat', '💬 채팅'], ['wines', `🍾 와인 (${wines.length})`], ['settlement', '💰 정산']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm px-3 py-1 rounded-full transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 와인 탭 */}
      {tab === 'wines' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">제안된 와인 목록</p>
            <div className="flex gap-2">
              <button onClick={() => setShowAddWine(!showAddWine)} className="text-xs text-primary font-medium">
                + 이름으로 제안
              </button>
              <Link href={`/scan?session_id=${id}`} className="text-xs text-muted-foreground">라벨 스캔</Link>
            </div>
          </div>

          {showAddWine && (
            <div className="bg-muted rounded-xl p-3 space-y-2">
              <p className="text-xs text-muted-foreground">와인 이름만 입력해도 리스트에 추가돼요</p>
              <div className="flex gap-2">
                <Input placeholder="ex. Coulée de Serrant 2019" value={newWineName}
                  onChange={(e) => setNewWineName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addWineByName() }}
                  className="flex-1" autoFocus />
                <Button size="sm" onClick={addWineByName} disabled={!newWineName.trim() || addingWine}>
                  {addingWine ? '...' : '추가'}
                </Button>
              </div>
            </div>
          )}

          {wines.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <div className="text-4xl">🫙</div>
              <p className="text-sm text-muted-foreground">아직 와인이 없어요</p>
              <button onClick={() => setShowAddWine(true)} className="text-primary text-sm underline">와인 제안하기</button>
            </div>
          ) : (
            wines.map((sw) => (
              <div key={sw.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{sw.wine?.name ?? '이름 없음'}</p>
                    <p className="text-xs text-muted-foreground">
                      {[(sw as any).user?.nickname && `제안: ${(sw as any).user?.nickname}`,
                        sw.wine?.producer, sw.wine?.vintage].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Badge variant={sw.status === 'confirmed' ? 'default' : 'secondary'} className="text-xs shrink-0">
                    {sw.status === 'confirmed' ? '확정' : '제안'}
                  </Badge>
                </div>
                <div className="flex gap-3">
                  <Link href={`/notes/new?wine_id=${sw.wine_id}&session_id=${id}`} className="text-xs text-primary font-medium">
                    시음평 쓰기
                  </Link>
                  {user?.is_admin && sw.status !== 'confirmed' && (
                    <button onClick={() => confirmWine(sw.id)} className="text-xs text-green-600 font-medium">확정</button>
                  )}
                  {user?.is_admin && (
                    <button onClick={() => removeWine(sw.id)} className="text-xs text-destructive font-medium">제거</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 정산 탭 */}
      {tab === 'settlement' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* 참석자 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">참석자 ({attendingCount}명)</p>
            {attendingList.length === 0 ? (
              <p className="text-sm text-muted-foreground">아직 참석 응답이 없어요</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {attendingList.map((r) => (
                  <span key={r.id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded-full">
                    {(r as any).user?.nickname ?? '멤버'}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 비용 입력 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold">총 비용</p>
            {user?.is_admin ? (
              <div className="flex gap-2">
                <Input placeholder="금액 입력 (원)" value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  type="number" className="flex-1" />
                <Button size="sm" onClick={saveCost} disabled={savingCost}>
                  {savingCost ? '...' : '저장'}
                </Button>
              </div>
            ) : (
              <p className="text-lg font-bold text-primary">
                {session.total_cost ? `${session.total_cost.toLocaleString()}원` : '미입력'}
              </p>
            )}
          </div>

          {/* 1인당 금액 */}
          {session.total_cost && attendingCount > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 text-center space-y-1">
              <p className="text-xs text-muted-foreground">1인당 금액</p>
              <p className="text-3xl font-bold text-primary">{perPerson?.toLocaleString()}원</p>
              <p className="text-xs text-muted-foreground">
                총 {session.total_cost.toLocaleString()}원 ÷ {attendingCount}명
              </p>
            </div>
          )}

          {/* 후기 생성 (관리자) */}
          {user?.is_admin && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div>
                <p className="text-sm font-semibold">모임 후기 자동 생성</p>
                <p className="text-xs text-muted-foreground mt-0.5">시음평 데이터를 바탕으로 회사 게시판용 후기를 AI가 작성해요</p>
              </div>
              <Button onClick={generateReview} disabled={generatingReview} className="w-full">
                {generatingReview ? '✍️ 작성 중...' : '✍️ 후기 생성하기'}
              </Button>
              {review && (
                <div className="space-y-2">
                  <div className="bg-muted rounded-xl p-4 text-sm whitespace-pre-wrap leading-relaxed">
                    {review}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(review)}
                    className="text-xs text-primary font-medium"
                  >
                    📋 복사하기
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 채팅 탭 */}
      {tab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                아직 메시지가 없어요. 먼저 말 걸어보세요 🍷
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.user_id === user?.id
              return (
                <div key={msg.id} className={`flex flex-col gap-1 ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <span className="text-xs text-muted-foreground px-1">{(msg as any).user?.nickname}</span>
                  )}
                  <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                    isMe ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-card border border-border rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">
                    {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
          <div className="px-4 py-3 border-t border-border bg-card shrink-0 flex gap-2">
            <Input placeholder="메시지를 입력하세요..." value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }} />
            <Button onClick={sendMessage} disabled={!text.trim() || sending} size="sm">전송</Button>
          </div>
        </>
      )}
    </div>
  )
}
