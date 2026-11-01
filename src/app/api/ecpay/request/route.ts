import { NextRequest, NextResponse } from "next/server";
import { buildEcpayForm } from "@/lib/ecpay";
import { addPendingOrder } from "@/lib/google-sheet";
import { getSmallStudioOnlineBookingBlockMessage } from "@/lib/booking-rules";
import { chargeAmount, parseBookingPlan, planLabel, planNoteLine } from "@/lib/booking-pricing";
import { quoteBooking } from "@/lib/booking-quote";
import { isSlotAvailable } from "@/lib/google-calendar";

/** 預設是否含稅（僅當前端未傳 includeTax 時使用） */
const DEFAULT_INCLUDE_TAX = process.env.PAYMENT_INCLUDE_TAX === "true";

/** 綠界 MerchantTradeNo 限制 20 字元 */
function generateOrderId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `SDH${t}${r}`.slice(0, 20);
}

export async function POST(request: NextRequest) {
  let body: {
    start?: string;
    end?: string;
    durationMinutes?: number;
    name?: string;
    contact?: string;
    note?: string;
    interviewGuests?: string;
    discountCode?: string;
    plan?: string;
    activityTermsAccepted?: boolean;
    studio?: string;
    paidHours?: number;
    includeTax?: boolean;
    microphoneCount?: number;
    invoiceTitle?: string;
    invoiceTaxId?: string;
    invoiceRecipientEmail?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "無效的請求內容" }, { status: 400 });
  }

  const {
    start,
    end,
    name,
    contact,
    note = "",
    interviewGuests = "",
    discountCode = "",
    plan: planRaw,
    activityTermsAccepted = false,
    studio = "big",
    paidHours: clientPaidHours = 0,
    includeTax = false,
    microphoneCount,
    invoiceTitle = "",
    invoiceTaxId = "",
    invoiceRecipientEmail = "",
  } = body;

  if (!start || !end || !name || !contact || !microphoneCount) {
    return NextResponse.json(
      { error: "請提供 start、end、name、contact、microphoneCount" },
      { status: 400 }
    );
  }
  const plan = parseBookingPlan(planRaw);
  if (!plan) {
    return NextResponse.json({ error: "請選擇使用方案" }, { status: 400 });
  }
  if (plan === "activity" && activityTermsAccepted !== true) {
    return NextResponse.json({ error: "請先閱讀並勾選活動租借須知" }, { status: 400 });
  }
  if (microphoneCount < 1 || microphoneCount > 4) {
    return NextResponse.json({ error: "需求麥克風數量需為 1~4" }, { status: 400 });
  }
  if (includeTax) {
    if (!invoiceTitle.trim() || !invoiceTaxId.trim() || !invoiceRecipientEmail.trim()) {
      return NextResponse.json({ error: "勾選開立發票後，請填寫抬頭、統編與收件 Email" }, { status: 400 });
    }
    if (!/^\d{8}$/.test(invoiceTaxId.trim())) {
      return NextResponse.json({ error: "統編格式需為 8 碼數字" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceRecipientEmail.trim())) {
      return NextResponse.json({ error: "請輸入有效的發票收件 Email" }, { status: 400 });
    }
  }

  // 依 start/end 計算實際時長（分鐘），不依賴前端
  const durationMinutes = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000
  );
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ error: "無效的 start/end 時間" }, { status: 400 });
  }

  const studioId = (studio === "small" ? "small" : "big") as "big" | "small";
  const onlineBlock = getSmallStudioOnlineBookingBlockMessage(studioId, start);
  if (onlineBlock) {
    return NextResponse.json({ error: onlineBlock }, { status: 400 });
  }

  // 付款前先擋時段，避免前端殘留可約、付完才發現衝突
  try {
    const stillAvailable = await isSlotAvailable(start, end, studioId);
    if (!stillAvailable) {
      return NextResponse.json(
        { error: "該時段已被預約，請重新選擇時段或重新整理頁面查看最新狀況。" },
        { status: 409 }
      );
    }
  } catch (e) {
    console.error("ECPay request slot check error:", e);
    return NextResponse.json({ error: "無法確認時段是否可約，請稍後再試" }, { status: 500 });
  }

  const quote = await quoteBooking({
    start,
    durationHours: durationMinutes / 60,
    plan,
    discountCode,
  });
  if (!quote.ok) {
    return NextResponse.json({ error: quote.error }, { status: quote.status });
  }
  if (quote.paidHours <= 0) {
    return NextResponse.json(
      { error: "此預約無須另行付款，請重新送出" },
      { status: 400 }
    );
  }
  if (clientPaidHours > 0 && Math.abs(clientPaidHours - quote.paidHours) > 0.01) {
    console.warn("[ECPay Request] 前端時數與伺服器不一致，改以伺服器為準", {
      clientPaidHours,
      paidHours: quote.paidHours,
      plan,
    });
  }

  const addTax = body.includeTax !== undefined ? body.includeTax : DEFAULT_INCLUDE_TAX;
  const amount = chargeAmount(quote.paidHours, quote.hourlyRate, addTax);
  if (amount < 1) {
    return NextResponse.json({ error: "金額計算錯誤" }, { status: 400 });
  }

  const orderId = generateOrderId();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  const returnUrl = `${baseUrl}/api/ecpay/return`;
  const orderResultUrl = `${baseUrl}/pay/result`;
  const clientBackUrl = `${baseUrl}/#calendar`;

  const normalizedNote = note.trim();
  const mergedNote = [
    normalizedNote,
    planNoteLine(plan),
    plan === "activity" ? "活動租借須知：已閱讀" : "",
    `需求麥克風數量：${microphoneCount} 支`,
    includeTax ? `發票抬頭：${invoiceTitle.trim()}` : "",
    includeTax ? `統編：${invoiceTaxId.trim()}` : "",
    includeTax ? `發票收件 Email：${invoiceRecipientEmail.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await addPendingOrder({
      orderId,
      start,
      end,
      durationMinutes,
      name: name.trim(),
      contact: contact.trim(),
      note: mergedNote,
      discountCode: quote.appliedDiscountCode,
      studio: studioId,
      paidHours: quote.paidHours,
      amount,
      status: "pending",
      createdAt: new Date().toISOString(),
      includeInvoice: addTax,
      interviewGuests: (interviewGuests && interviewGuests.trim()) || "",
    });

    const { formActionUrl, formData } = buildEcpayForm({
      orderId,
      amount,
      productName: `盛德好錄音室 · ${planLabel(plan)} · ${quote.paidHours.toFixed(1)} 小時${addTax ? "（含5%稅）" : ""}`,
      returnUrl,
      orderResultUrl,
      clientBackUrl,
    });

    return NextResponse.json({
      formActionUrl,
      formData,
      orderId,
    });
  } catch (e) {
    console.error("ECPay request error:", e);
    const msg = e instanceof Error ? e.message : "建立付款失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
