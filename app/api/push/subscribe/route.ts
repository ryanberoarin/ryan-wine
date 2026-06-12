import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUser } from '@/lib/api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

  try {
    const { subscription } = await req.json()
    if (!subscription) {
      return NextResponse.json({ error: 'missing subscription' }, { status: 400 })
    }

    await supabase.from('push_subscriptions').upsert(
      { user_id: user.id, subscription, endpoint: subscription.endpoint },
      { onConflict: 'endpoint' }
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
