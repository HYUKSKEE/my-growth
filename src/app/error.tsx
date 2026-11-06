"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div role="alert" className="card w-full max-w-sm space-y-3 p-6 text-sm">
        <h1 className="text-lg font-semibold">문제가 생겼습니다</h1>
        <p className="text-secondary">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        {error.digest && <p className="font-mono text-xs text-muted">오류 코드: {error.digest}</p>}
        <div className="flex items-center gap-3">
          <button onClick={() => retry()} className="btn">다시 시도</button>
          <Link href="/login" className="link-btn">로그인 화면으로</Link>
        </div>
      </div>
    </main>
  );
}
