import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/api-auth'

// users 테이블 쓰기는 anon RLS에서 차단됨 — 멤버 관리는 이 라우트(service role) 경유만 허용
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  if (!user.is_admin) return NextResponse.json({ error: '관리자만 사용할 수 있어요.' }, { status: 403 })

  const { userId, action, value } = await req.json()
  if (!userId || typeof value !== 'boolean' || !['set_active', 'set_subsidy'].includes(action)) {
    return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 })
  }
  if (action === 'set_active' && userId === user.id) {
    return NextResponse.json({ error: '본인 계정은 탈퇴 처리할 수 없어요.' }, { status: 400 })
  }

  const patch = action === 'set_active' ? { is_active: value } : { subsidy_eligible: value }
  const { data, error } = await supabase
    .from('users')
    .update(patch)
    .eq('id', userId)
    .select('id, nickname, is_admin, is_active, subsidy_eligible, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}
