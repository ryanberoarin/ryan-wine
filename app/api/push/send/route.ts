import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { title, body, url } = await req.json()

    const { data: subs } = await supabase.from('push_subscriptions').select('subscription')
    if (!subs || subs.length === 0) {
      return NextResponse.json({ success: true, sent: 0 })
    }

    const payload = JSON.stringify({ title, body, url })
    const results = await Promise.allSettled(
      subs.map((row) => webpush.sendNotification(row.subscription, payload))
    )
    const sent = results.filter((r) => r.status === 'fulfilled').length

    return NextResponse.json({ success: true, sent, total: subs.length })
  } catch (err: any) {
    console.error('push send error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
