import { supabase } from './supabase'
import type { User } from './supabase'
export type { User }

const DEVICE_TOKEN_KEY = 'wine_club_device_token'
const USER_KEY = 'wine_club_user'
const ISSUED_AT_KEY = 'wine_club_token_issued_at'
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30일

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

  // 1. 현재 기기에 이미 로그인된 유저
  const { data: byToken } = await supabase
    .from('users').select('*').eq('device_token', deviceToken).maybeSingle()
  if (byToken) {
    localStorage.setItem(USER_KEY, JSON.stringify(byToken))
    return { user: byToken as User }
  }

  // 2. 같은 이름의 기존 유저 → 기기 변경 시 초대코드 재검증 (닉네임만으로 탈취 방지)
  const res2 = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nickname.trim(), deviceToken, inviteCode: inviteCode.trim() }),
  })
  if (res2.ok) {
    const json2 = await res2.json()
    localStorage.setItem(USER_KEY, JSON.stringify(json2.user))
    setIssuedAt()
    return { user: json2.user as User }
  }
  if (res2.status !== 404) {
    const json2 = await res2.json()
    throw new Error(json2.error ?? '새 기기로 입장하려면 초대 코드가 필요해요.')
  }

  // 3. 신규 가입: 초대코드 서버에서 검증
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: nickname.trim(), deviceToken, inviteCode: inviteCode.trim() }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? '가입에 실패했어요.')
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
