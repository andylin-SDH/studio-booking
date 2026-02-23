"use client";

import { useState } from "react";
import { format } from "date-fns";
import { STUDIOS } from "@/lib/studios";
import { zhTW } from "date-fns/locale";

interface BookingModalProps {
  studio: "big" | "small";
  start: Date;
  end: Date;
  durationMinutes: number;
  onClose: () => void;
  onSuccess: () => void;
}

type DiscountInfo = {
  valid: true;
  kolName: string;
  hoursPerMonth: number;
  usedThisMonth: number;
  remainingHours: number;
} | { valid: false; error?: string } | null;

export function BookingModal({
  studio,
  start,
  end,
  durationMinutes,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountInfo, setDiscountInfo] = useState<DiscountInfo>(null);
  const [validating, setValidating] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const durationHours = durationMinutes / 60;

  const handleValidateDiscount = async () => {
    const code = discountCode.trim();
    if (!code) {
      setDiscountInfo(null);
      return;
    }
    setValidating(true);
    setDiscountInfo(null);
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
          usedThisMonth: data.usedThisMonth,
          remainingHours: data.remainingHours,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) {
      setMessage({ type: "error", text: "請填寫姓名與 Email" });
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(contact.trim())) {
      setMessage({ type: "error", text: "請輸入有效的 Email" });
      return;
    }
    if (discountCode.trim() && discountInfo && !discountInfo.valid) {
      setMessage({ type: "error", text: "請使用有效的折扣碼" });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/calendar/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: start.toISOString(),
          end: end.toISOString(),
          durationMinutes,
          name: name.trim(),
          contact: contact.trim(),
          note: note.trim(),
          discountCode: discountCode.trim() || undefined,
          studio,
        }),
      });
      const data = await res.json().catch(() => ({}));

      // 額度不足，需透過綠界 ECPay 付費
      if (data.needPayment && data.paidHours) {
        const payRes = await fetch("/api/ecpay/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: start.toISOString(),
            end: end.toISOString(),
            durationMinutes,
            name: name.trim(),
            contact: contact.trim(),
            note: note.trim(),
            discountCode: discountCode.trim() || undefined,
            studio,
            paidHours: data.paidHours,
          }),
        });
        const payData = await payRes.json().catch(() => ({}));
        if (payRes.ok && payData.formActionUrl && payData.formData) {
          const form = document.createElement("form");
          form.method = "POST";
          form.action = payData.formActionUrl;
          Object.entries(payData.formData).forEach(([k, v]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = k;
            input.value = String(v);
            form.appendChild(input);
          });
          document.body.appendChild(form);
          form.submit();
          return;
        }
        setMessage({
          type: "error",
          text: payData.error || "無法建立付款，請稍後再試。",
        });
        return;
      }

      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error || "預約失敗，請稍後再試或聯絡我們。",
        });
        return;
      }
      setMessage({ type: "ok", text: "預約已送出！我們會盡快與您確認。" });
      setTimeout(() => onSuccess(), 1500);
    } catch {
      setMessage({ type: "error", text: "網路錯誤，請稍後再試。" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-800">
            立即預約 · {STUDIOS[studio]}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {format(start, "yyyy/M/d (EEEE) HH:mm", { locale: zhTW })} —{" "}
            {format(end, "HH:mm")}（{durationMinutes} 分鐘）
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">姓名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="您的姓名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email *</label>
            <input
              type="email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="您的 Email（預約完成後將寄送通知信）"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">折扣碼（選填）</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value);
                  setDiscountInfo(null);
                }}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="KOL 專屬折扣碼"
              />
              <button
                type="button"
                onClick={handleValidateDiscount}
                disabled={!discountCode.trim() || validating}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {validating ? "查詢中…" : "查詢折扣碼剩餘時數"}
              </button>
            </div>
            {discountInfo?.valid && (
              <p className="mt-2 text-sm text-green-600">
                親愛的『{discountInfo.kolName}』老師您好，本月錄音室剩餘時數為{" "}
                {discountInfo.remainingHours.toFixed(1)} 小時
                {discountInfo.remainingHours < durationHours && (
                  <span className="block mt-1 text-amber-600">
                    超出部分將以綠界金流付費
                  </span>
                )}
              </p>
            )}
            {discountInfo && !discountInfo.valid && (
              <p className="mt-2 text-sm text-amber-600">{discountInfo.error}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">備註</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="設備需求、人數等"
            />
          </div>
          {message && (
            <p
              className={`text-sm ${
                message.type === "ok" ? "text-green-600" : "text-red-600"
              }`}
            >
              {message.text}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {submitting ? "送出中…" : "送出預約"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
