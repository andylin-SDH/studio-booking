"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
  setHours,
  setMinutes,
} from "date-fns";
import { zhTW } from "date-fns/locale";

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
/** 最少起租時長（分鐘） */
const MIN_DURATION_MINUTES = 60;
/** 最多可預約到今天起的 N 個月內 */
const MAX_BOOKING_MONTHS_AHEAD = 1;

type CalendarEvent = { start: string; end: string };

interface CalendarSectionProps {
  studio: "big" | "small";
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
  onSelectSlot: (start: Date, end: Date) => void;
}

export function CalendarSection({
  studio,
  selectedDate,
  onSelectDate,
  onSelectSlot,
}: CalendarSectionProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 預約成功後重新載入行事曆，避免同一時段重複預約
  useEffect(() => {
    const onBookingSuccess = () => setRefreshTrigger((n) => n + 1);
    window.addEventListener("booking-success", onBookingSuccess);
    return () => window.removeEventListener("booking-success", onBookingSuccess);
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
  useEffect(() => {
    let cancelled = false;
    const from = format(monthStart, "yyyy-MM-dd");
    const to = format(addDays(monthEnd, 1), "yyyy-MM-dd");
    setLoading(true);
    setError(null);
    fetch(`/api/calendar/events?from=${from}&to=${to}&studio=${studio}`, {
      cache: "no-store",
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
        if (!cancelled) setEvents(data.events || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey, studio, refreshTrigger]); // 切換月份、錄音室或預約成功後重新取得

  const maxDate = useMemo(
    () => addMonths(new Date(), MAX_BOOKING_MONTHS_AHEAD),
    []
  );
  const minMonth = startOfMonth(new Date());
  const maxMonth = startOfMonth(maxDate);
  const canGoPrev = currentMonth > minMonth;
  const canGoNext = currentMonth < maxMonth;

  const eventRanges = useMemo(
    () =>
      events.map((e) => ({
        start: parseISO(e.start),
        end: parseISO(e.end),
      })),
    [events]
  );

  /** 當日可預約總分鐘數（9:00–21:00） */
  const totalMinutesPerDay = (DAY_END_HOUR - DAY_START_HOUR) * 60;

  /** 計算某天在營業時段內已被預約的分鐘數 */
  const getBookedMinutesOnDay = useCallback(
    (day: Date) => {
      const dayStart = setMinutes(setHours(startOfDay(day), DAY_START_HOUR), 0);
      const dayEnd = setMinutes(setHours(startOfDay(day), DAY_END_HOUR), 0);
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

  /** 檢查時段是否與任何已預約事件重疊 */
  const isSlotBusy = (slotStart: Date, slotEnd: Date) =>
    eventRanges.some(
      (range) =>
        slotStart < range.end && slotEnd > range.start
    );

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

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        <p className="font-medium">無法載入行事曆</p>
        <p className="mt-1 text-sm">{error}</p>
        <p className="mt-2 text-sm">
          請確認已設定 Google 行事曆 API（見 README），或先選擇日期與時段進行預約。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 月曆導覽 */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ← 上個月
        </button>
        <span className="text-lg font-semibold text-slate-800">
          {format(currentMonth, "yyyy 年 M 月", { locale: zhTW })}
        </span>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          下個月 →
        </button>
      </div>
      <p className="text-sm text-slate-500">
        僅可預約今日起 {MAX_BOOKING_MONTHS_AHEAD} 個月內
      </p>

      {/* 月曆格子 + 圖例 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-sm font-medium text-slate-600">
          {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day) => {
              const inMonth = isSameMonth(day, currentMonth);
              const selected = selectedDate && isSameDay(day, selectedDate);
              const isPast = isBefore(startOfDay(day), startOfDay(new Date()));
              const beyondMax = startOfDay(day) > maxDate;
              const selectable = inMonth && !isPast && !beyondMax;
              const bookedMins = inMonth ? (dailyUsage.get(format(day, "yyyy-MM-dd")) ?? 0) : 0;
              const ratio = totalMinutesPerDay > 0 ? bookedMins / totalMinutesPerDay : 0;
              const usageLevel: "empty" | "low" | "medium" | "full" =
                ratio <= 0 ? "empty" : ratio < 1 / 3 ? "low" : ratio < 2 / 3 ? "medium" : "full";
              const bookedHoursLabel =
                bookedMins > 0
                  ? `已約${bookedMins < 60 ? `${bookedMins}分` : `${(bookedMins / 60).toFixed(1)}h`}`
                  : null;
              const usageBg =
                usageLevel === "empty"
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
                  onClick={() => handleDateChange(selectable ? day : null)}
                  className={`min-h-[52px] border-b border-r border-slate-100 p-2 text-left text-sm transition
                    ${inMonth ? "text-slate-800" : "text-slate-300"}
                    ${!selectable ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50"}
                    ${selected ? "bg-sky-100 ring-2 ring-sky-500" : inMonth ? usageBg : ""}
                    ${isToday(day) ? "font-semibold text-sky-600" : ""}`}
                >
                  <span className="block">{format(day, "d")}</span>
                  {bookedHoursLabel && inMonth && (
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
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
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
        </div>
      </div>

      {/* 已選日期：開始 / 結束時間下拉選單 */}
      {selectedDate && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-800">
            {format(selectedDate, "yyyy年M月d日 (EEEE)", { locale: zhTW })} — 選擇時段
          </h3>
          {loading ? (
            <p className="text-slate-500">載入中…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">開始</label>
                  <select
                    value={startTime}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">開始時間</option>
                    {timeOptions.map((t) => {
                      const [h, m] = t.split(":").map(Number);
                      const slotStart = new Date(selectedDate);
                      slotStart.setHours(h, m, 0, 0);
                      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
                      const past = slotStart <= new Date();
                      const busy = isSlotBusy(slotStart, slotEnd);
                      const disabled = past || busy;
                      const label = past ? (busy ? "（已過／已預約）" : "（已過）") : (busy ? "（已預約）" : "");
                      return (
                        <option key={t} value={t} disabled={disabled}>
                          {t} {label}
                        </option>
                      );
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
                        const durationMin =
                          (h * 60 + m) - (sh * 60 + sm);
                        return durationMin >= MIN_DURATION_MINUTES;
                      })
                      .map((t) => {
                        const [h, m] = t.split(":").map(Number);
                        const [sh, sm] = startTime.split(":").map(Number);
                        const slotStart = new Date(selectedDate);
                        slotStart.setHours(sh, sm, 0, 0);
                        const slotEnd = new Date(selectedDate);
                        slotEnd.setHours(h, m, 0, 0);
                        const past = slotEnd <= new Date();
                        const busy = isSlotBusy(slotStart, slotEnd);
                        const disabled = past || busy;
                        const label = past ? (busy ? "（已過／與已預約重疊）" : "（已過）") : (busy ? "（與已預約重疊）" : "");
                        return (
                          <option key={t} value={t} disabled={disabled}>
                            {t} {label}
                          </option>
                        );
                      })}
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                最少起租 1 小時
              </p>
              <button
                type="button"
                disabled={!startTime || !endTime || (() => {
                  if (!startTime || !endTime) return true;
                  const [sh, sm] = startTime.split(":").map(Number);
                  const [eh, em] = endTime.split(":").map(Number);
                  const durationMin = (eh * 60 + em) - (sh * 60 + sm);
                  if (durationMin < MIN_DURATION_MINUTES) return true;
                  const slotStart = new Date(selectedDate);
                  slotStart.setHours(sh, sm, 0, 0);
                  const slotEnd = new Date(selectedDate);
                  slotEnd.setHours(eh, em, 0, 0);
                  return isSlotBusy(slotStart, slotEnd);
                })()}
                onClick={() => {
                  if (!startTime || !endTime) return;
                  const [sh, sm] = startTime.split(":").map(Number);
                  const [eh, em] = endTime.split(":").map(Number);
                  const start = new Date(selectedDate);
                  start.setHours(sh, sm, 0, 0);
                  const end = new Date(selectedDate);
                  end.setHours(eh, em, 0, 0);
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
