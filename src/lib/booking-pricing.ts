import { isBookingStartWeekendTaipei } from "@/lib/booking-rules";

/** 五人以下（僅限錄音使用），每小時未稅 */
export const RECORDING_HOURLY_RATE = 500;
/** 6人起（活動，講座等），每小時未稅 */
export const ACTIVITY_HOURLY_RATE = 700;

export const WEEKEND_BOOKING_NOTICE_TITLE = "週末預約";

export type BookingPlan = "record" | "activity";

export function parseBookingPlan(value: unknown): BookingPlan | null {
  if (value === "record" || value === "activity") return value;
  return null;
}

export function planLabel(plan: BookingPlan): string {
  return plan === "record" ? "五人以下（僅限錄音使用）" : "6人起（活動，講座等）";
}

export function planFromLabel(label: string | undefined): BookingPlan | null {
  if (!label) return null;
  if (label.includes("活動")) return "activity";
  if (label.includes("錄音")) return "record";
  return null;
}

export function hourlyRateForPlan(plan: BookingPlan): number {
  return plan === "record" ? RECORDING_HOURLY_RATE : ACTIVITY_HOURLY_RATE;
}

/** 優惠碼只抵平日的錄音方案，不能抵活動價或週末 */
export function canUseDiscountCode(plan: BookingPlan, isoStart: string): boolean {
  return plan === "record" && !isBookingStartWeekendTaipei(isoStart);
}

export function planNoteLine(plan: BookingPlan): string {
  return `使用方案：${planLabel(plan)}`;
}

/** 未稅先進位，開發票再乘 1.05 後進位。時數可以是 1.5 */
export function chargeAmount(paidHours: number, hourlyRate: number, includeTax: boolean): number {
  const untaxed = Math.ceil(paidHours * hourlyRate);
  if (!includeTax) return untaxed;
  return Math.ceil(untaxed * 1.05);
}
