import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { subscription, userId } = await req.json()
    if (!subscription || !userId) {
      return NextResponse.json({ error: 'missing fields' }, { status: 400 })
    }

    await supabase.from('push_subscriptions').upsert(
      { user_id: userId, subscription, endpoint: subscription.endpoint },
      { onConflict: 'endpoint' }
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
