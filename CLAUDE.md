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
- `lib/auth.ts`: 클라이언트 인증 유틸 (`getDeviceToken()`으로 헤더 토큰 조회)
- **users 테이블 잠금 (2026-07-12)**: anon은 device_token 컬럼 SELECT 불가(컬럼 단위 권한), INSERT/UPDATE/DELETE 전면 차단. 가입·기기변경·멤버관리 모두 service role API 경유 (`/api/login`, `/api/register`, `/api/admin/members`)
- 관리자 계정은 초대코드만으로 기기 이전 불가 — ADMIN_PASSCODE 필수 (`/api/admin-login`)
- 클라이언트에서 users 조회 시 `USER_PUBLIC_COLUMNS` 사용 (`select('*')` 금지 — 컬럼 권한으로 실패함)

## API 라우트 (`app/api/`)
| 라우트 | 기능 |
|--------|------|
| `scan/` | 와인 라벨 OCR 스캔 |
| `push/` | 웹푸시 구독/발송 |
| `review/` | AI 모임 후기 생성 |
| `recommend-order/` | 음용 순서 AI 추천 |
| `login/` | 닉네임 로그인 (기기 재로그인 + 기기 변경, 관리자 계정 차단) |
| `register/` | 초대코드 검증 + 회원가입 (닉네임 중복 차단) |
| `admin/members/` | 멤버 탈퇴/지원금 대상 토글 (service role) |
| `admin-login/`, `admin-config/`, `payment-info/`, `cron/remind/` | 관리자 로그인 / 초대코드 조회 / 계좌 정보 / 일일 크론 |

## 주요 결정사항
- 스캔 결과는 반드시 웹 서칭(wine name + producer)으로 크로스체크 후 DB 반영
- RLS + users 잠금 마이그레이션 적용 완료 (`supabase/migration_security_settlement.sql`, 2026-07-12 실행됨)
- 배치 스캔 모드: 여러 장 동시 스캔, 카메라/갤러리 분리
- **정산은 확정 스냅샷 방식**: 관리자가 "정산 확정" 시 `sessions.settlement_snapshot`(JSONB)에 금액 고정 + 다음 모임 이월 동기화. 멤버는 스냅샷만 봄. 확정 후 데이터 변경 시 "다시 확정" 필요 (자동 재동기화 없음)
- 지원금 계산은 전부 `subsidy_eligible=true` 멤버 기준 (복수가입자 제외) — `lib/settlement.ts` 순수 함수
- 퀵 레이팅: 세션 와인 카드에서 별점만 기록, `notes/new`는 같은 노트 이어쓰기 (중복 노트 없음)
- 입금 확인: `session_rsvps.paid_at`, 관리자 정산 탭에서 토글

## 보류 이슈
- **동명이인 문제**: 멤버 전원 본명 사용 중. 현재 그룹 규모 작고 신뢰 그룹이라 보류. 발생 시 nickname에 구분자 추가 또는 별도 식별자 도입 검토 (2026-06-12 결정).
