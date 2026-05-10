import type { StudioId } from "@/lib/studios";

/** 大間：週末仍可預約，僅前端顯示警示（見 BookingModal） */
export const BIG_STUDIO_WEEKEND_NOTICE =
  "因週末無工作人員固定上班，如需預約假日大間空間，請聯繫經紀人取得自助入場方式。";

/** 小間：週末不開放線上預約時，阻擋預約並顯示此文案（聯繫句亦單獨用於行事曆精簡列） */
export const SMALL_STUDIO_WEEKEND_CONTACT_LINE =
  "如需預約假日小間空間，請聯繫經紀人確認。";

export const SMALL_STUDIO_WEEKEND_BLOCKED_NOTICE =
  `小間週六、週日不開放線上預約；${SMALL_STUDIO_WEEKEND_CONTACT_LINE}`;

/** 小間改為「僅警示、可線上預約」時，在 Modal 顯示（與舊「阻擋」二擇一設定） */
export const SMALL_STUDIO_WEEKEND_NOTICE_ONLY = SMALL_STUDIO_WEEKEND_CONTACT_LINE;

/** 大／小間：開始時段落在 19:00（含）以後時顯示（僅提醒，不阻擋預約） */
export const EVENING_BOOKING_NOTICE_TITLE = "晚上時段預約 · 請先看這裡";
export const EVENING_BOOKING_NOTICE_BODY =
  "因晚上時段無工作人員固定上班，預約前請聯繫經紀人確認，或取得自助入場方式";

/**
 * 小間週末線上預約政策（大間不受此設定影響）。
 * - blocked（預設）：週六日曆不可選、API 拒絕建立預約／付款單。
 * - notice_only：與大間類似，僅顯示警示文案，可完成線上預約（日後若開放自助入場可改為此值）。
 *
 * 環境變數：NEXT_PUBLIC_SMALL_STUDIO_WEEKEND_MODE=blocked | notice_only
 */
export type SmallStudioWeekendMode = "blocked" | "notice_only";

export function getSmallStudioWeekendMode(): SmallStudioWeekendMode {
  const raw = process.env.NEXT_PUBLIC_SMALL_STUDIO_WEEKEND_MODE?.trim().toLowerCase();
  if (raw === "notice_only" || raw === "open" || raw === "open_with_notice") {
    return "notice_only";
  }
  return "blocked";
}

/** 以台北時區判斷是否為週六或週日 */
export function isWeekendTaipei(date: Date): boolean {
  const wd = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Taipei",
  }).format(date);
  return wd === "Sat" || wd === "Sun";
}

/**
 * 月曆上某一格日期：以該「年月日」在台北是否為週末（避免僅依瀏覽器本地時區）。
 */
export function isWeekendForCalendarGridDay(day: Date): boolean {
  const y = day.getFullYear();
  const m = day.getMonth() + 1;
  const d = day.getDate();
  const noonTaipei = new Date(
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00+08:00`
  );
  return isWeekendTaipei(noonTaipei);
}

/** API／付款：以預約開始時間（ISO）在台北是否落於週末 */
export function isBookingStartWeekendTaipei(isoStart: string): boolean {
  return isWeekendTaipei(new Date(isoStart));
}

/**
 * 預約「開始」在 Asia/Taipei 是否為 19:00（含）以後（與現場時段 19:00、19:30、20:00…對齊）。
 */
export function isEveningBookingStartTaipei(date: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).formatToParts(date);
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = parseInt(p.value, 10);
    if (p.type === "minute") minute = parseInt(p.value, 10);
  }
  return hour * 60 + minute >= 19 * 60;
}

/**
 * 若應阻擋週末線上預約，回傳錯誤訊息；否則 null。
 */
export function getSmallStudioWeekendBookingBlockMessage(
  studio: StudioId,
  isoStart: string
): string | null {
  if (studio !== "small") return null;
  if (getSmallStudioWeekendMode() !== "blocked") return null;
  if (!isBookingStartWeekendTaipei(isoStart)) return null;
  return SMALL_STUDIO_WEEKEND_BLOCKED_NOTICE;
}
