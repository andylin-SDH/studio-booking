import { NextRequest, NextResponse } from "next/server";
import { getKolByCode } from "@/lib/google-sheet";
import { getMonthlyUsage } from "@/lib/google-sheet";

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
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const usedThisMonth = await getMonthlyUsage(code, yearMonth);
    const remaining = Math.max(0, kol.hoursPerMonth - usedThisMonth);

    return NextResponse.json({
      valid: true,
      kolName: kol.name,
      hoursPerMonth: kol.hoursPerMonth,
      usedThisMonth,
      remainingHours: remaining,
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
