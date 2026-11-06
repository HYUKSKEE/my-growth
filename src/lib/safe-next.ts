/** 로그인 후 돌아갈 경로. 같은 사이트 안의 경로만 허용한다(오픈 리다이렉트 방지). */
export function safeNext(v: unknown): string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}
