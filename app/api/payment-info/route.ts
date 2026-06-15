import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

  return NextResponse.json({
    bank: process.env.TOSS_BANK ?? '',
    account: process.env.TOSS_ACCOUNT ?? '',
  })
}
