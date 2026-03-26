import { NextRequest, NextResponse } from "next/server";
import { addDays, addMonths, format } from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  getKolByCode,
  getMonthlyUsage,
  getTotalUsage,
  listUsageRecordsWithEventId,
} from "@/lib/google-sheet";
import { getCalendarEventTimes } from "@/lib/google-calendar";

/** 可預約 90 天內，約 4 個月顯示剩餘額度 */
const MONTHS_TO_SHOW = 4;

function formatTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "請提供折扣碼" }, { status: 400 });
  }
  try {
    const kol = await getKolByCode(code);
    if (!kol) {
      return NextResponse.json({
        valid: false,
        error: "折扣碼無效",
      });
    }
    const now = new Date();
    const monthlyRemaining: { yearMonth: string; label: string; used: number; remaining: number }[] = [];
    const hasOneTimeQuota =
      typeof kol.oneTimeTotalHours === "number" && kol.oneTimeTotalHours > 0;
    const totalUsed = hasOneTimeQuota ? await getTotalUsage(code) : 0;
    const totalRemaining = hasOneTimeQuota
      ? Math.max(0, kol.oneTimeTotalHours! - totalUsed)
      : 0;

    for (let i = 0; i < MONTHS_TO_SHOW; i++) {
      const d = addMonths(now, i);
      const yearMonth = format(d, "yyyy-MM");
      const label = format(d, "M 月", { locale: zhTW });
      const used = hasOneTimeQuota ? totalUsed : await getMonthlyUsage(code, yearMonth);
      const remaining = hasOneTimeQuota
        ? totalRemaining
        : Math.max(0, kol.hoursPerMonth - used);
      monthlyRemaining.push({ yearMonth, label, used, remaining });
    }

    // 取得未來已預約時段（含 eventId），供前端顯示並提供取消按鈕
    const todayStr = format(now, "yyyy-MM-dd");
    const maxDate = addDays(now, 90);
    const maxStr = format(maxDate, "yyyy-MM-dd");
    const allRecords = await listUsageRecordsWithEventId();
    const normalized = code.toLowerCase();
    const futureBookings = allRecords
      .filter((r) => {
        const c = r.code.toLowerCase();
        const d = r.dateStr;
        return c === normalized && d >= todayStr && d <= maxStr;
      })
      .map((r) => ({
        date: r.dateStr,
        hours: r.hoursUsed,
        studio: r.studio,
        eventId: r.eventId,
        summary: r.summary,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 反查行事曆事件 start/end，讓老師知道要取消哪個「時段」
    const futureBookingsWithTimes = await Promise.all(
      futureBookings.map(async (b) => {
        const times = await getCalendarEventTimes(b.eventId, b.studio);
        if (!times) return b;
        const timeSlot = `${formatTimeLabel(times.start)} - ${formatTimeLabel(
          times.end
        )}`;
        return { ...b, timeSlot };
      })
    );

    return NextResponse.json({
      valid: true,
      kolName: kol.name,
      hoursPerMonth: hasOneTimeQuota ? kol.oneTimeTotalHours! : kol.hoursPerMonth,
      monthlyRemaining,
      futureBookings: futureBookingsWithTimes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Discount validate error:", e);
    return NextResponse.json(
      {
        error: "無法驗證折扣碼",
        detail: msg,
      },
      { status: 500 }
    );
  }
}
