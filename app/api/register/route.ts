import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { nickname, deviceToken, inviteCode } = await req.json()

  if (!nickname?.trim() || !deviceToken) {
    return NextResponse.json({ error: '닉네임과 기기 정보가 필요해요.' }, { status: 400 })
  }

  const correctInvite = process.env.INVITE_CODE ?? 'naturalvin'
  if (!inviteCode || inviteCode.trim().toLowerCase() !== correctInvite.toLowerCase()) {
    return NextResponse.json({ error: '초대 코드가 올바르지 않아요.' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('users')
    .insert({ nickname: nickname.trim(), device_token: deviceToken, is_admin: false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}
