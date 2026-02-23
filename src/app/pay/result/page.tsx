"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function ResultContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "success";
  const orderId = searchParams.get("orderId") || "";

  const isSuccess = status === "success";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-4 flex justify-center">
          <span
            className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${
              isSuccess ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"
            }`}
          >
            {isSuccess ? "✓" : "!"}
          </span>
        </div>
        <h2 className="text-center text-xl font-semibold text-slate-800">
          {isSuccess ? "付款成功" : status === "fail" ? "付款失敗" : "處理中"}
        </h2>
        <p className="mt-2 text-center text-slate-600">
          {isSuccess
            ? "預約已完成，我們會盡快與您確認。"
            : status === "fail"
              ? "付款未完成，請重新預約或聯絡我們。"
              : "若已完成付款，請稍候或聯絡我們確認。"}
        </p>
        {orderId && (
          <p className="mt-2 text-center text-xs text-slate-400">
            訂單編號：{orderId}
          </p>
        )}
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

export default function PayResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600" />
        </div>
      }
    >
      <ResultContent />
    </Suspense>
  );
}
