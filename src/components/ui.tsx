"use client";

import Link, { useLinkStatus } from "next/link";
import { useActionState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** 서버 액션 결과: 성공 메시지(ok) 또는 오류(error). null 이면 아직 실행 전. */
export type ActionResult = { ok?: string; error?: string } | null;

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 폼 안에서 전송 중 상태를 자동으로 반영하는 버튼 (useFormStatus).
 * 폼 밖(fetch 직접 호출 등)에서는 pending 을 직접 넘긴다.
 */
export function SubmitButton({
  children, pendingLabel, pending, variant = "primary", className = "", ...rest
}: Omit<ComponentProps<"button">, "type"> & {
  pendingLabel?: string;
  pending?: boolean;
  variant?: "primary" | "link";
}) {
  const status = useFormStatus();
  const busy = pending ?? status.pending;
  return (
    <button
      {...rest}
      type="submit"
      disabled={busy || rest.disabled}
      aria-busy={busy}
      className={`${variant === "primary" ? "btn" : "link-btn"} inline-flex items-center justify-center gap-1.5 ${className}`}
    >
      {busy && <Spinner className="size-3.5" />}
      {busy && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** 오류/성공 메시지를 보여 주는 서버 액션 폼. 위험한 동작은 confirmMessage 로 한 번 더 확인한다. */
export function ActionForm({
  action, confirmMessage, className, children,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  confirmMessage?: string;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && <p role="alert" className="basis-full text-sm text-critical">{state.error}</p>}
      {state?.ok && <p role="status" className="basis-full text-sm text-secondary">{state.ok}</p>}
    </form>
  );
}

/** 이동 중에는 라벨이 깜빡여서 눌렀다는 피드백을 준다 (레이아웃 이동 없음). */
function PendingLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "animate-pulse opacity-70" : undefined}>{children}</span>;
}

export function PendingLink({ children, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props}>
      <PendingLabel>{children}</PendingLabel>
    </Link>
  );
}

/** 마우스 호버·키보드 포커스·터치 탭에서 설명을 보여 주는 ⓘ 툴팁 */
export function InfoTip({ text, label = "설명 보기" }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`${label}: ${text}`}
        className="inline-flex size-4 items-center justify-center rounded-full border border-border text-[10px] leading-none text-muted hover:text-primary focus-visible:text-primary"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 w-max max-w-[15rem] rounded-md border border-border bg-surface px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-secondary opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-border/60 ${className}`} aria-hidden />;
}
