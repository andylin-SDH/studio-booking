import { NextRequest, NextResponse } from "next/server";
import { verifyCheckMacValue } from "@/lib/ecpay";
import {
  getPendingOrder,
  markPendingOrderCompleted,
  addUsageRecord,
} from "@/lib/google-sheet";
import { createCalendarEvent, isSlotAvailable } from "@/lib/google-calendar";
import { sendBookingConfirmation, sendInvoiceNotificationToAdmin } from "@/lib/email";
import { STUDIOS, type StudioId } from "@/lib/studios";

function extractBookingFields(note?: string): {
  microphoneCount?: number;
  invoiceTitle?: string;
  invoiceTaxId?: string;
  invoiceRecipientEmail?: string;
  plainNote?: string;
} {
  if (!note) return { plainNote: "" };
  const lines = note
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let microphoneCount: number | undefined;
  let invoiceTitle: string | undefined;
  let invoiceTaxId: string | undefined;
  let invoiceRecipientEmail: string | undefined;
  const plainLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("需求麥克風數量：")) {
      const match = line.match(/需求麥克風數量：\s*(\d+)/);
      if (match) microphoneCount = parseInt(match[1], 10);
      continue;
    }
    if (line.startsWith("發票抬頭：")) {
      invoiceTitle = line.replace("發票抬頭：", "").trim();
      continue;
    }
    if (line.startsWith("統編：")) {
      invoiceTaxId = line.replace("統編：", "").trim();
      continue;
    }
    if (line.startsWith("發票收件 Email：")) {
      invoiceRecipientEmail = line.replace("發票收件 Email：", "").trim();
      continue;
    }
    plainLines.push(line);
  }

  return {
    microphoneCount,
    invoiceTitle,
    invoiceTaxId,
    invoiceRecipientEmail,
    plainNote: plainLines.join("\n"),
  };
}

/** 綠界付款結果通知（Server POST），需回傳 1|OK */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((val, key) => {
    params[key] = typeof val === "string" ? val : val.toString();
  });

  const rtnCode = params["RtnCode"];
  const merchantTradeNo = params["MerchantTradeNo"];
  const simulatePaid = params["SimulatePaid"];

  console.log("[ECPay Return] 收到回調", {
    merchantTradeNo,
    rtnCode,
    simulatePaid,
    sandbox: process.env.ECPAY_SANDBOX,
  });

  if (!verifyCheckMacValue(params)) {
    console.error("[ECPay Return] CheckMacValue 驗證失敗");
    return new NextResponse("0|CheckMacValue Error", { status: 400 });
  }

  if (rtnCode !== "1") {
    console.log("[ECPay Return] 非成功狀態，略過", { rtnCode });
    return new NextResponse("1|OK");
  }

  // 測試環境的模擬付款也視為成功；正式環境不會收到 SimulatePaid
  if (simulatePaid === "1" && process.env.ECPAY_SANDBOX !== "true") {
    console.log("[ECPay Return] 正式環境收到 SimulatePaid，略過");
    return new NextResponse("1|OK");
  }

  try {
    const order = await getPendingOrder(merchantTradeNo);
    if (!order) {
      console.warn("[ECPay Return] 找不到訂單", { merchantTradeNo });
      return new NextResponse("1|OK");
    }
    if (order.status === "completed") {
      console.log("[ECPay Return] 訂單已完成，略過", { merchantTradeNo });
      return new NextResponse("1|OK");
    }

    const roomLabel = order.studio === "small" ? "小間" : "大間";
    const bookingFields = extractBookingFields(order.note);
    const micLabel = bookingFields.microphoneCount
      ? `${bookingFields.microphoneCount} 支`
      : "未填";
    const summary = `[錄音室預約-付費-${roomLabel}] ${order.name}${order.interviewGuests?.trim() ? ` 訪談：${order.interviewGuests.trim()}` : ""} ｜麥克風 ${micLabel}`;
    const detailLines: string[] = [`聯絡方式：${order.contact}`, `麥克風數量：${micLabel}`];
    if (order.interviewGuests?.trim()) detailLines.push(`訪談來賓：${order.interviewGuests.trim()}`);
    if (order.discountCode?.trim()) detailLines.push(`折扣碼：${order.discountCode.trim()}`);
    detailLines.push(`付費超出：${order.paidHours} 小時`);
    if (order.includeInvoice) {
      detailLines.push("需開立發票：是");
      if (bookingFields.invoiceTitle) detailLines.push(`發票抬頭：${bookingFields.invoiceTitle}`);
      if (bookingFields.invoiceTaxId) detailLines.push(`統編：${bookingFields.invoiceTaxId}`);
      if (bookingFields.invoiceRecipientEmail) {
        detailLines.push(`發票收件 Email：${bookingFields.invoiceRecipientEmail}`);
      }
    }
    if (bookingFields.plainNote) detailLines.push(`備註：${bookingFields.plainNote}`);
    const description = detailLines.join("\n");

    // 確保為 ISO 字串（試算表可能回傳不同格式）
    const startIso = new Date(order.start).toISOString();
    const endIso = new Date(order.end).toISOString();
    console.log("[ECPay Return] 建立行事曆", { start: startIso, end: endIso, studio: order.studio });

    const stillAvailable = await isSlotAvailable(startIso, endIso, order.studio as StudioId);
    if (!stillAvailable) {
      console.error("[ECPay Return] 時段已被預約，不建立行事曆、不標記訂單完成，需人工處理", {
        merchantTradeNo,
        start: startIso,
        end: endIso,
        studio: order.studio,
      });
      return new NextResponse("1|OK", {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const eventId = await createCalendarEvent(
      {
        start: startIso,
        end: endIso,
        summary,
        description,
      },
      order.studio as StudioId
    );

    const durationHours = order.durationMinutes / 60;
    const dateStr = startIso.slice(0, 10);

    if (order.discountCode) {
      await addUsageRecord(
        order.discountCode,
        dateStr,
        durationHours,
        `${order.name} ${dateStr}（含付費 ${order.paidHours}h）`,
        order.studio,
        order.interviewGuests,
        eventId
      );
    }

    await markPendingOrderCompleted(merchantTradeNo);
    await sendBookingConfirmation({
      to: order.contact,
      name: order.name,
      start: startIso,
      end: endIso,
      studio: order.studio as StudioId,
      studioLabel: STUDIOS[order.studio as StudioId],
      interviewGuests: order.interviewGuests?.trim(),
      isPaid: true,
    });
    if (order.includeInvoice) {
      await sendInvoiceNotificationToAdmin({
        name: order.name,
        contact: order.contact,
        start: startIso,
        end: endIso,
        studio: order.studio as StudioId,
        studioLabel: STUDIOS[order.studio as StudioId],
        amount: order.amount,
        note: bookingFields.plainNote,
        invoiceTitle: bookingFields.invoiceTitle,
        invoiceTaxId: bookingFields.invoiceTaxId,
        invoiceRecipientEmail: bookingFields.invoiceRecipientEmail,
      });
    }
    console.log("[ECPay Return] 行事曆已建立，訂單已標記完成", { merchantTradeNo });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[ECPay Return] 處理失敗", {
      message: err.message,
      stack: err.stack,
      merchantTradeNo,
    });
  }

  return new NextResponse("1|OK", {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
