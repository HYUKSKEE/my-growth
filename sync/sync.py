"""Garmin Connect → Supabase 동기화 스크립트.

비공식 라이브러리(garminconnect)로 본인 계정에 로그인해 일일 지표와 운동 기록을
가져와 Supabase에 upsert 합니다. 개인 용도로만 사용하세요.

사용법:
  python sync.py login            # 최초 1회: 가민 로그인(MFA 지원) 후 토큰을 Supabase에 저장
  python sync.py                  # 마지막 동기화 이후(3일 겹침)부터 오늘까지 동기화
  python sync.py --since 2025-01-01   # 특정 날짜부터 백필
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
import time
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from garminconnect import Garmin
from supabase import Client, create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
load_dotenv(Path(__file__).resolve().parent / ".env")

DEFAULT_BACKFILL_DAYS = 180
OVERLAP_DAYS = 3  # 수면/HRV 등 늦게 확정되는 값을 다시 덮어쓰기 위한 겹침 구간
REQUEST_PAUSE_S = 0.4


def env(name: str, required: bool = True) -> str | None:
    value = os.getenv(name)
    if required and not value:
        sys.exit(f"환경변수 {name} 가 필요합니다 (.env.local 또는 sync/.env)")
    return value


def pick(data: Any, path: str, default: Any = None) -> Any:
    """'a.b.0.c' 형태 경로로 중첩 dict/list 에서 안전하게 값 꺼내기."""
    cur = data
    for key in path.split("."):
        if cur is None:
            return default
        if isinstance(cur, list):
            if not key.isdigit() or int(key) >= len(cur):
                return default
            cur = cur[int(key)]
        elif isinstance(cur, dict):
            cur = cur.get(key)
        else:
            return default
    return default if cur is None else cur


def safe_call(fn, *args) -> Any:
    try:
        return fn(*args)
    except Exception as e:  # 개별 엔드포인트 실패는 전체 동기화를 멈추지 않음
        print(f"  ! {fn.__name__}{args}: {e}", file=sys.stderr)
        return None
    finally:
        time.sleep(REQUEST_PAUSE_S)


def as_int(v: Any) -> int | None:
    try:
        return None if v is None else int(round(float(v)))
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- Supabase

def supabase() -> Client:
    return create_client(env("SUPABASE_URL") or env("NEXT_PUBLIC_SUPABASE_URL"),
                         env("SUPABASE_SERVICE_ROLE_KEY"))


def load_state(sb: Client, user_id: str) -> dict:
    res = sb.table("garmin_sync_state").select("*").eq("user_id", user_id).execute()
    return res.data[0] if res.data else {}


def save_state(sb: Client, user_id: str, **fields) -> None:
    sb.table("garmin_sync_state").upsert({"user_id": user_id, **fields}).execute()


# ---------------------------------------------------------------- Garmin

def garmin_from_tokens(tokens: str) -> Garmin:
    g = Garmin()
    g.login(tokens)
    return g


def interactive_login(sb: Client, user_id: str) -> None:
    email = env("GARMIN_EMAIL")
    password = env("GARMIN_PASSWORD")
    g = Garmin(email, password, prompt_mfa=lambda: input("가민 MFA 코드: ").strip())
    g.login()
    save_state(sb, user_id, tokens=g.client.dumps())
    print("로그인 성공 — 토큰을 Supabase(garmin_sync_state)에 저장했습니다.")
    print("이후에는 이메일/비밀번호 없이 `python sync.py` 만 실행하면 됩니다.")


# ---------------------------------------------------------------- 변환

def build_daily_row(g: Garmin, user_id: str, day: str) -> dict | None:
    summary = safe_call(g.get_user_summary, day)
    sleep = safe_call(g.get_sleep_data, day)
    hrv = safe_call(g.get_hrv_data, day)
    maxm = safe_call(g.get_max_metrics, day)

    if not any([summary, sleep, hrv, maxm]):
        return None

    # get_max_metrics 는 list 또는 dict 로 내려옴
    mm = maxm[0] if isinstance(maxm, list) and maxm else (maxm if isinstance(maxm, dict) else {})
    sleep_dto = pick(sleep, "dailySleepDTO", {}) or {}

    return {
        "user_id": user_id,
        "date": day,
        "steps": as_int(pick(summary, "totalSteps")),
        "distance_m": pick(summary, "totalDistanceMeters"),
        "active_kcal": pick(summary, "activeKilocalories"),
        "resting_hr": as_int(pick(summary, "restingHeartRate")),
        "stress_avg": as_int(pick(summary, "averageStressLevel")),
        "body_battery_max": as_int(pick(summary, "bodyBatteryHighestValue")),
        "body_battery_min": as_int(pick(summary, "bodyBatteryLowestValue")),
        "sleep_seconds": as_int(pick(sleep_dto, "sleepTimeSeconds")),
        "sleep_score": as_int(pick(sleep_dto, "sleepScores.overall.value")),
        "hrv_last_night": pick(hrv, "hrvSummary.lastNightAvg"),
        "hrv_weekly_avg": pick(hrv, "hrvSummary.weeklyAvg"),
        "hrv_status": pick(hrv, "hrvSummary.status"),
        "vo2max_run": pick(mm, "generic.vo2MaxPreciseValue") or pick(mm, "generic.vo2MaxValue"),
        "vo2max_cycle": pick(mm, "cycling.vo2MaxPreciseValue") or pick(mm, "cycling.vo2MaxValue"),
        "raw": {"summary": summary, "sleep": sleep_dto, "hrv": pick(hrv, "hrvSummary"), "max_metrics": mm},
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def build_activity_row(user_id: str, a: dict) -> dict:
    gmt = a.get("startTimeGMT") or a.get("startTimeLocal")
    local = a.get("startTimeLocal") or gmt
    return {
        "user_id": user_id,
        "activity_id": a["activityId"],
        "start_time": gmt.replace(" ", "T") + "Z" if gmt and "T" not in gmt else gmt,
        "start_date_local": (local or "")[:10],
        "type": pick(a, "activityType.typeKey", "other"),
        "name": a.get("activityName"),
        "duration_s": a.get("duration"),
        "distance_m": a.get("distance"),
        "avg_hr": as_int(a.get("averageHR")),
        "max_hr": as_int(a.get("maxHR")),
        "avg_speed_mps": a.get("averageSpeed"),
        "elevation_gain_m": a.get("elevationGain"),
        "calories": a.get("calories"),
        "training_load": a.get("activityTrainingLoad"),
        "aerobic_te": a.get("aerobicTrainingEffect"),
        "anaerobic_te": a.get("anaerobicTrainingEffect"),
        "vo2max": a.get("vO2MaxValue"),
        "raw": a,
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------- 동기화

def sync(sb: Client, user_id: str, since: dt.date | None) -> None:
    state = load_state(sb, user_id)
    tokens = state.get("tokens") or os.getenv("GARMINTOKENS")
    if not tokens:
        sys.exit("저장된 가민 토큰이 없습니다. 먼저 `python sync.py login` 을 실행하세요.")

    today = dt.date.today()
    if since is None:
        last = state.get("last_synced_date")
        since = (dt.date.fromisoformat(last) - dt.timedelta(days=OVERLAP_DAYS)) if last \
            else today - dt.timedelta(days=DEFAULT_BACKFILL_DAYS)

    print(f"동기화 범위: {since} → {today}")
    try:
        g = garmin_from_tokens(tokens)

        # 1) 운동 기록 (범위 한 번에)
        acts = safe_call(g.get_activities_by_date, since.isoformat(), today.isoformat()) or []
        rows = [build_activity_row(user_id, a) for a in acts if a.get("activityId")]
        for i in range(0, len(rows), 200):
            sb.table("activities").upsert(rows[i:i + 200]).execute()
        print(f"운동 {len(rows)}건 저장")

        # 2) 일일 지표 (하루씩) — 중간 실패해도 진행분은 저장되도록 주기적으로 flush
        buf: list[dict] = []
        day = since
        while day <= today:
            row = build_daily_row(g, user_id, day.isoformat())
            if row:
                buf.append(row)
            if len(buf) >= 14:
                sb.table("daily_metrics").upsert(buf).execute()
                save_state(sb, user_id, last_synced_date=day.isoformat())
                print(f"  ~{day} 저장")
                buf = []
            day += dt.timedelta(days=1)
        if buf:
            sb.table("daily_metrics").upsert(buf).execute()

        # 토큰이 갱신됐을 수 있으므로 다시 저장
        save_state(sb, user_id, tokens=g.client.dumps(), last_synced_date=today.isoformat(),
                   last_run_at=dt.datetime.now(dt.timezone.utc).isoformat(), last_error=None)
        print("완료")
    except Exception as e:
        save_state(sb, user_id, last_run_at=dt.datetime.now(dt.timezone.utc).isoformat(),
                   last_error=str(e)[:500])
        raise


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", nargs="?", default="sync", choices=["sync", "login"])
    p.add_argument("--since", type=dt.date.fromisoformat, help="YYYY-MM-DD 부터 다시 가져오기")
    args = p.parse_args()

    sb = supabase()
    user_id = env("SUPABASE_USER_ID")
    if args.command == "login":
        interactive_login(sb, user_id)
    else:
        sync(sb, user_id, args.since)


if __name__ == "__main__":
    main()
