import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthUser } from '@/lib/api-auth'
import { allow, retryAfterSeconds } from '@/lib/rate-limit'

export const maxDuration = 30

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB (base64 문자열 기준)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const PROMPT = `당신은 전문 소믈리에이자 와인 라벨 판독 전문가입니다.
제공된 이미지의 와인 라벨을 면밀히 분석하여 아래 JSON 형식으로만 응답하세요.
마크다운 코드블록 없이 순수 JSON만 출력하세요.

판독 규칙:
- 라벨에 명확히 적힌 텍스트만 사용하세요. 추측하지 마세요.
- 읽기 어렵거나 없는 정보는 반드시 null 또는 빈 배열로 표시하세요.
- name: 와인의 고유 이름 (샤토명, 도멘명, 퀴베명 등). 생산자 이름과 다를 수 있음.
- producer: 생산자/와이너리/도멘/샤토 이름.
- region: 세부 지역/아펠라시옹 (예: Pomerol, Alsace, Jura, Morgon).
- country: 국가명 (예: France, Italy, Spain, Georgia).
- vintage: 라벨에 명확히 보이는 4자리 연도 숫자. 없거나 NV면 null.
- grape_varieties: 라벨에 표기된 품종명 배열. 없으면 [].
- wine_type: 라벨 색상, 텍스트(Blanc/Rouge/Rosé/Orange/Pétillant 등)를 종합 판단.
  red=레드, white=화이트, orange=오렌지/앰버, rose=로제, sparkling=스파클링/페티앙, other=기타
- is_natural: 다음 중 하나라도 해당하면 true.
  · "natural", "vin naturel", "sans soufre", "sans soufre ajouté", "SO2 없음"
  · "organic", "bio", "biodynamic", "biodynamie", "demeter", "ecocert"
  · "méthode naturelle", "vin vivant" 등의 표현
  · 확인 불가면 false
- ai_description: 이 와인의 특징을 한국어로 1~2문장. 지역, 스타일, 특이점 중심으로.

{
  "name": "...",
  "producer": "...",
  "region": "...",
  "country": "...",
  "vintage": 2021,
  "grape_varieties": ["..."],
  "wine_type": "red",
  "is_natural": true,
  "ai_description": "..."
}`

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
  if (!user.is_admin) return NextResponse.json({ error: '관리자만 사용할 수 있어요.' }, { status: 403 })

  if (!allow(`scan:${user.id}`, 20, 60 * 60 * 1000)) {
    const retry = retryAfterSeconds(`scan:${user.id}`)
    return NextResponse.json(
      { success: false, error: `1시간에 20회까지 스캔할 수 있어요. ${retry}초 후 다시 시도해주세요.` },
      { status: 429 }
    )
  }

  try {
    const { imageBase64, mediaType } = await req.json()

    if (!imageBase64 || !mediaType) {
      return NextResponse.json({ success: false, error: '이미지 데이터가 없어요.' }, { status: 400 })
    }

    if (imageBase64.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ success: false, error: '이미지 크기가 너무 커요. (최대 5MB)' }, { status: 413 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          { type: 'text', text: PROMPT },
        ],
      }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim()

    let wineData: Record<string, unknown>
    try {
      wineData = JSON.parse(cleaned)
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('JSON 파싱 실패')
      wineData = JSON.parse(match[0])
    }

    if (typeof wineData.vintage === 'string') {
      const parsed = parseInt(wineData.vintage as string)
      wineData.vintage = isNaN(parsed) ? null : parsed
    }

    if (!Array.isArray(wineData.grape_varieties)) {
      wineData.grape_varieties = []
    }

    return NextResponse.json({ success: true, data: wineData })
  } catch (err: any) {
    console.error('scan error:', err)
    return NextResponse.json(
      { success: false, error: err?.message ?? '라벨 인식에 실패했어요. 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}
