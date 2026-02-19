"use client";

import { useState, useEffect, useMemo } from "react";
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
  setHours,
  setMinutes,
  parseISO,
} from "date-fns";
import { zhTW } from "date-fns/locale";

const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
/** 最多可預約到今天起的 N 個月內 */
const MAX_BOOKING_MONTHS_AHEAD = 1;

type CalendarEvent = { start: string; end: string };

interface CalendarSectionProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
  onSelectSlot: (start: Date, durationMinutes: number) => void;
}

export function CalendarSection({
  selectedDate,
  onSelectDate,
  onSelectSlot,
}: CalendarSectionProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const from = format(monthStart, "yyyy-MM-dd");
    const to = format(addDays(monthEnd, 1), "yyyy-MM-dd");
    setLoading(true);
    setError(null);
    fetch(`/api/calendar/events?from=${from}&to=${to}`)
      .then((res) => {
        if (!res.ok) throw new Error("無法載入行事曆");
        return res.json();
      })
      .then((data: { events?: { start: string; end: string }[] }) => {
        setEvents(data.events || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [monthKey]); // 僅在切換月份時重新取得

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

  /** 檢查時段是否與任何已預約事件重疊 */
  const isSlotBusy = (slotStart: Date, slotEnd: Date) =>
    eventRanges.some(
      (range) =>
        slotStart < range.end && slotEnd > range.start
    );

  const timeSlots = useMemo(() => {
    const slots: Date[] = [];
    for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
      slots.push(setMinutes(setHours(new Date(), h), 0));
      slots.push(setMinutes(setHours(new Date(), h), 30));
    }
    return slots;
  }, []);

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

      {/* 月曆格子 */}
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
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={!selectable}
                  onClick={() => onSelectDate(selectable ? day : null)}
                  className={`min-h-[44px] border-b border-r border-slate-100 p-2 text-left text-sm transition
                    ${inMonth ? "text-slate-800" : "text-slate-300"}
                    ${!selectable ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50"}
                    ${selected ? "bg-sky-100 ring-2 ring-sky-500" : ""}
                    ${isToday(day) ? "font-semibold text-sky-600" : ""}`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* 已選日期：顯示時段（30 分鐘 / 1 小時） */}
      {selectedDate && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-800">
            {format(selectedDate, "yyyy年M月d日 (EEEE)", { locale: zhTW })} — 選擇時段
          </h3>
          {loading ? (
            <p className="text-slate-500">載入中…</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                可選 30 分鐘或 1 小時，點選後將進入「立即預約」。
              </p>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {timeSlots.map((baseTime) => {
                  const slotStart = new Date(selectedDate);
                  slotStart.setHours(baseTime.getHours(), baseTime.getMinutes(), 0, 0);
                  const slotEnd30 = new Date(slotStart.getTime() + 30 * 60 * 1000);
                  const slotEnd60 = new Date(slotStart.getTime() + 60 * 60 * 1000);
                  const busy30 = isSlotBusy(slotStart, slotEnd30);
                  const busy60 = isSlotBusy(slotStart, slotEnd60);
                  const past = slotStart <= new Date();
                  return (
                    <div key={slotStart.toISOString()} className="flex flex-col gap-1">
                      <span className="text-xs text-slate-500">
                        {format(slotStart, "HH:mm")}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={past || busy30}
                          onClick={() => onSelectSlot(slotStart, 30)}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                        >
                          30 分鐘
                        </button>
                        <button
                          type="button"
                          disabled={past || busy60}
                          onClick={() => onSelectSlot(slotStart, 60)}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                        >
                          1 小時
                        </button>
                      </div>
                      {(busy30 || busy60) && (
                        <span className="text-xs text-amber-600">該時段已有預約</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
