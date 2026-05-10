import type { ReactNode } from "react";

/** 週末相關醒目提示（大／小間預約、月曆上方說明共用） */
export function WeekendProminentAlert({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="relative overflow-hidden rounded-xl border-2 border-orange-500 bg-gradient-to-br from-amber-100 via-orange-50 to-amber-50 p-4 shadow-lg shadow-orange-500/30 ring-2 ring-orange-400/40"
    >
      <div
        className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-orange-400/20 blur-2xl"
        aria-hidden
      />
      <div className="relative flex gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-md"
          aria-hidden
        >
          <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-extrabold tracking-wide text-orange-900">{title}</p>
          <div className="mt-1.5 text-sm font-semibold leading-relaxed text-slate-900">{children}</div>
        </div>
      </div>
    </div>
  );
}
