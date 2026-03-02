import { NextRequest, NextResponse } from "next/server";
import { addMonths, format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { getKolByCode, getMonthlyUsage } from "@/lib/google-sheet";

/** 可預約的月份數（與行事曆一致） */
const MAX_BOOKING_MONTHS_AHEAD = 3;

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

    for (let i = 0; i <= MAX_BOOKING_MONTHS_AHEAD; i++) {
      const d = addMonths(now, i);
      const yearMonth = format(d, "yyyy-MM");
      const label = format(d, "M 月", { locale: zhTW });
      const used = await getMonthlyUsage(code, yearMonth);
      const remaining = Math.max(0, kol.hoursPerMonth - used);
      monthlyRemaining.push({ yearMonth, label, used, remaining });
    }

    return NextResponse.json({
      valid: true,
      kolName: kol.name,
      hoursPerMonth: kol.hoursPerMonth,
      monthlyRemaining,
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
