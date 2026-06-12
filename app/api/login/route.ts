import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { nickname, deviceToken } = await req.json()

  if (!nickname?.trim() || !deviceToken) {
    return NextResponse.json({ error: '닉네임과 기기 정보가 필요해요.' }, { status: 400 })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('nickname', nickname.trim())
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: updated, error: updateError } = await supabase
    .from('users')
    .update({ device_token: deviceToken })
    .eq('id', user.id)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ user: updated })
}
