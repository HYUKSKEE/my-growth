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

### 1. Supabase
1. 프로젝트 생성 → **SQL Editor**에서 `supabase/migrations/0001_init.sql` 실행
2. **Authentication → Users → Add user**로 본인 계정(이메일/비밀번호) 생성, 사용자 UUID 복사
3. (권장) Authentication → Sign In / Providers 에서 **신규 가입 비활성화** — 혼자 쓰는 앱이므로

### 2. 환경변수
```bash
cp .env.example .env.local   # 값 채우기
```
`SUPABASE_SERVICE_ROLE_KEY`는 동기화 스크립트에서만 쓰며 절대 `NEXT_PUBLIC_`을 붙이지 마세요.

### 3. 가민 최초 로그인 (로컬, 1회)
```bash
cd sync
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python sync.py login     # MFA 코드 입력 → 토큰이 Supabase garmin_sync_state 에 저장됨
python sync.py           # 최근 180일 백필
python sync.py --since 2024-01-01   # 더 오래 전부터 가져오려면
```
로그인 이후엔 가민 비밀번호가 필요 없습니다. 토큰은 RLS로 브라우저에서 접근 불가한 테이블에 저장되며, 갱신될 때마다 다시 저장됩니다.

### 4. 대시보드 실행
```bash
npm install
npm run dev
```
http://localhost:3000 → 2번에서 만든 계정으로 로그인.

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
