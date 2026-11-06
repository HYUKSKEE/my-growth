import type { SupabaseClient } from "@supabase/supabase-js";

export const DAILY_COLS = "date,steps,resting_hr,hrv_last_night,vo2max_run,sleep_score,sleep_seconds,body_battery_max";
export const ACT_COLS =
  "activity_id,start_date_local,type,name,duration_s,distance_m,avg_hr,avg_speed_mps,elevation_gain_m,training_load";

/** PostgREST 기본 1000행 제한을 넘기기 위한 페이지네이션 */
export async function fetchAll<T>(
  sb: SupabaseClient, table: string, cols: string, dateCol: string, from: string, userId: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(table).select(cols).eq("user_id", userId).gte(dateCol, from).order(dateCol).range(i, i + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export function todayInTz() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE ?? "Asia/Seoul" }).format(new Date());
}

/** 나 + 수락된 친구 (RLS 가 접근 권한을 최종 강제하지만, 선택 목록은 여기서 만든다) */
export async function listPeople(sb: SupabaseClient, me: string) {
  const [{ data: profiles }, { data: fs }] = await Promise.all([
    sb.from("profiles").select("user_id,display_name"),
    sb.from("friendships").select("requester_id,addressee_id").eq("status", "accepted"),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]));
  const friendIds = (fs ?? []).map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id) as string);
  return [me, ...friendIds].map((id) => ({ id, name: names.get(id) ?? "알 수 없음" }));
}
