import { supabase } from './supabase'
import type { User } from './supabase'
export type { User }

const DEVICE_TOKEN_KEY = 'wine_club_device_token'
const USER_KEY = 'wine_club_user'

function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
  }
  return token
}

export async function login(
  nickname: string,
  inviteCode: string,
  adminPasscode?: string
): Promise<{ user: User }> {
  const correctInvite = process.env.NEXT_PUBLIC_INVITE_CODE ?? 'naturalvin'
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
    return { user: json.user as User }
  }

  // 1. 현재 기기에 이미 로그인된 유저
  const { data: byToken } = await supabase
    .from('users').select('*').eq('device_token', deviceToken).maybeSingle()
  if (byToken) {
    localStorage.setItem(USER_KEY, JSON.stringify(byToken))
    return { user: byToken as User }
  }

  // 2. 같은 이름의 기존 유저 → 코드 없이 이 기기로 로그인
  const { data: byNickname } = await supabase
    .from('users').select('*').eq('nickname', nickname.trim()).maybeSingle()
  if (byNickname) {
    await supabase.from('users').update({ device_token: deviceToken }).eq('id', byNickname.id)
    const updated = { ...byNickname, device_token: deviceToken }
    localStorage.setItem(USER_KEY, JSON.stringify(updated))
    return { user: updated as User }
  }

  // 3. 신규 가입: 초대코드 필요
  if (inviteCode.trim().toLowerCase() !== correctInvite.toLowerCase()) {
    throw new Error('초대 코드가 올바르지 않아요.')
  }

  const { data, error } = await supabase
    .from('users')
    .insert({ nickname: nickname.trim(), device_token: deviceToken, is_admin: false })
    .select()
    .single()

  if (error) throw error
  localStorage.setItem(USER_KEY, JSON.stringify(data))
  return { user: data as User }
}

export function logout() {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(DEVICE_TOKEN_KEY)
}
