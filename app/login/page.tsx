'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/auth'
import { useUser } from '@/components/UserContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import WineLogo from '@/components/WineLogo'

type Mode = 'join' | 'admin'

export default function LoginPage() {
  const router = useRouter()
  const { setUser } = useUser()
  const [mode, setMode] = useState<Mode>('join')
  const [nickname, setNickname] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [adminPasscode, setAdminPasscode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      const { user } = await login(nickname.trim(), inviteCode.trim())
      setUser(user)
      router.push('/')
    } catch (err: any) {
      setError(err.message ?? '입장 오류가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdminJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      const { user } = await login(nickname.trim(), '', adminPasscode)
      setUser(user)
      router.push('/')
    } catch (err: any) {
      setError(err.message ?? '관리자 코드가 올바르지 않아요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center"><WineLogo size={88} /></div>
          <div>
            <h1 className="text-2xl font-bold text-primary">자연스러운 와인 모임</h1>
            <p className="text-sm text-muted-foreground mt-1">내추럴와인 동호회 전용 공간</p>
          </div>
        </div>

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nickname">이름</Label>
              <Input
                id="nickname"
                placeholder="가입할 때 사용한 이름"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite">
                초대 코드
                <span className="text-muted-foreground font-normal ml-1">(처음 가입할 때만 필요)</span>
              </Label>
              <Input
                id="invite"
                placeholder="동호회 초대 코드"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!nickname.trim() || loading}>
              {loading ? '입장 중...' : '입장하기'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              이전에 가입했다면 이름만 입력해도 바로 들어올 수 있어요
            </p>
          </form>
        )}

        {mode === 'admin' && (
          <form onSubmit={handleAdminJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-name">이름</Label>
              <Input
                id="admin-name"
                placeholder="이름 입력"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-code">관리자 코드</Label>
              <Input
                id="admin-code"
                type="password"
                placeholder="관리자 코드"
                value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!nickname.trim() || !adminPasscode || loading}>
              {loading ? '입장 중...' : '관리자로 입장'}
            </Button>
          </form>
        )}

        <div className="flex justify-center gap-4 text-xs text-muted-foreground/40">
          {mode !== 'join' && (
            <button onClick={() => { setMode('join'); setError('') }}>일반 입장</button>
          )}
          {mode !== 'admin' && (
            <button onClick={() => { setMode('admin'); setError('') }}>관리자</button>
          )}
        </div>
      </div>
    </div>
  )
}
