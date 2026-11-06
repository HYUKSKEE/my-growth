"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export async function signIn(_prev: string | null, formData: FormData): Promise<string | null> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: string | null, formData: FormData): Promise<string | null> {
  const supabase = await createClient();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";

  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? ""),
    password,
    options: { data: { display_name: String(formData.get("name") ?? "").trim() } },
  });
  if (error) return `가입에 실패했습니다: ${error.message}`;
  // 이메일 확인이 켜져 있으면 세션이 아직 없음
  if (!data.session) return "확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.";
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
