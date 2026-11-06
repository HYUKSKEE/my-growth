import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-3 p-6 text-sm">
        <h1 className="text-lg font-semibold">페이지를 찾을 수 없습니다</h1>
        <p className="text-secondary">주소가 바뀌었거나 없는 페이지입니다.</p>
        <Link href="/" className="btn inline-block">대시보드로</Link>
      </div>
    </main>
  );
}
