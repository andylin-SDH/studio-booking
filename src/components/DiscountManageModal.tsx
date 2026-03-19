"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { STUDIOS, type StudioId } from "@/lib/studios";

type MonthlyRemaining = { yearMonth: string; label: string; used: number; remaining: number };

type FutureBooking = {
  date: string;
  hours: number;
  studio: StudioId;
  eventId: string;
  summary: string;
  timeSlot?: string;
};

type DiscountInfo =
  | {
      valid: true;
      kolName: string;
      hoursPerMonth: number;
      monthlyRemaining: MonthlyRemaining[];
      futureBookings: FutureBooking[];
    }
  | { valid: false; error?: string }
  | null;

interface DiscountManageModalProps {
  onClose: () => void;
}

export function DiscountManageModal({ onClose }: DiscountManageModalProps) {
  const [discountCode, setDiscountCode] = useState("");
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo>(null);
  const [validating, setValidating] = useState(false);
  const [selectedUsageMonth, setSelectedUsageMonth] = useState<string | null>(null);
  const [cancelingEventId, setCancelingEventId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    if (discountInfo && discountInfo.valid && discountInfo.monthlyRemaining.length > 0) {
      setSelectedUsageMonth(discountInfo.monthlyRemaining[0].yearMonth);
    } else {
      setSelectedUsageMonth(null);
    }
  }, [discountInfo]);

  const handleValidateDiscount = async () => {
    const code = discountCode.trim();
    if (!code) {
      setDiscountInfo(null);
      return;
    }
    setValidating(true);
    setDiscountInfo(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/discount/validate?code=${encodeURIComponent(code)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDiscountInfo({
          valid: false,
          error: data.detail || data.error || "無法驗證折扣碼",
        });
        return;
      }
      if (data.valid) {
        setDiscountInfo({
          valid: true,
          kolName: data.kolName,
          hoursPerMonth: data.hoursPerMonth,
          monthlyRemaining: data.monthlyRemaining ?? [],
          futureBookings: data.futureBookings ?? [],
        });
      } else {
        setDiscountInfo({
          valid: false,
          error: data.error || "折扣碼無效",
        });
      }
    } catch {
      setDiscountInfo({
        valid: false,
        error: "無法連線驗證，請確認試算表已與服務帳戶共用且已啟用 Google Sheets API",
      });
    } finally {
      setValidating(false);
    }
  };

  const handleCancelBooking = async (booking: FutureBooking) => {
    if (!discountCode.trim()) return;
    const ok = window.confirm(
      `確定要取消 ${
        booking.timeSlot ? `${booking.date}（${booking.timeSlot}）` : booking.date
      } 的預約（${booking.hours.toFixed(1)} 小時）嗎？將會同步從行事曆刪除並歸還時數。`
    );
    if (!ok) return;
    setCancelingEventId(booking.eventId);
    setMessage(null);
    try {
      const res = await fetch("/api/discount/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountCode.trim(),
          eventId: booking.eventId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "取消預約失敗，請稍後再試。",
        });
        return;
      }
      await handleValidateDiscount();
      setMessage({ type: "ok", text: "已取消該預約並歸還時數。" });
    } catch {
      setMessage({
        type: "error",
        text: "取消預約失敗，請稍後再試。",
      });
    } finally {
      setCancelingEventId(null);
    }
  };

  const selectedMonthBookings: FutureBooking[] =
    discountInfo && discountInfo.valid && discountInfo.futureBookings && selectedUsageMonth
      ? discountInfo.futureBookings.filter((b) => b.date.startsWith(selectedUsageMonth))
      : [];

  const selectedMonthMeta =
    discountInfo && discountInfo.valid && selectedUsageMonth
      ? discountInfo.monthlyRemaining.find((m) => m.yearMonth === selectedUsageMonth) || null
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-h-[90vh] max-w-md overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-800">
            老師查詢／取消預約
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            輸入折扣碼後，可查看各月份額度，並取消未來 90 天內的已預約時段。
          </p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              折扣碼 *
            </label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value);
                  setDiscountInfo(null);
                  setMessage(null);
                }}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="老師專屬折扣碼"
              />
              <button
                type="button"
                onClick={handleValidateDiscount}
                disabled={!discountCode.trim() || validating}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {validating ? "查詢中…" : "查詢時數與取消"}
              </button>
            </div>
          </div>

          {discountInfo?.valid && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 shadow-inner sm:text-sm">
              <p className="mb-2">
                親愛的『{discountInfo.kolName}』老師您好，以下為各月份額度與已預約時段：
              </p>
              <div className="mb-2 flex flex-wrap gap-1">
                {discountInfo.monthlyRemaining.map((m) => (
                  <button
                    key={m.yearMonth}
                    type="button"
                    onClick={() => setSelectedUsageMonth(m.yearMonth)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      selectedUsageMonth === m.yearMonth
                        ? "border-sky-600 bg-sky-600 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {selectedMonthMeta && (
                <p className="mb-2 text-[11px] text-slate-600 sm:text-xs">
                  {selectedMonthMeta.label}：剩餘{" "}
                  <span className="font-semibold text-emerald-600">
                    {selectedMonthMeta.remaining.toFixed(1)} 小時
                  </span>{" "}
                  · 已用 {selectedMonthMeta.used.toFixed(1)}h / 每月{" "}
                  {discountInfo.hoursPerMonth.toFixed(1)}h
                </p>
              )}
              <div className="space-y-1">
                {selectedMonthBookings.length === 0 ? (
                  <p className="text-slate-500">本月尚無已預約時段。</p>
                ) : (
                  selectedMonthBookings.map((b) => {
                    const d = new Date(`${b.date}T00:00:00`);
                    const dateLabel = format(d, "M/d (EEE)", { locale: zhTW });
                    const studioLabel = STUDIOS[b.studio];
                    return (
                      <div
                        key={b.eventId}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex-1">
                          <span>
                          {dateLabel} · {studioLabel}
                          {b.timeSlot ? ` · ${b.timeSlot}` : ""} ·{" "}
                          {b.hours.toFixed(1)} 小時
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCancelBooking(b)}
                          disabled={cancelingEventId === b.eventId}
                          className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {cancelingEventId === b.eventId ? "取消中…" : "取消"}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {discountInfo && !discountInfo.valid && (
            <p className="text-sm text-amber-600">{discountInfo.error}</p>
          )}
          {message && (
            <p
              className={`text-sm ${
                message.type === "ok" ? "text-green-600" : "text-red-600"
              }`}
            >
              {message.text}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

