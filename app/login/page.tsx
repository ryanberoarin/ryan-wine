'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login, loginWithRecoveryCode } from '@/lib/auth'
import { useUser } from '@/components/UserContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function WineLogo() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="circle-clip">
          <circle cx="40" cy="40" r="39" />
        </clipPath>
      </defs>
      <circle cx="40" cy="40" r="40" fill="#03C75A" />
      <g clipPath="url(#circle-clip)">
        <rect x="6" y="17" width="9" height="42" rx="1.5" fill="white" />
        <rect x="31" y="17" width="9" height="42" rx="1.5" fill="white" />
        <polygon points="6,17 15,17 40,50 40,59 31,59 6,26" fill="white" />
        <path d="M44 17 L76 17 C76 17 78 38 60 45 C42 38 44 17 44 17 Z" fill="white" />
        <path d="M47 30 L73 30 C73 30 75 38 60 45 C45 38 47 30 47 30 Z" fill="#7B1A2E" />
        <rect x="58" y="45" width="4" height="13" rx="1" fill="white" />
        <rect x="50" y="58" width="20" height="4" rx="2" fill="white" />
      </g>
    </svg>
  )
}

type Mode = 'join' | 'recovery' | 'admin'

export default function LoginPage() {
  const router = useRouter()
  const { setUser } = useUser()
  const [mode, setMode] = useState<Mode>('join')
  const [nickname, setNickname] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [adminPasscode, setAdminPasscode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [newRecoveryCode, setNewRecoveryCode] = useState('')

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim() || !inviteCode.trim()) return
    setLoading(true)
    setError('')
    try {
      const { user, recoveryCode: rc } = await login(nickname.trim(), inviteCode.trim())
      setUser(user)
      if (rc) {
        setNewRecoveryCode(rc)
      } else {
        router.push('/')
      }
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
      const { user, recoveryCode: rc } = await login(nickname.trim(), '', adminPasscode)
      setUser(user)
      if (rc) setNewRecoveryCode(rc)
      else router.push('/')
    } catch (err: any) {
      setError(err.message ?? '관리자 코드가 올바르지 않아요.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault()
    if (!recoveryCode.trim()) return
    setLoading(true)
    setError('')
    try {
      const user = await loginWithRecoveryCode(recoveryCode.trim())
      setUser(user)
      router.push('/')
    } catch (err: any) {
      setError(err.message ?? '복구 코드를 찾을 수 없어요.')
    } finally {
      setLoading(false)
    }
  }

  if (newRecoveryCode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="text-5xl">🔑</div>
          <div>
            <h2 className="text-xl font-bold text-primary">복구 코드를 저장해주세요</h2>
            <p className="text-sm text-muted-foreground mt-1">기기를 바꿀 때 이 코드로 내 기록을 복원할 수 있어요</p>
          </div>
          <div className="bg-muted rounded-2xl p-6">
            <p className="text-3xl font-mono font-bold tracking-widest text-primary">{newRecoveryCode}</p>
            <p className="text-xs text-muted-foreground mt-2">스크린샷 찍어두세요</p>
          </div>
          <Button className="w-full" onClick={() => router.push('/')}>
            저장했어요, 입장하기
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="flex justify-center"><WineLogo /></div>
          <div>
            <h1 className="text-2xl font-bold text-primary">자연스러운 와인 모임</h1>
            <p className="text-sm text-muted-foreground mt-1">내추럴와인 동호회 전용 공간</p>
          </div>
        </div>

        {mode === 'join' && (
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nickname">이름</Label>
              <Input id="nickname" placeholder="본명을 기입해주세요" value={nickname}
                onChange={(e) => setNickname(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite">초대 코드</Label>
              <Input id="invite" placeholder="동호회 초대 코드 입력" value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!nickname.trim() || !inviteCode.trim() || loading}>
              {loading ? '입장 중...' : '입장하기'}
            </Button>
          </form>
        )}

        {mode === 'recovery' && (
          <form onSubmit={handleRecovery} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery">복구 코드</Label>
              <Input id="recovery" placeholder="6자리 복구 코드" value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)} autoFocus />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!recoveryCode.trim() || loading}>
              {loading ? '복구 중...' : '내 기록 복원하기'}
            </Button>
          </form>
        )}

        {mode === 'admin' && (
          <form onSubmit={handleAdminJoin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-name">이름</Label>
              <Input id="admin-name" placeholder="본명을 기입해주세요" value={nickname}
                onChange={(e) => setNickname(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-code">관리자 코드</Label>
              <Input id="admin-code" type="password" placeholder="관리자 코드" value={adminPasscode}
                onChange={(e) => setAdminPasscode(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={!nickname.trim() || !adminPasscode || loading}>
              {loading ? '입장 중...' : '관리자로 입장'}
            </Button>
          </form>
        )}

        <div className="flex justify-center gap-4 text-xs text-muted-foreground/60">
          {mode !== 'join' && (
            <button onClick={() => { setMode('join'); setError('') }}>초대 코드로 입장</button>
          )}
          {mode !== 'recovery' && (
            <button onClick={() => { setMode('recovery'); setError('') }}>기기 변경 / 복구</button>
          )}
          {mode !== 'admin' && (
            <button onClick={() => { setMode('admin'); setError('') }}>관리자로 입장</button>
          )}
        </div>
      </div>
    </div>
  )
}
