import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { allow, retryAfterSeconds } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!allow(`register:${ip}`, 10, 15 * 60 * 1000)) {
    const retry = retryAfterSeconds(`register:${ip}`)
    return NextResponse.json(
      { error: `시도 횟수를 초과했어요. ${retry}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(retry) } }
    )
  }

  const { nickname, deviceToken, inviteCode } = await req.json()

  if (!nickname?.trim() || !deviceToken) {
    return NextResponse.json({ error: '닉네임과 기기 정보가 필요해요.' }, { status: 400 })
  }

  const correctInvite = process.env.INVITE_CODE ?? 'naturalvin'
  if (!inviteCode || inviteCode.trim().toLowerCase() !== correctInvite.toLowerCase()) {
    return NextResponse.json({ error: '초대 코드가 올바르지 않아요.' }, { status: 403 })
  }

  // 동명이인 중복 가입 방지 (기존 유저는 /api/login 의 기기 변경 흐름 사용)
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('nickname', nickname.trim())
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: '이미 같은 이름의 멤버가 있어요. 다른 이름을 사용해주세요.' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('users')
    .insert({ nickname: nickname.trim(), device_token: deviceToken, is_admin: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}
