import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { allow, retryAfterSeconds } from '@/lib/rate-limit'

// service role key: RLS를 우회해 is_admin=true 삽입 가능
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!allow(`admin-login:${ip}`, 5, 15 * 60 * 1000)) {
    const retry = retryAfterSeconds(`admin-login:${ip}`)
    return NextResponse.json(
      { error: `시도 횟수를 초과했어요. ${retry}초 후 다시 시도해주세요.` },
      { status: 429, headers: { 'Retry-After': String(retry) } }
    )
  }

  const { nickname, deviceToken, passcode } = await req.json()

  const correct = process.env.ADMIN_PASSCODE
  if (!correct || passcode !== correct) {
    return NextResponse.json({ error: '관리자 코드가 올바르지 않아요.' }, { status: 401 })
  }

  const { data: existing } = await supabase
    .from('users').select('*').eq('nickname', nickname.trim()).maybeSingle()

  if (existing) {
    await supabase.from('users').update({ device_token: deviceToken }).eq('id', existing.id)
    return NextResponse.json({ user: { ...existing, device_token: deviceToken } })
  }

  const { data, error } = await supabase
    .from('users')
    .insert({ nickname: nickname.trim(), device_token: deviceToken, is_admin: true })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}
