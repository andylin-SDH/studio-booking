import { NextRequest, NextResponse } from "next/server";
import { createCalendarEvent, isSlotAvailable } from "@/lib/google-calendar";
import { addUsageRecord } from "@/lib/google-sheet";
import { sendBookingConfirmation } from "@/lib/email";
import { STUDIOS } from "@/lib/studios";
import { getSmallStudioOnlineBookingBlockMessage } from "@/lib/booking-rules";
import { parseBookingPlan, planNoteLine } from "@/lib/booking-pricing";
import { quoteBooking } from "@/lib/booking-quote";

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
    includeInvoice?: boolean;
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
    note,
    interviewGuests,
    discountCode,
    plan: planRaw,
    activityTermsAccepted,
    studio,
    includeInvoice,
    microphoneCount,
    invoiceTitle,
    invoiceTaxId,
    invoiceRecipientEmail,
  } = body;
  const studioId = (studio === "small" ? "small" : "big") as import("@/lib/studios").StudioId;
  if (!start || !end || !name || !contact || !microphoneCount) {
    return NextResponse.json(
      { error: "請提供 start、end、name、contact、microphoneCount" },
      { status: 400 }
    );
  }
  if (microphoneCount < 1 || microphoneCount > 4) {
    return NextResponse.json({ error: "需求麥克風數量需為 1~4" }, { status: 400 });
  }
  if (includeInvoice) {
    if (!invoiceTitle?.trim() || !invoiceTaxId?.trim() || !invoiceRecipientEmail?.trim()) {
      return NextResponse.json({ error: "勾選開立發票後，請填寫抬頭、統編與收件 Email" }, { status: 400 });
    }
    if (!/^\d{8}$/.test(invoiceTaxId.trim())) {
      return NextResponse.json({ error: "統編格式需為 8 碼數字" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceRecipientEmail.trim())) {
      return NextResponse.json({ error: "請輸入有效的發票收件 Email" }, { status: 400 });
    }
  }
  // 依 start/end 時間差計算時數（建議 client 傳 Asia/Taipei 格式如 2025-02-24T09:00:00+08:00）
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "無效的 start/end 時間" }, { status: 400 });
  }
  const onlineBlock = getSmallStudioOnlineBookingBlockMessage(studioId, start);
  if (onlineBlock) {
    return NextResponse.json({ error: onlineBlock }, { status: 400 });
  }
  const durationMinutes = Math.round((endMs - startMs) / 60000);
  const durationHours = durationMinutes / 60;
  const plan = parseBookingPlan(planRaw);
  if (!plan) {
    return NextResponse.json({ error: "請選擇使用方案" }, { status: 400 });
  }
  if (plan === "activity" && activityTermsAccepted !== true) {
    return NextResponse.json({ error: "請先閱讀並勾選活動租借須知" }, { status: 400 });
  }

  const quote = await quoteBooking({
    start,
    durationHours,
    plan,
    discountCode,
  });
  if (!quote.ok) {
    return NextResponse.json({ error: quote.error }, { status: quote.status });
  }
  if (quote.paidHours > 0) {
    return NextResponse.json({
      needPayment: true,
      remainingHours: quote.freeHours,
      paidHours: quote.paidHours,
      durationHours,
      hourlyRate: quote.hourlyRate,
      plan,
      message: quote.message,
    });
  }

  try {
    // 下訂前最後一刻再查一次行事曆，避免多人同時下定同一時段
    const stillAvailable = await isSlotAvailable(start, end, studioId);
    if (!stillAvailable) {
      return NextResponse.json(
        { error: "該時段已被預約，請重新選擇時段或重新整理頁面查看最新狀況。" },
        { status: 409 }
      );
    }

    const roomLabel = studioId === "big" ? "大間" : "小間";
    const micLabel = `${microphoneCount} 支`;
    const summary = `[錄音室預約-${roomLabel}] ${name}${interviewGuests?.trim() ? ` 訪談：${interviewGuests.trim()}` : ""} ｜麥克風 ${micLabel}`;
    const detailLines: string[] = [
      `聯絡方式：${contact}`,
      `麥克風數量：${micLabel}`,
      planNoteLine(plan),
    ];
    if (plan === "activity") detailLines.push("活動租借須知：已閱讀");
    if (interviewGuests?.trim()) detailLines.push(`訪談來賓：${interviewGuests.trim()}`);
    if (quote.appliedDiscountCode) detailLines.push(`折扣碼：${quote.appliedDiscountCode}`);
    if (includeInvoice) {
      detailLines.push("需開立發票：是");
      if (invoiceTitle?.trim()) detailLines.push(`發票抬頭：${invoiceTitle.trim()}`);
      if (invoiceTaxId?.trim()) detailLines.push(`統編：${invoiceTaxId.trim()}`);
      if (invoiceRecipientEmail?.trim()) {
        detailLines.push(`發票收件 Email：${invoiceRecipientEmail.trim()}`);
      }
    }
    if (note?.trim()) detailLines.push(`備註：${note.trim()}`);
    const description = detailLines.join("\n");

    const eventId = await createCalendarEvent(
      { start, end, summary, description },
      studioId
    );

    // 若有折扣碼，寫入使用記錄（含大小間、訪談來賓、事件 ID）
    if (quote.appliedDiscountCode) {
      const dateStr = new Date(start).toISOString().slice(0, 10);
      await addUsageRecord(
        quote.appliedDiscountCode,
        dateStr,
        durationHours,
        `${name} ${dateStr}`,
        studioId,
        interviewGuests?.trim(),
        eventId
      );
    }

    await sendBookingConfirmation({
      to: contact,
      name,
      start,
      end,
      studio: studioId,
      studioLabel: STUDIOS[studioId],
      interviewGuests: interviewGuests?.trim(),
    });

    // 免付費預約（純折扣碼）沒有產生金額，不寄送開立發票通知信；僅付費訂單完成時於 ecpay/return 寄送

    return NextResponse.json({ success: true, eventId });
  } catch (e) {
    console.error("Calendar book error:", e);
    const message = e instanceof Error ? e.message : "預約失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
