import { NextRequest, NextResponse } from "next/server";
import { verifyCheckMacValue } from "@/lib/ecpay";
import { getPendingOrder } from "@/lib/google-sheet";
import { STUDIOS, type StudioId } from "@/lib/studios";

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000"
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function getOrderSummary(orderId: string): Promise<{ studioLabel: string; startStr: string; endStr: string } | null> {
  if (!orderId) return null;
  try {
    const order = await getPendingOrder(orderId);
    if (!order) return null;
    const studioId = (order.studio === "small" ? "small" : "big") as StudioId;
    return {
      studioLabel: STUDIOS[studioId],
      startStr: formatDateTime(order.start),
      endStr: formatDateTime(order.end),
    };
  } catch (e) {
    console.error("[Pay Result] 讀取訂單資訊失敗", e);
    return null;
  }
}

function renderResultPage(
  status: string,
  orderId: string,
  origin?: string,
  bookingInfo?: { studioLabel: string; startStr: string; endStr: string } | null
) {
  const isSuccess = status === "success";
  const title =
    status === "success"
      ? "付款成功"
      : status === "fail"
        ? "付款失敗"
        : "處理中";
  const message =
    status === "success"
      ? "預約已完成，我們會盡快與您確認。"
      : status === "fail"
        ? "付款未完成，請重新預約或聯絡我們。"
        : "若已完成付款，請稍候或聯絡我們確認。";

  const baseUrl = origin || getBaseUrl();
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>付款結果 - 盛德好錄音室</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:system-ui,sans-serif;color:#0f172a">
  <div style="width:100%;max-width:28rem;margin:1rem;padding:2rem;background:white;border-radius:1rem;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
    <div style="display:flex;justify-content:center;margin-bottom:1rem">
      <span style="display:flex;align-items:center;justify-content:center;width:4rem;height:4rem;border-radius:9999px;font-size:1.875rem;background:${isSuccess ? "#dcfce7" : "#fef3c7"};color:${isSuccess ? "#16a34a" : "#d97706"}">${isSuccess ? "✓" : "!"}</span>
    </div>
    <h2 style="text-align:center;font-size:1.25rem;font-weight:600;margin:0">${title}</h2>
    <p style="text-align:center;color:#64748b;margin:0.5rem 0 0">${message}</p>
    ${orderId ? `<p style="text-align:center;font-size:0.75rem;color:#94a3b8;margin:0.5rem 0 0">訂單編號：${orderId}</p>` : ""}
    ${
      status === "success" && bookingInfo
        ? `<div style="margin-top:1rem;background:#f1f5f9;border-radius:0.75rem;padding:0.875rem 1rem">
      <p style="margin:0 0 0.5rem;font-weight:600">預約資訊</p>
      <p style="margin:0 0 0.375rem;color:#334155"><strong>錄音室</strong>：${bookingInfo.studioLabel}</p>
      <p style="margin:0 0 0.375rem;color:#334155"><strong>開始時間</strong>：${bookingInfo.startStr}</p>
      <p style="margin:0;color:#334155"><strong>結束時間</strong>：${bookingInfo.endStr}</p>
    </div>`
        : ""
    }
    <p style="margin:1rem 0 0;text-align:center;color:#b45309;font-weight:600">
      如需取消退款，請聯繫官方 Line@：
      <a href="https://lin.ee/v3u8YDR" style="color:#0ea5e9">https://lin.ee/v3u8YDR</a>
    </p>
    <a href="${baseUrl}/#calendar" style="display:block;margin-top:1.5rem;padding:0.75rem 1rem;background:#0ea5e9;color:white;text-align:center;text-decoration:none;font-weight:500;border-radius:0.5rem">返回預約頁面</a>
  </div>
</body>
</html>`;
}

/** 處理綠界 OrderResultURL 的 POST：直接回傳結果頁，不重導向（避免 Vercel 重導向迴圈） */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((val, key) => {
    params[key] = typeof val === "string" ? val : val.toString();
  });

  const url = new URL(request.url);
  const orderId = params["MerchantTradeNo"] || "";
  const rtnCode = params["RtnCode"];
  const status = verifyCheckMacValue(params)
    ? (rtnCode === "1" ? "success" : "fail")
    : "error";

  const bookingInfo = status === "success" ? await getOrderSummary(orderId) : null;
  const html = renderResultPage(status, orderId, url.origin, bookingInfo);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/** 顯示付款結果頁 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const { searchParams } = url;
  const status = searchParams.get("status") || "success";
  const orderId = searchParams.get("orderId") || "";

  const bookingInfo = status === "success" ? await getOrderSummary(orderId) : null;
  const html = renderResultPage(status, orderId, url.origin, bookingInfo);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
