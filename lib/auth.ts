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

function generateRecoveryCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function getCurrentUser(): Promise<User | null> {
  const cached = localStorage.getItem(USER_KEY)
  if (cached) return JSON.parse(cached)

  const token = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) return null

  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('device_token', token)
    .single()

  if (data) {
    localStorage.setItem(USER_KEY, JSON.stringify(data))
    return data
  }
  return null
}

export async function login(
  nickname: string,
  inviteCode: string,
  adminPasscode?: string
): Promise<{ user: User; recoveryCode?: string }> {
  const correctInvite = process.env.NEXT_PUBLIC_INVITE_CODE ?? 'naturalvin'
  const correctAdmin = process.env.NEXT_PUBLIC_ADMIN_PASSCODE ?? 'wine1234'

  if (inviteCode.trim().toLowerCase() !== correctInvite.toLowerCase() && adminPasscode !== correctAdmin) {
    throw new Error('초대 코드가 올바르지 않아요.')
  }

  const isAdmin = adminPasscode === correctAdmin
  const deviceToken = getOrCreateDeviceToken()

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('device_token', deviceToken)
    .single()

  if (existing) {
    localStorage.setItem(USER_KEY, JSON.stringify(existing))
    return { user: existing as User }
  }

  const recoveryCode = generateRecoveryCode()

  const { data, error } = await supabase
    .from('users')
    .insert({ nickname, device_token: deviceToken, is_admin: isAdmin, recovery_code: recoveryCode })
    .select()
    .single()

  if (error) throw error

  localStorage.setItem(USER_KEY, JSON.stringify(data))
  return { user: data as User, recoveryCode }
}

export async function loginWithRecoveryCode(recoveryCode: string): Promise<User> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('recovery_code', recoveryCode.trim())
    .single()

  if (error || !data) throw new Error('복구 코드를 찾을 수 없어요.')

  const newDeviceToken = getOrCreateDeviceToken()
  await supabase.from('users').update({ device_token: newDeviceToken }).eq('id', data.id)

  const updated = { ...data, device_token: newDeviceToken }
  localStorage.setItem(USER_KEY, JSON.stringify(updated))
  return updated as User
}

export function logout() {
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem(DEVICE_TOKEN_KEY)
}
