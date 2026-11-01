import { getKolByCode, getMonthlyUsage, getTotalUsage } from "@/lib/google-sheet";
import {
  canUseDiscountCode,
  hourlyRateForPlan,
  type BookingPlan,
} from "@/lib/booking-pricing";

export type BookingQuote =
  | {
      ok: true;
      plan: BookingPlan;
      hourlyRate: number;
      durationHours: number;
      paidHours: number;
      freeHours: number;
      appliedDiscountCode: string;
      message: string;
    }
  | { ok: false; status: number; error: string };

/**
 * 由伺服器決定應付時數與是否套用優惠碼。
 * 週末與活動方案會忽略客戶端帶來的折扣碼，不扣額度。
 */
export async function quoteBooking(input: {
  start: string;
  durationHours: number;
  plan: BookingPlan;
  discountCode?: string;
}): Promise<BookingQuote> {
  const hourlyRate = hourlyRateForPlan(input.plan);
  const durationHours = input.durationHours;
  const rawCode = input.discountCode?.trim() ?? "";
  const allowDiscount = canUseDiscountCode(input.plan, input.start) && rawCode.length > 0;

  if (!allowDiscount) {
    return {
      ok: true,
      plan: input.plan,
      hourlyRate,
      durationHours,
      paidHours: durationHours,
      freeHours: 0,
      appliedDiscountCode: "",
      message: `本次預約 ${durationHours.toFixed(1)} 小時，請完成付款`,
    };
  }

  try {
    const kol = await getKolByCode(rawCode);
    if (!kol) {
      return { ok: false, status: 400, error: "折扣碼無效" };
    }
    const hasOneTimeQuota =
      typeof kol.oneTimeTotalHours === "number" && kol.oneTimeTotalHours > 0;
    let remaining = 0;
    let quotaLabel = "本月";
    if (hasOneTimeQuota) {
      const usedTotal = await getTotalUsage(rawCode);
      remaining = kol.oneTimeTotalHours! - usedTotal;
      quotaLabel = "總額度";
    } else {
      const yearMonth = input.start.slice(0, 7);
      const usedThisMonth = await getMonthlyUsage(rawCode, yearMonth);
      remaining = kol.hoursPerMonth - usedThisMonth;
    }
    const usableFree = Math.max(0, remaining);
    const freeHours = Math.min(durationHours, usableFree);
    const paidHours = durationHours - freeHours;
    if (paidHours > 0) {
      return {
        ok: true,
        plan: input.plan,
        hourlyRate,
        durationHours,
        paidHours,
        freeHours,
        appliedDiscountCode: rawCode,
        message: `${quotaLabel}剩餘 ${usableFree.toFixed(1)} 小時，本次 ${durationHours.toFixed(1)} 小時，超出 ${paidHours.toFixed(1)} 小時需付費`,
      };
    }
    return {
      ok: true,
      plan: input.plan,
      hourlyRate,
      durationHours,
      paidHours: 0,
      freeHours,
      appliedDiscountCode: rawCode,
      message: "",
    };
  } catch (error) {
    console.error("Discount check error:", error);
    return { ok: false, status: 500, error: "折扣碼驗證失敗" };
  }
}
