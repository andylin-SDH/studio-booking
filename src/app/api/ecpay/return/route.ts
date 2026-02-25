import { NextRequest, NextResponse } from "next/server";
import { verifyCheckMacValue } from "@/lib/ecpay";
import {
  getPendingOrder,
  markPendingOrderCompleted,
  addUsageRecord,
} from "@/lib/google-sheet";
import { createCalendarEvent } from "@/lib/google-calendar";
import { sendBookingConfirmation, sendInvoiceNotificationToAdmin } from "@/lib/email";
import { STUDIOS, type StudioId } from "@/lib/studios";

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

    const summary = `[錄音室預約-付費] ${order.name}${order.interviewGuests?.trim() ? ` ${order.interviewGuests.trim()}` : ""}`;
    const description = `聯絡方式：${order.contact}${order.note ? `\n備註：${order.note}` : ""}${order.interviewGuests ? `\n訪談來賓：${order.interviewGuests}` : ""}${order.discountCode ? `\n折扣碼：${order.discountCode}\n付費超出：${order.paidHours} 小時` : ""}`;

    // 確保為 ISO 字串（試算表可能回傳不同格式）
    const startIso = new Date(order.start).toISOString();
    const endIso = new Date(order.end).toISOString();
    console.log("[ECPay Return] 建立行事曆", { start: startIso, end: endIso, studio: order.studio });

    await createCalendarEvent(
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
        order.interviewGuests
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
