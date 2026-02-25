import { NextRequest, NextResponse } from "next/server";
import { createCalendarEvent } from "@/lib/google-calendar";
import {
  getKolByCode,
  getMonthlyUsage,
  addUsageRecord,
} from "@/lib/google-sheet";
import { sendBookingConfirmation } from "@/lib/email";
import { STUDIOS } from "@/lib/studios";

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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "無效的請求內容" }, { status: 400 });
  }
  const { start, end, name, contact, note, interviewGuests, discountCode, studio, includeInvoice } = body;
  const studioId = (studio === "small" ? "small" : "big") as import("@/lib/studios").StudioId;
  if (!start || !end || !name || !contact) {
    return NextResponse.json(
      { error: "請提供 start、end、name、contact" },
      { status: 400 }
    );
  }
  // 依 start/end 時間差計算時數（建議 client 傳 Asia/Taipei 格式如 2025-02-24T09:00:00+08:00）
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "無效的 start/end 時間" }, { status: 400 });
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
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const usedThisMonth = await getMonthlyUsage(discountCode.trim(), yearMonth);
      const remaining = kol.hoursPerMonth - usedThisMonth;
      const usableFree = Math.max(0, remaining); // 透支時不扣負數，僅付本次
      if (usableFree < durationHours) {
        const paidHours = durationHours - usableFree;
        return NextResponse.json({
          needPayment: true,
          remainingHours: usableFree,
          paidHours,
          durationHours,
          message: `本月剩餘 ${usableFree.toFixed(1)} 小時，本次 ${durationHours.toFixed(1)} 小時，超出 ${paidHours.toFixed(1)} 小時需付費`,
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
    const summary = `[錄音室預約] ${name}${interviewGuests?.trim() ? ` 訪談：${interviewGuests.trim()}` : ""}`;
    const description = `聯絡方式：${contact}${note ? `\n備註：${note}` : ""}${interviewGuests?.trim() ? `\n訪談來賓：${interviewGuests.trim()}` : ""}${discountCode?.trim() ? `\n折扣碼：${discountCode.trim()}` : ""}${includeInvoice ? "\n需開立發票：是" : ""}`;

    await createCalendarEvent(
      { start, end, summary, description },
      studioId
    );

    // 若有折扣碼，寫入使用記錄（含大小間、訪談來賓）
    if (discountCode?.trim()) {
      const dateStr = new Date(start).toISOString().slice(0, 10);
      await addUsageRecord(
        discountCode.trim(),
        dateStr,
        durationHours,
        `${name} ${dateStr}`,
        studioId,
        interviewGuests?.trim()
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

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Calendar book error:", e);
    const message = e instanceof Error ? e.message : "預約失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
