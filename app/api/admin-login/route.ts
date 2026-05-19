import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
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
