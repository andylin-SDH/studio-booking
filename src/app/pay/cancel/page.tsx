"use client";

import Link from "next/link";

export default function PayCancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-4 flex justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-3xl text-slate-500">
            ✕
          </span>
        </div>
        <h2 className="text-center text-xl font-semibold text-slate-800">
          已取消付款
        </h2>
        <p className="mt-2 text-center text-slate-600">
          您已取消付款，預約未完成。
        </p>
        <Link
          href="/#calendar"
          className="mt-6 block w-full rounded-lg bg-sky-600 py-3 text-center font-medium text-white hover:bg-sky-700"
        >
          返回預約頁面
        </Link>
      </div>
    </div>
  );
}
