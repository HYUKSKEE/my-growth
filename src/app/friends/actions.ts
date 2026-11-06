"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/components/ui";

export async function addFriend(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "초대 코드를 입력하세요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_friend_request", { p_code: code });
  if (error) return { error: error.message };
  revalidatePath("/friends");
  return { ok: `${data}님에게 처리했습니다.` };
}

export async function acceptFriend(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", Number(formData.get("id")));
  if (error) return { error: "수락하지 못했습니다. 잠시 후 다시 시도하세요." };
  revalidatePath("/friends");
  return null;
}

/** 거절 / 신청 취소 / 친구 끊기 */
export async function removeFriendship(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("friendships").delete().eq("id", Number(formData.get("id")));
  if (error) return { error: "처리하지 못했습니다. 잠시 후 다시 시도하세요." };
  revalidatePath("/friends");
  return null;
}

export async function updateName(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  if (!name) return { error: "이름을 입력하세요." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return { error: "로그인이 필요합니다." };
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("user_id", data.claims.sub);
  if (error) return { error: "이름을 바꾸지 못했습니다." };
  revalidatePath("/friends");
  return { ok: "이름을 바꿨습니다." };
}

export async function disconnectGarmin(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_garmin");
  if (error) return { error: "연결을 해제하지 못했습니다. 잠시 후 다시 시도하세요." };
  revalidatePath("/friends");
  return null;
}
