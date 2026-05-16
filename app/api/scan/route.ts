import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json()

    if (!imageBase64 || !mediaType) {
      return NextResponse.json({ success: false, error: '이미지 데이터가 없어요.' }, { status: 400 })
    }

    const response = await genai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          parts: [
            {
              inlineData: { mimeType: mediaType, data: imageBase64 },
            },
            {
              text: `이 와인 라벨을 분석해서 아래 JSON 형식으로만 응답해. 마크다운 없이 순수 JSON만.

{
  "name": "와인 이름 (없으면 null)",
  "producer": "생산자/와이너리 (없으면 null)",
  "region": "생산 지역 (없으면 null)",
  "country": "생산 국가 (없으면 null)",
  "vintage": 빈티지 연도 숫자 (없으면 null),
  "grape_varieties": ["포도 품종 배열 (없으면 빈 배열)"],
  "wine_type": "red/white/orange/rose/sparkling/other 중 하나 (모르면 null)",
  "is_natural": true/false (내추럴 와인 여부, 모르면 true),
  "ai_description": "이 와인에 대한 간단한 한국어 설명 1-2문장"
}`,
            },
          ],
        },
      ],
    })

    const text = response.text ?? ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const wineData = JSON.parse(cleaned)
    return NextResponse.json({ success: true, data: wineData })
  } catch (err: any) {
    console.error('scan error:', err)
    return NextResponse.json(
      { success: false, error: err?.message ?? '라벨 인식에 실패했어요. 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}
