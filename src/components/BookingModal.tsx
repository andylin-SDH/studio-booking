"use client";

import { useState } from "react";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

interface BookingModalProps {
  start: Date;
  end: Date;
  durationMinutes: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function BookingModal({
  start,
  end,
  durationMinutes,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !contact.trim()) {
      setMessage({ type: "error", text: "請填寫姓名與聯絡方式" });
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
        }),
      });
      const data = await res.json().catch(() => ({}));
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
          <h3 className="text-lg font-semibold text-slate-800">立即預約</h3>
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
            <label className="block text-sm font-medium text-slate-700">聯絡方式 *</label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              placeholder="電話或 Email"
            />
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
