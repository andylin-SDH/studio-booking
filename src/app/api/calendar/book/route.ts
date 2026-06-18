import { NextRequest, NextResponse } from "next/server";
import { createCalendarEvent, isSlotAvailable } from "@/lib/google-calendar";
import {
  getKolByCode,
  getMonthlyUsage,
  getTotalUsage,
  addUsageRecord,
} from "@/lib/google-sheet";
import { sendBookingConfirmation } from "@/lib/email";
import { STUDIOS } from "@/lib/studios";
import { getSmallStudioOnlineBookingBlockMessage } from "@/lib/booking-rules";

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

  // 若有折扣碼，驗證額度
  if (discountCode?.trim()) {
    try {
      const kol = await getKolByCode(discountCode.trim());
      if (!kol) {
        return NextResponse.json(
          { error: "折扣碼無效" },
          { status: 400 }
        );
      }
      const normalizedCode = discountCode.trim();
      const hasOneTimeQuota =
        typeof kol.oneTimeTotalHours === "number" && kol.oneTimeTotalHours > 0;
      let remaining = 0;
      let quotaLabel = "本月";
      if (hasOneTimeQuota) {
        const usedTotal = await getTotalUsage(normalizedCode);
        remaining = kol.oneTimeTotalHours! - usedTotal;
        quotaLabel = "總額度";
      } else {
        // 依預約的 start 日期取得「該月」額度（不是當月；避免 toISOString 時區轉換）
        const yearMonth = start.slice(0, 7);
        const usedThisMonth = await getMonthlyUsage(normalizedCode, yearMonth);
        remaining = kol.hoursPerMonth - usedThisMonth;
      }
      const usableFree = Math.max(0, remaining); // 透支時不扣負數，僅付本次
      if (usableFree < durationHours) {
        const paidHours = durationHours - usableFree;
        return NextResponse.json({
          needPayment: true,
          remainingHours: usableFree,
          paidHours,
          durationHours,
          message: `${quotaLabel}剩餘 ${usableFree.toFixed(1)} 小時，本次 ${durationHours.toFixed(1)} 小時，超出 ${paidHours.toFixed(1)} 小時需付費`,
        });
      }
    } catch (e) {
      console.error("Discount check error:", e);
      return NextResponse.json(
        { error: "折扣碼驗證失敗" },
        { status: 500 }
      );
    }
  } else {
    // 無折扣碼：一律經綠界付款
    return NextResponse.json({
      needPayment: true,
      remainingHours: 0,
      paidHours: durationHours,
      durationHours,
      message: `本次預約 ${durationHours.toFixed(1)} 小時，請完成付款`,
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
    const detailLines: string[] = [`聯絡方式：${contact}`, `麥克風數量：${micLabel}`];
    if (interviewGuests?.trim()) detailLines.push(`訪談來賓：${interviewGuests.trim()}`);
    if (discountCode?.trim()) detailLines.push(`折扣碼：${discountCode.trim()}`);
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
    if (discountCode?.trim()) {
      const dateStr = new Date(start).toISOString().slice(0, 10);
      await addUsageRecord(
        discountCode.trim(),
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
