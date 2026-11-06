import { Suspense } from "react";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./LoginForm";

export default function Page({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<main className="flex flex-1 items-center justify-center px-4 text-sm text-muted">불러오는 중…</main>}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  return <LoginForm next={safeNext(sp.next)} />;
}
