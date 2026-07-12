import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { allow, retryAfterSeconds } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!allow(`login:${ip}`, 10, 15 * 60 * 1000)) {
    const retry = retryAfterSeconds(`login:${ip}`)
    return NextResponse.json(
      { error: `시도 횟수를 초과했어요. ${retry}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(retry) } }
    )
  }

  const { nickname, deviceToken, inviteCode } = await req.json()

  if (!nickname?.trim() || !deviceToken) {
    return NextResponse.json({ error: '닉네임과 기기 정보가 필요해요.' }, { status: 400 })
  }

  // 1. 같은 기기 재로그인: device_token 일치 시 그대로 통과
  const { data: byToken } = await supabase
    .from('users')
    .select('*')
    .eq('device_token', deviceToken)
    .eq('is_active', true)
    .maybeSingle()
  if (byToken) return NextResponse.json({ user: byToken })

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('nickname', nickname.trim())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 관리자 계정은 초대코드(전 멤버 공유)만으로 기기 이전 불가 — 관리자 코드 필수
  if (user.is_admin) {
    return NextResponse.json(
      { error: '관리자 계정이에요. 하단의 [관리자]로 입장해주세요.' },
      { status: 403 }
    )
  }

  // 기기 변경(device_token 교체)은 초대코드 재검증 필요 — 닉네임만 알면 탈취 가능한 취약점 방어
  const correctInvite = process.env.INVITE_CODE ?? 'naturalvin'
  if (!inviteCode || inviteCode.trim().toLowerCase() !== correctInvite.toLowerCase()) {
    return NextResponse.json(
      { error: '새 기기 인증을 위해 초대 코드가 필요해요.' },
      { status: 403 }
    )
  }

  const { data: updated, error: updateError } = await supabase
    .from('users')
    .update({ device_token: deviceToken })
    .eq('id', user.id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ user: updated })
}
