@AGENTS.md

# ryan-wine

자연주의 와인 모임(소규모 신뢰 그룹) 와인 관리 앱.

## 실행
```bash
npm run dev          # localhost:3000
npm run build        # 프로덕션 빌드
```

## 배포
- Vercel: `vercel --prod` / `npx vercel --prod`
- URL: https://naver-naturalvin.vercel.app
- GitHub: ryanberoarin/ryan-wine

## 스택
- Next.js 16 (App Router), TypeScript, Tailwind CSS
- Supabase (DB + Storage): 프로젝트 ID `qcucwkvttzjnamypynvj`, Tokyo 리전
- 환경변수: `.env.local` (절대 커밋 금지)

## 인증 구조
- 닉네임 + x-device-token 헤더 기반 서버사이드 인증
- `lib/api-auth.ts`: 모든 API 라우트 공통 인증 미들웨어
- `lib/auth.ts`: 클라이언트 인증 유틸
- 초대코드 검증 + 닉네임 로그인 모두 서버 이동 완료 (계정 탈취 취약점 수정됨)

## API 라우트 (`app/api/`)
| 라우트 | 기능 |
|--------|------|
| `scan/` | 와인 라벨 OCR 스캔 |
| `push/` | 와인 DB 저장 |
| `review/` | 테이스팅 노트 |
| `recommend-order/` | 주문 추천 |
| `login/` | 닉네임 로그인 (서버) |
| `register/` | 초대코드 검증 + 회원가입 (서버) |

## 주요 결정사항
- 스캔 결과는 반드시 웹 서칭(wine name + producer)으로 크로스체크 후 DB 반영
- RLS 적용 완료, subsidy 마이그레이션 완료
- 배치 스캔 모드: 여러 장 동시 스캔, 카메라/갤러리 분리

## 보류 이슈
- **동명이인 문제**: 멤버 전원 본명 사용 중. 현재 그룹 규모 작고 신뢰 그룹이라 보류. 발생 시 nickname에 구분자 추가 또는 별도 식별자 도입 검토 (2026-06-12 결정).
