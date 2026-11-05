"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addFriend(_prev: string | null, formData: FormData): Promise<string | null> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return "초대 코드를 입력하세요.";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_friend_request", { p_code: code });
  if (error) return error.message;
  revalidatePath("/friends");
  return `${data}님에게 처리했습니다.`;
}

export async function acceptFriend(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("friendships").update({ status: "accepted" }).eq("id", Number(formData.get("id")));
  revalidatePath("/friends");
}

/** 거절 / 신청 취소 / 친구 끊기 */
export async function removeFriendship(formData: FormData) {
  const supabase = await createClient();
  await supabase.from("friendships").delete().eq("id", Number(formData.get("id")));
  revalidatePath("/friends");
}

export async function updateName(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 30);
  if (!name) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims.sub) await supabase.from("profiles").update({ display_name: name }).eq("user_id", data.claims.sub);
  revalidatePath("/friends");
}

export async function disconnectGarmin() {
  const supabase = await createClient();
  await supabase.rpc("disconnect_garmin");
  revalidatePath("/friends");
}
