import { NextRequest, NextResponse } from "next/server";
import { verifyCheckMacValue } from "@/lib/ecpay";

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000"
  );
}

function renderResultPage(status: string, orderId: string, origin?: string) {
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
    <a href="${baseUrl}/#calendar" style="display:block;margin-top:1.5rem;padding:0.75rem 1rem;background:#0ea5e9;color:white;text-align:center;text-decoration:none;font-weight:500;border-radius:0.5rem">返回預約頁面</a>
  </div>
</body>
</html>`;
}

/** 處理綠界 OrderResultURL 的 POST 導轉 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((val, key) => {
    params[key] = typeof val === "string" ? val : val.toString();
  });

  // 使用請求的 origin 避免 baseUrl 與實際網域不同造成重導向迴圈
  const url = new URL(request.url);
  const origin = url.origin;
  const orderId = params["MerchantTradeNo"] || "";
  const rtnCode = params["RtnCode"];
  const status = rtnCode === "1" ? "success" : "fail";

  if (!verifyCheckMacValue(params)) {
    return NextResponse.redirect(`${origin}/pay/result?status=error`);
  }

  return NextResponse.redirect(
    `${origin}/pay/result?orderId=${encodeURIComponent(orderId)}&status=${status}`
  );
}

/** 顯示付款結果頁 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const { searchParams } = url;
  const status = searchParams.get("status") || "success";
  const orderId = searchParams.get("orderId") || "";

  const html = renderResultPage(status, orderId, url.origin);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
