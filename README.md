# Garmin Growth

가민(Garmin Connect) 데이터를 Supabase에 쌓고, Next.js 대시보드에서 **성장 지표**를 보여주는 개인용 앱입니다.

```
Garmin Connect ──(sync/sync.py, 매일 GitHub Actions)──▶ Supabase(Postgres + RLS) ──▶ Next.js 대시보드
```

## 보여주는 지표

| 지표 | 계산 | 성장 방향 |
|---|---|---|
| 체력 / 피로 (CTL / ATL) | 운동별 가민 Training Load의 42일·7일 지수이동평균 | 체력선 ↑ |
| 러닝 효율 | 평균 속도(m/min) ÷ 평균 심박 = 심박 1회당 이동거리. 15분 이상 러닝만, 28일 평균 | ↑ |
| VO2 Max | 가민 추정치 (14일 평균) | ↑ |
| 안정시 심박 | 일별 + 7일 평균 | ↓ |
| 수면 중 HRV | 지난밤 평균 + 7일 평균 | ↑ |
| 주간 러닝 거리 | 월요일 시작 주 합계 | — |
| KPI 타일 | 최근 28일 평균 vs 이전 28일 평균 | 개선/하락 표시 |
| 기록 | 선택 기간 최장 거리, 5km+ 최고 페이스, 최대 상승 고도 | |

기간은 3개월 / 6개월 / 1년 중 선택합니다.

## 데이터 소스에 대해

- **공식 Garmin Health / Activity API**는 기업 파트너 승인이 필요합니다. 개인 프로젝트로는 받기 어렵습니다.
- 그래서 이 프로젝트는 비공식 Python 라이브러리 [`garminconnect`](https://pypi.org/project/garminconnect/)로 **본인 계정**에 로그인해 데이터를 가져옵니다.
  가민 약관상 회색지대이고, 가민이 로그인 방식을 바꾸면 깨질 수 있습니다 (그럴 땐 `pip install -U garminconnect`).
- 원본 응답은 각 테이블의 `raw` jsonb 컬럼에 저장되므로, 나중에 공식 API로 갈아타거나 필드를 추가해도 재수집 없이 다시 추출할 수 있습니다.

## 설정

### 1. Supabase (운영자, 1회)
1. 프로젝트 생성 → **SQL Editor**에서 `supabase/migrations/0001_init.sql` → `0002_friends.sql` → `0003_web_connect.sql` 순서로 실행
2. Authentication → Sign In / Providers 에서 이메일 가입을 켭니다 (친구가 직접 가입). 메일 확인을 끄면 가입 즉시 로그인됩니다.

### 2. 환경변수
```bash
cp .env.example .env.local   # 값 채우기
```
`SUPABASE_SERVICE_ROLE_KEY`는 **운영자의 동기화 실행(GitHub Actions)에서만** 쓰며 절대 `NEXT_PUBLIC_`을 붙이거나 친구에게 주지 마세요.

### 3. 가민 연결 (각 사용자, 웹에서)
가입 후 앱의 **친구** 페이지 → "내 가민 연결"에 가민 이메일/비밀번호(+MFA 코드)를 입력하면 끝입니다.
- 가민 비밀번호는 저장되지 않고 로그인에 한 번만 쓰입니다. 토큰만 본인 행에 저장됩니다(RLS로 본인/서비스 롤만 접근).
- 연결 요청은 Vercel Python 함수(`api/garmin/*.py`)가 처리하며, **사용자 본인의 로그인 토큰**으로 DB 함수를 호출하므로 service role 키가 필요 없습니다.
- 연결 후 첫 동기화는 매시 도는 Actions가 처리하고, 이후엔 매일 증분 동기화됩니다.
- (대안) 터미널에서 `cd sync && python sync.py login` 으로도 연결할 수 있습니다. 가민이 클라우드 IP 로그인을 막는 경우에 쓰세요.

### 배포 (Vercel)
1. 저장소를 Vercel에 import (Framework: Next.js)
2. 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_TIMEZONE` — **service role 키는 넣지 않습니다**
3. Supabase → Authentication → URL Configuration 에 배포 주소를 Site URL / Redirect URL 로 추가
4. `supabase/migrations/0003_web_connect.sql` 실행
5. 로컬에서 가민 연결까지 시험하려면 `npm run dev` 대신 `npx vercel dev` (Python 함수 포함 실행)

### 3-1. 동기화 (운영자)
GitHub Actions가 매일 토큰이 저장된 **모든 사용자**를 동기화합니다. 수동 실행:
```bash
python sync.py                      # 전체 사용자
python sync.py --user <uuid>        # 한 명만
python sync.py --since 2024-01-01   # 더 오래 전부터
```
Actions Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

### 3-2. 친구
앱의 **친구** 페이지에서 내 초대 코드를 확인하고, 친구의 코드를 입력해 신청합니다. 수락하면 서로의 대시보드를 읽기 전용으로 볼 수 있습니다.

### 4. 대시보드 실행
```bash
npm install
npm run dev
```
http://localhost:3000 → 가입 후 로그인.

### 5. 자동 동기화 (GitHub Actions)
레포 **Settings → Secrets and variables → Actions**에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_USER_ID` 등록.
`.github/workflows/garmin-sync.yml`이 매일 06:17 KST에 증분 동기화합니다 (Actions 탭에서 수동 실행 및 `since` 지정 가능).

### 6. 배포
Vercel에 import 후 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_TIMEZONE`만 설정하면 됩니다.

## 구조

```
supabase/migrations/0001_init.sql   테이블 + RLS
sync/sync.py                        Garmin → Supabase 동기화
src/proxy.ts                        세션 갱신, 비로그인 → /login
src/app/page.tsx                    데이터 로드 (Supabase, 서버)
src/components/DashboardView.tsx    대시보드 레이아웃
src/components/charts.tsx           Recharts 차트 (클라이언트)
src/lib/metrics.ts                  성장 지표 계산 (CTL/ATL, 효율, 비교 등)
```
