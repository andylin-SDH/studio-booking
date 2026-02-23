import { NextRequest, NextResponse } from "next/server";
import { verifyCheckMacValue } from "@/lib/ecpay";

/**
 * 綠界可能將 OrderResultURL 設為 /pay/result 時，以 POST 導轉
 * 此 route 處理 POST，驗證後 redirect 至同路徑（GET）顯示結果
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((val, key) => {
    params[key] = typeof val === "string" ? val : val.toString();
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  const orderId = params["MerchantTradeNo"] || "";
  const rtnCode = params["RtnCode"];
  const status = rtnCode === "1" ? "success" : "fail";

  if (!verifyCheckMacValue(params)) {
    return NextResponse.redirect(`${baseUrl}/pay/result?status=error`);
  }

  return NextResponse.redirect(
    `${baseUrl}/pay/result?orderId=${encodeURIComponent(orderId)}&status=${status}`
  );
}
