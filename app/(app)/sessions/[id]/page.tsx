'use client'

import { useEffect, useState, useRef, use } from 'react'
import Link from 'next/link'
import { supabase, Session, SessionWine, Message } from '@/lib/supabase'
import { useUser } from '@/components/UserContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const statusLabel: Record<string, string> = {
  planning: '준비 중', active: '진행 중', completed: '완료',
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useUser()
  const [session, setSession] = useState<Session | null>(null)
  const [wines, setWines] = useState<SessionWine[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [tab, setTab] = useState<'chat' | 'wines'>('chat')
  const [showAddWine, setShowAddWine] = useState(false)
  const [newWineName, setNewWineName] = useState('')
  const [addingWine, setAddingWine] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('sessions').select('*').eq('id', id).single()
      .then(({ data }) => setSession(data as Session))

    fetchWines()

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

  async function fetchWines() {
    const { data } = await supabase
      .from('session_wines')
      .select('*, wine:wines(*), user:users(nickname)')
      .eq('session_id', id)
      .neq('status', 'removed')
      .order('order_index')
    setWines((data as SessionWine[]) ?? [])
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        <div className="flex gap-2 mt-3">
          {(['chat', 'wines'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-sm px-3 py-1 rounded-full transition-colors ${tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              {t === 'chat' ? '💬 채팅' : `🍾 와인 리스트 (${wines.length})`}
            </button>
          ))}
        </div>
      </div>

      {tab === 'wines' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">제안된 와인 목록</p>
            <div className="flex gap-2">
              <button onClick={() => setShowAddWine(!showAddWine)}
                className="text-xs text-primary font-medium">
                + 이름으로 제안
              </button>
              <Link href={`/scan?session_id=${id}`} className="text-xs text-muted-foreground">
                라벨 스캔
              </Link>
            </div>
          </div>

          {showAddWine && (
            <div className="bg-muted rounded-xl p-3 space-y-2">
              <p className="text-xs text-muted-foreground">와인 이름만 입력해도 리스트에 추가돼요</p>
              <div className="flex gap-2">
                <Input
                  placeholder="ex. Coulée de Serrant 2019"
                  value={newWineName}
                  onChange={(e) => setNewWineName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addWineByName() }}
                  className="flex-1"
                  autoFocus
                />
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
              <button onClick={() => setShowAddWine(true)} className="text-primary text-sm underline">
                와인 제안하기
              </button>
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
                  <Link href={`/notes/new?wine_id=${sw.wine_id}&session_id=${id}`}
                    className="text-xs text-primary font-medium">
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
      ) : (
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
