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

async function sendPushToSubscriptions(subscriptions: { subscription: object }[], title: string, body: string, url: string) {
  const payload = JSON.stringify({ title, body, url })
  await Promise.allSettled(
    subscriptions.map((row) => webpush.sendNotification(row.subscription as webpush.PushSubscription, payload))
  )
}

// 해당 월의 두 번째 금요일 (UTC 기준, 오후 8시 KST = 오전 11시 UTC)
function getSecondFriday(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month, 1))
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCDate(d.getUTCDate() + 7)
  d.setUTCHours(11, 0, 0, 0) // 오후 8시 KST
  return d
}

// 오늘(KST)이 목표일 N일 전인지 확인
function isKstDaysBefore(targetUtc: Date, days: number): boolean {
  const kstOffset = 9 * 3600000
  const triggerUtc = new Date(targetUtc.getTime() - days * 86400000)
  const kstNow = new Date(Date.now() + kstOffset)
  const kstTrigger = new Date(triggerUtc.getTime() + kstOffset)
  return (
    kstNow.getUTCFullYear() === kstTrigger.getUTCFullYear() &&
    kstNow.getUTCMonth() === kstTrigger.getUTCMonth() &&
    kstNow.getUTCDate() === kstTrigger.getUTCDate()
  )
}

function isSameKstDay(isoString: string, targetDate: Date): boolean {
  const kstOffset = 9 * 3600000
  const d = new Date(new Date(isoString).getTime() + kstOffset)
  const t = new Date(targetDate.getTime() + kstOffset)
  return d.getUTCFullYear() === t.getUTCFullYear() &&
    d.getUTCMonth() === t.getUTCMonth() &&
    d.getUTCDate() === t.getUTCDate()
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86400000)
  const kstNow = new Date(now.getTime() + 9 * 3600000)
  const results: string[] = []

  // ── 1. 정기 모임 자동 생성 ─────────────────────────────────────
  // 이번 달과 다음 달의 두 번째 금요일 체크
  for (let offset = 0; offset <= 1; offset++) {
    const targetMonth = kstNow.getUTCMonth() + offset
    const targetYear = kstNow.getUTCFullYear() + Math.floor((kstNow.getUTCMonth() + offset) / 12)
    const normalizedMonth = targetMonth % 12

    const meetingDate = getSecondFriday(targetYear, normalizedMonth)

    // 오늘이 모임 21일 전인지 확인
    if (!isKstDaysBefore(meetingDate, 21)) continue

    // 해당 월에 이미 세션이 있는지 확인
    const monthStart = new Date(Date.UTC(targetYear, normalizedMonth, 1)).toISOString()
    const monthEnd = new Date(Date.UTC(targetYear, normalizedMonth + 1, 1)).toISOString()
    const { data: existing } = await supabase
      .from('sessions')
      .select('id')
      .gte('scheduled_at', monthStart)
      .lt('scheduled_at', monthEnd)
      .limit(1)

    if (existing && existing.length > 0) continue

    // RSVP 마감: 모임 14일 전 오후 6시 KST (= 오전 9시 UTC)
    const rsvpDeadline = new Date(meetingDate.getTime() - 14 * 86400000)
    rsvpDeadline.setUTCHours(9, 0, 0, 0)

    const title = `${normalizedMonth + 1}월 정기모임`

    const { data: newSession } = await supabase
      .from('sessions')
      .insert({
        title,
        scheduled_at: meetingDate.toISOString(),
        rsvp_deadline: rsvpDeadline.toISOString(),
        status: 'planning',
      })
      .select()
      .single()

    if (newSession) {
      results.push(`session_created: ${title}`)

      // 참석 투표 시작 알림
      const { data: allSubs } = await supabase.from('push_subscriptions').select('subscription')
      if (allSubs && allSubs.length > 0) {
        const deadlineStr = rsvpDeadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
        await sendPushToSubscriptions(
          allSubs,
          `🥂 ${title} 참석 투표가 시작됐어요!`,
          `참석 여부를 알려주세요. 마감: ${deadlineStr}`,
          `/sessions/${newSession.id}`
        )
        results.push(`push_sent: 투표시작 (${allSubs.length}명)`)
      }
    }
  }

  // ── 2. 알림 발송 ──────────────────────────────────────────────
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, rsvp_deadline')
    .in('status', ['planning', 'active'])

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, results })
  }

  const { data: allSubs } = await supabase.from('push_subscriptions').select('subscription')
  const subs = allSubs ?? []
  let totalSent = 0

  for (const session of sessions) {
    // RSVP 마감 D-1
    if (session.rsvp_deadline && isSameKstDay(session.rsvp_deadline, tomorrow)) {
      await sendPushToSubscriptions(subs,
        `⏰ 참석 투표 마감 D-1`,
        `${session.title} 참석 여부를 내일까지 응답해주세요!`,
        `/sessions/${session.id}`)
      totalSent += subs.length
    }

    if (!session.scheduled_at) continue

    // 모임 D-1 → 전체
    if (isSameKstDay(session.scheduled_at, tomorrow)) {
      await sendPushToSubscriptions(subs,
        `🥂 내일 모임이에요!`,
        `${session.title}이 내일 열립니다. 준비되셨나요?`,
        `/sessions/${session.id}`)
      totalSent += subs.length
    }

    // 모임 D-day → 참석자만
    if (isSameKstDay(session.scheduled_at, now)) {
      const { data: rsvps } = await supabase
        .from('session_rsvps').select('user_id')
        .eq('session_id', session.id).eq('status', 'attending')

      const attendingIds = new Set((rsvps ?? []).map((r) => r.user_id))
      if (attendingIds.size === 0) continue

      const { data: attendingSubs } = await supabase
        .from('push_subscriptions').select('subscription, user_id')
        .in('user_id', [...attendingIds])

      if (attendingSubs && attendingSubs.length > 0) {
        await sendPushToSubscriptions(attendingSubs,
          `🍷 오늘 모임 날이에요!`,
          `${session.title} 오늘 함께해요. 즐거운 시간 되세요!`,
          `/sessions/${session.id}`)
        totalSent += attendingSubs.length
      }
    }
  }

  return NextResponse.json({ ok: true, totalSent, results })
}
