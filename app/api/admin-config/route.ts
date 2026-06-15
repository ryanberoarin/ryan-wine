import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  if (!user.is_admin) return NextResponse.json({ error: '관리자만 접근할 수 있어요.' }, { status: 403 })

  return NextResponse.json({
    inviteCode: process.env.INVITE_CODE ?? '',
  })
}
