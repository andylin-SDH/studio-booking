"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  parseISO,
} from "date-fns";
import { zhTW } from "date-fns/locale";
import {
  getSmallStudioWeekendMode,
  isWeekendForCalendarGridDay,
  SMALL_STUDIO_WEEKEND_BLOCKED_NOTICE,
  SMALL_STUDIO_WEEKEND_CONTACT_LINE,
  SMALL_STUDIO_EVENING_BLOCKED_NOTICE,
  EVENING_BOOKING_NOTICE_TITLE,
  EVENING_BOOKING_NOTICE_BODY,
  isEveningBookingStartTaipei,
  taipeiDateTimeFromGridDay,
  rangesOverlap,
} from "@/lib/booking-rules";
import { WeekendProminentAlert } from "@/components/WeekendProminentAlert";

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 23;
/** 最少起租時長（分鐘） */
const MIN_DURATION_MINUTES = 60;
/** 最多可預約到今天起的 N 天內 */
const MAX_BOOKING_DAYS_AHEAD = 90;
/** 開啟頁面時定期重抓行事曆，避免別人剛約完仍顯示可約 */
const EVENTS_REFRESH_MS = 30_000;

function formatTaipeiHm(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

type CalendarEvent = { start: string; end: string };

interface CalendarSectionProps {
  studio: "big" | "small";
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
  onSelectSlot: (start: Date, end: Date) => void;
  onOpenDiscountManage?: () => void;
  /** 預約表單開著時，重抓只更新已約時段，不清掉已選時間 */
  preserveTimeSelection?: boolean;
}

export function CalendarSection({
  studio,
  selectedDate,
  onSelectDate,
  onSelectSlot,
  onOpenDiscountManage,
  preserveTimeSelection = false,
}: CalendarSectionProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [eventsQuery, setEventsQuery] = useState<{ key: string; events: CalendarEvent[] }>({
    key: "",
    events: [],
  });
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const fetchGen = useRef(0);
  const appliedKeyRef = useRef("");

  // 預約成功後重新載入行事曆，避免同一時段重複預約
  useEffect(() => {
    const onBookingSuccess = () => setRefreshTrigger((n) => n + 1);
    window.addEventListener("booking-success", onBookingSuccess);
    return () => window.removeEventListener("booking-success", onBookingSuccess);
  }, []);

  // 頁面停留時定期刷新。表單開著也照樣抓，只更新已約時段。
  useEffect(() => {
    const id = window.setInterval(() => setRefreshTrigger((n) => n + 1), EVENTS_REFRESH_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") setRefreshTrigger((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const weeks = useMemo(() => {
    const w: Date[][] = [];
    let d = calStart;
    while (d <= calEnd) {
      w.push(
        Array.from({ length: 7 }, (_, i) => addDays(d, i))
      );
      d = addDays(d, 7);
    }
    return w;
  }, [calStart, calEnd]);

  // 取得當月行事曆事件（使用穩定字串避免重複請求）
  const monthKey = format(currentMonth, "yyyy-MM");
  const queryKey = `${studio}:${monthKey}`;
  const eventsReady = eventsQuery.key === queryKey;
  const events = eventsReady ? eventsQuery.events : [];
  const visibleError = error?.key === queryKey ? error.message : null;
  useEffect(() => {
    const gen = ++fetchGen.current;
    const controller = new AbortController();
    const from = format(monthStart, "yyyy-MM-dd");
    const to = format(addDays(monthEnd, 1), "yyyy-MM-dd");
    fetch(`/api/calendar/events?from=${from}&to=${to}&studio=${studio}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          events?: { start: string; end: string }[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "無法載入行事曆");
        }
        return data;
      })
      .then((data) => {
        // 較慢的舊請求不准覆蓋已經回來的新資料，也不准把別的月份畫上來
        if (gen !== fetchGen.current) return;
        appliedKeyRef.current = queryKey;
        setEventsQuery({ key: queryKey, events: data.events || [] });
        setError(null);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted || gen !== fetchGen.current) return;
        // 這個月份已經有資料時，背景重抓失敗就留著原畫面
        if (appliedKeyRef.current === queryKey) return;
        const message = e instanceof Error ? e.message : "無法載入行事曆";
        setError({ key: queryKey, message });
      });
    return () => {
      controller.abort();
    };
  }, [monthKey, studio, refreshTrigger]); // 切換月份、錄音室或預約成功後重新取得

  const maxDate = useMemo(() => {
    const today = startOfDay(new Date());
    return addDays(today, MAX_BOOKING_DAYS_AHEAD);
  }, []);
  const minMonth = startOfMonth(new Date());
  const maxMonth = startOfMonth(maxDate);
  const canGoPrev = currentMonth > minMonth;
  const canGoNext = currentMonth < maxMonth;

  const smallWeekendBlocked =
    studio === "small" && getSmallStudioWeekendMode() === "blocked";

  const eventRanges = useMemo(
    () =>
      events.map((e) => ({
        start: parseISO(e.start),
        end: parseISO(e.end),
      })),
    [events]
  );

  /** 當日可預約總分鐘數（9:00–23:00） */
  const totalMinutesPerDay = (DAY_END_HOUR - DAY_START_HOUR) * 60;

  /** 計算某天在營業時段內已被預約的分鐘數（以台北牆鐘對齊） */
  const getBookedMinutesOnDay = useCallback(
    (day: Date) => {
      const dayStart = taipeiDateTimeFromGridDay(day, DAY_START_HOUR, 0);
      const dayEnd = taipeiDateTimeFromGridDay(day, DAY_END_HOUR, 0);
      let total = 0;
      for (const range of eventRanges) {
        const start = range.start > dayStart ? range.start : dayStart;
        const end = range.end < dayEnd ? range.end : dayEnd;
        if (start < end) total += (end.getTime() - start.getTime()) / 60000;
      }
      return Math.round(total);
    },
    [eventRanges]
  );

  /** 每日使用狀況：日期字串 yyyy-MM-dd -> 已預約分鐘數 */
  const dailyUsage = useMemo(() => {
    const map = new Map<string, number>();
    weeks.flat().forEach((day) => {
      map.set(format(day, "yyyy-MM-dd"), getBookedMinutesOnDay(day));
    });
    return map;
  }, [weeks, getBookedMinutesOnDay]);

  /** 檢查時段是否與任何已預約事件重疊（台北牆鐘） */
  const isSlotBusy = (slotStart: Date, slotEnd: Date) =>
    eventRanges.some((range) => rangesOverlap(slotStart, slotEnd, range.start, range.end));

  /** 當日已預約區間（給使用者看，避免手機 select 看不出 disabled） */
  const bookedRangesOnSelectedDay = useMemo(() => {
    if (!selectedDate) return [] as { start: Date; end: Date; label: string }[];
    const dayStart = taipeiDateTimeFromGridDay(selectedDate, DAY_START_HOUR, 0);
    const dayEnd = taipeiDateTimeFromGridDay(selectedDate, DAY_END_HOUR, 0);
    return eventRanges
      .filter((r) => rangesOverlap(r.start, r.end, dayStart, dayEnd))
      .map((r) => {
        const start = r.start < dayStart ? dayStart : r.start;
        const end = r.end > dayEnd ? dayEnd : r.end;
        return {
          start,
          end,
          label: `${formatTaipeiHm(start)}–${formatTaipeiHm(end)}`,
        };
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [selectedDate, eventRanges]);

  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) {
      opts.push(`${String(h).padStart(2, "0")}:00`);
      if (h < DAY_END_HOUR) opts.push(`${String(h).padStart(2, "0")}:30`);
    }
    return opts;
  }, []);

  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");

  // 表單開著時不改已選時間。表單關掉後，若這段已經被約走才清掉。
  useEffect(() => {
    if (preserveTimeSelection || !eventsReady || !selectedDate || !startTime) return;
    const [sh, sm] = startTime.split(":").map(Number);
    const start = taipeiDateTimeFromGridDay(selectedDate, sh, sm);
    const probeEnd = new Date(start.getTime() + 30 * 60 * 1000);
    if (isSlotBusy(start, probeEnd)) {
      setStartTime("");
      setEndTime("");
      return;
    }
    if (!endTime) return;
    const [eh, em] = endTime.split(":").map(Number);
    const end = taipeiDateTimeFromGridDay(selectedDate, eh, em);
    if (isSlotBusy(start, end)) setEndTime("");
  }, [preserveTimeSelection, eventsReady, selectedDate, startTime, endTime, eventRanges]);

  const handleStartChange = (val: string) => {
    setStartTime(val);
    if (endTime) {
      const [sh, sm] = val.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const durationMin = (eh * 60 + em) - (sh * 60 + sm);
      if (val >= endTime || durationMin < MIN_DURATION_MINUTES) {
        setEndTime("");
      }
    }
  };

  const handleDateChange = (date: Date | null) => {
    setStartTime("");
    setEndTime("");
    onSelectDate(date);
  };

  // 切換錄音室時清空已選日期
  useEffect(() => {
    onSelectDate(null);
  }, [studio]);

  if (visibleError && !eventsReady) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        <p className="font-medium">無法載入行事曆</p>
        <p className="mt-1 text-sm">{visibleError}</p>
        <p className="mt-2 text-sm">
          請確認已設定 Google 行事曆 API（見 README），或先選擇日期與時段進行預約。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 月曆導覽 */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          className="shrink-0 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
        >
          ← 上個月
        </button>
        <span className="min-w-0 truncate text-center text-base font-semibold text-slate-800 sm:text-lg">
          {format(currentMonth, "yyyy 年 M 月", { locale: zhTW })}
        </span>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          className="shrink-0 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
        >
          下個月 →
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onOpenDiscountManage && (
          <button
            type="button"
            onClick={onOpenDiscountManage}
            className="rounded-full border border-amber-400/80 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 shadow-sm shadow-amber-500/30 hover:bg-amber-500/30 hover:border-amber-300"
          >
            老師查詢／取消預約
          </button>
        )}
        <p className="text-sm text-slate-500">
          僅可預約今日起 {MAX_BOOKING_DAYS_AHEAD} 天內
        </p>
      </div>

      {/* 月曆格子 + 圖例：小螢幕可橫向捲動 */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[280px]">
        <div className="grid grid-cols-7 border-b border-slate-200 text-center text-xs font-medium sm:text-sm">
          {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
            <div
              key={d}
              className={`py-2 ${
                smallWeekendBlocked && (i === 0 || i === 6)
                  ? "bg-orange-100/95 text-orange-950 font-semibold"
                  : "bg-slate-50 text-slate-600"
              }`}
            >
              {d}
              {smallWeekendBlocked && (i === 0 || i === 6) && (
                <span className="mt-0.5 block text-[10px] font-normal leading-none text-amber-900/75">
                  線上停約
                </span>
              )}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day) => {
              const inMonth = isSameMonth(day, currentMonth);
              const selected = selectedDate && isSameDay(day, selectedDate);
              const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
              const beyondMax = startOfDay(day) > startOfDay(maxDate);
              const weekendClosedSmall =
                smallWeekendBlocked && inMonth && isWeekendForCalendarGridDay(day);
              const selectable =
                inMonth && !isPast && !beyondMax && !weekendClosedSmall;
              const bookedMins = inMonth ? (dailyUsage.get(format(day, "yyyy-MM-dd")) ?? 0) : 0;
              const ratio = totalMinutesPerDay > 0 ? bookedMins / totalMinutesPerDay : 0;
              const usageLevel: "empty" | "low" | "medium" | "full" =
                ratio <= 0 ? "empty" : ratio < 1 / 3 ? "low" : ratio < 2 / 3 ? "medium" : "full";
              const bookedHoursLabel =
                bookedMins > 0
                  ? `已約${bookedMins < 60 ? `${bookedMins}分` : `${(bookedMins / 60).toFixed(1)}h`}`
                  : null;
              const showUsage = inMonth && !isPast;
              const usageBg =
                !showUsage || usageLevel === "empty"
                  ? ""
                  : usageLevel === "low"
                    ? "bg-emerald-50"
                    : usageLevel === "medium"
                      ? "bg-amber-50"
                      : "bg-rose-100";
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={!selectable}
                  title={
                    weekendClosedSmall ? SMALL_STUDIO_WEEKEND_BLOCKED_NOTICE : undefined
                  }
                  onClick={() => handleDateChange(selectable ? day : null)}
                  className={`${
                    weekendClosedSmall
                      ? "min-h-[3.75rem] sm:min-h-[4rem]"
                      : "min-h-[44px] sm:min-h-[52px]"
                  } border-b border-r border-slate-100 p-2 text-left text-sm transition sm:p-2.5
                    ${inMonth ? "text-slate-800" : "text-slate-300"}
                    ${
                      weekendClosedSmall
                        ? "cursor-not-allowed bg-gradient-to-b from-amber-50/90 via-orange-50/50 to-stone-50/40 text-amber-950 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]"
                        : !selectable
                          ? "cursor-not-allowed opacity-50"
                          : "hover:bg-slate-50"
                    }
                    ${selected ? "bg-sky-100 ring-2 ring-sky-500" : showUsage && !weekendClosedSmall ? usageBg : ""}
                    ${isToday(day) ? (weekendClosedSmall ? "font-semibold text-amber-950 ring-1 ring-amber-400/35 ring-inset" : "font-semibold text-sky-600") : ""}`}
                >
                  <span
                    className={`block tabular-nums ${
                      weekendClosedSmall && inMonth
                        ? "text-[15px] font-semibold tracking-tight text-amber-950"
                        : ""
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {weekendClosedSmall && (
                    <p className="mt-1 border-l-2 border-amber-500/65 pl-2 text-[10px] font-normal leading-snug text-amber-950/85 break-words sm:text-[11px] sm:leading-[1.45]">
                      {SMALL_STUDIO_WEEKEND_CONTACT_LINE}
                    </p>
                  )}
                  {bookedHoursLabel && showUsage && !weekendClosedSmall && (
                    <span
                      className={`block truncate text-[10px] leading-tight ${
                        usageLevel === "full" ? "text-rose-600" : usageLevel === "medium" ? "text-amber-700" : "text-emerald-600"
                      }`}
                      title={`當日已預約 ${bookedMins} 分鐘`}
                    >
                      {bookedHoursLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:gap-4 sm:px-4">
          <span className="font-medium">當日使用狀況：</span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-4 rounded border border-emerald-200 bg-emerald-50" />
            空閒較多
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-4 rounded border border-amber-200 bg-amber-50" />
            部分時段已約
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-4 rounded border border-rose-200 bg-rose-100" />
            較滿
          </span>
          {smallWeekendBlocked && (
            <span className="flex max-w-[220px] flex-col gap-0.5 border-l border-slate-200 pl-3 sm:max-w-none sm:flex-row sm:items-center sm:gap-1.5 sm:pl-4">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-4 shrink-0 rounded border border-orange-300 bg-orange-50" />
                週六日欄：小間不開放線上
              </span>
            </span>
          )}
        </div>
      </div>

      {/* 已選日期：開始 / 結束時間下拉選單 */}
      {selectedDate && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-800">
            {format(selectedDate, "yyyy年M月d日 (EEEE)", { locale: zhTW })} — 選擇時段
          </h3>
          {!eventsReady ? (
            <p className="text-slate-500">載入中…</p>
          ) : (
            <div className="space-y-4">
              {bookedRangesOnSelectedDay.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
                  <p className="font-semibold">本日已預約（不可再約）</p>
                  <p className="mt-1 text-rose-800/90">
                    {bookedRangesOnSelectedDay.map((r) => r.label).join("、")}
                  </p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">開始</label>
                  <select
                    value={startTime}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">開始時間</option>
                    {timeOptions.flatMap((t) => {
                      const [h, m] = t.split(":").map(Number);
                      const slotStart = taipeiDateTimeFromGridDay(selectedDate, h, m);
                      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
                      const past = slotStart <= new Date();
                      const busy = isSlotBusy(slotStart, slotEnd);
                      const eveningBlockedSmall =
                        studio === "small" && isEveningBookingStartTaipei(slotStart);
                      // 手機 Safari 常忽略 option disabled：已預約／不開放直接不列入可選
                      if ((busy || eveningBlockedSmall) && !(preserveTimeSelection && t === startTime)) return [];
                      return [
                        <option key={t} value={t} disabled={past}>
                          {t}
                          {past ? "（已過）" : ""}
                        </option>,
                      ];
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">結束</label>
                  <select
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    disabled={!startTime}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                  >
                    <option value="">結束時間</option>
                    {timeOptions
                      .filter((t) => {
                        if (!startTime || t <= startTime) return false;
                        const [sh, sm] = startTime.split(":").map(Number);
                        const [h, m] = t.split(":").map(Number);
                        const durationMin = h * 60 + m - (sh * 60 + sm);
                        if (durationMin < MIN_DURATION_MINUTES) return false;
                        const slotStart = taipeiDateTimeFromGridDay(selectedDate, sh, sm);
                        const slotEnd = taipeiDateTimeFromGridDay(selectedDate, h, m);
                        // 與已預約重疊的結束時間不列（手機不可靠 disabled）
                        return !isSlotBusy(slotStart, slotEnd) || (preserveTimeSelection && t === endTime);
                      })
                      .map((t) => {
                        const [h, m] = t.split(":").map(Number);
                        const slotEnd = taipeiDateTimeFromGridDay(selectedDate, h, m);
                        const past = slotEnd <= new Date();
                        return (
                          <option key={t} value={t} disabled={past}>
                            {t}
                            {past ? "（已過）" : ""}
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>
              {studio === "small" &&
                selectedDate &&
                !isWeekendForCalendarGridDay(selectedDate) && (
                  <p className="border-l-2 border-amber-500/65 pl-2.5 text-xs leading-relaxed text-amber-950/85">
                    {SMALL_STUDIO_EVENING_BLOCKED_NOTICE}
                  </p>
                )}
              {studio === "big" &&
                startTime &&
                (() => {
                  const [h, m] = startTime.split(":").map(Number);
                  const d = taipeiDateTimeFromGridDay(selectedDate, h, m);
                  return isEveningBookingStartTaipei(d);
                })() && (
                  <WeekendProminentAlert title={EVENING_BOOKING_NOTICE_TITLE}>
                    {EVENING_BOOKING_NOTICE_BODY}
                  </WeekendProminentAlert>
                )}
              <p className="text-xs text-slate-500">
                最少起租 1 小時；已預約時段不會出現在上方選單。
              </p>
              <button
                type="button"
                disabled={
                  !startTime ||
                  !endTime ||
                  (() => {
                    if (!startTime || !endTime) return true;
                    const [sh, sm] = startTime.split(":").map(Number);
                    const [eh, em] = endTime.split(":").map(Number);
                    const durationMin = eh * 60 + em - (sh * 60 + sm);
                    if (durationMin < MIN_DURATION_MINUTES) return true;
                    const slotStart = taipeiDateTimeFromGridDay(selectedDate, sh, sm);
                    const slotEnd = taipeiDateTimeFromGridDay(selectedDate, eh, em);
                    return isSlotBusy(slotStart, slotEnd);
                  })()
                }
                onClick={() => {
                  if (!startTime || !endTime) return;
                  const [sh, sm] = startTime.split(":").map(Number);
                  const [eh, em] = endTime.split(":").map(Number);
                  const start = taipeiDateTimeFromGridDay(selectedDate, sh, sm);
                  const end = taipeiDateTimeFromGridDay(selectedDate, eh, em);
                  if (!isSlotBusy(start, end)) onSelectSlot(start, end);
                }}
                className="w-full rounded-lg bg-sky-600 px-4 py-2.5 font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                立即預約
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
