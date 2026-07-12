import type { User } from './supabase'
export type { User }

const DEVICE_TOKEN_KEY = 'wine_club_device_token'
const USER_KEY = 'wine_club_user'
const ISSUED_AT_KEY = 'wine_club_token_issued_at'
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30일

export function getDeviceToken(): string {
  return localStorage.getItem(DEVICE_TOKEN_KEY) ?? ''
}

function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
    localStorage.setItem(ISSUED_AT_KEY, String(Date.now()))
  }
  return token
}

function isTokenExpired(): boolean {
  const issuedAt = localStorage.getItem(ISSUED_AT_KEY)
  if (!issuedAt) return false
  return Date.now() - Number(issuedAt) > TOKEN_TTL_MS
}

export function setIssuedAt() {
  localStorage.setItem(ISSUED_AT_KEY, String(Date.now()))
}

export async function login(
  nickname: string,
  inviteCode: string,
  adminPasscode?: string
): Promise<{ user: User }> {
  // 토큰 만료 시 기존 세션 초기화
  if (isTokenExpired()) {
    localStorage.removeItem(DEVICE_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(ISSUED_AT_KEY)
  }

  const deviceToken = getOrCreateDeviceToken()

  // 관리자 로그인: 서버 API에서 passcode 검증 (클라이언트에 노출 안 됨)
  if (adminPasscode) {
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nickname.trim(), deviceToken, passcode: adminPasscode }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? '관리자 코드가 올바르지 않아요.')
    localStorage.setItem(USER_KEY, JSON.stringify(json.user))
    setIssuedAt()
    return { user: json.user as User }
  }

  // 서버에서 처리: 같은 기기 재로그인 → 기기 변경(초대코드 재검증) 순
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nickname.trim(), deviceToken, inviteCode: inviteCode.trim() }),
  })
  if (res.ok) {
    const json = await res.json()
    localStorage.setItem(USER_KEY, JSON.stringify(json.user))
    setIssuedAt()
    return { user: json.user as User }
  }
  if (res.status !== 404) {
    const json = await res.json()
    throw new Error(json.error ?? '새 기기로 입장하려면 초대 코드가 필요해요.')
  }

  // 신규 가입: 초대코드 서버에서 검증
  const res2 = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nickname.trim(), deviceToken, inviteCode: inviteCode.trim() }),
  })
  const json = await res2.json()
  if (!res2.ok) throw new Error(json.error ?? '가입에 실패했어요.')
  const data = json.user as User
  localStorage.setItem(USER_KEY, JSON.stringify(data))
  setIssuedAt()
  return { user: data }
}

export function logout() {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(DEVICE_TOKEN_KEY)
  localStorage.removeItem(ISSUED_AT_KEY)
}
