"use client";

import { useState, useCallback } from "react";
import { CalendarSection } from "@/components/CalendarSection";
import { BookingModal } from "@/components/BookingModal";
import { addMinutes } from "date-fns";

// 空間介紹圖片（使用 placeholder，您可替換為實際圖片 URL）
const SPACE_IMAGES = [
  "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=80",
  "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80",
];

export default function Home() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date; durationMinutes: number } | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const handleSelectSlot = useCallback(
    (start: Date, durationMinutes: number) => {
      const end = addMinutes(start, durationMinutes);
      setSelectedSlot({ start, end, durationMinutes });
      setShowBookingModal(true);
    },
    []
  );

  const handleCloseBooking = useCallback(() => {
    setShowBookingModal(false);
    setSelectedSlot(null);
  }, []);

  const handleBookingSuccess = useCallback(() => {
    setShowBookingModal(false);
    setSelectedSlot(null);
    setSelectedDate(null);
    // 可在此觸發重新取得行事曆
    window.dispatchEvent(new CustomEvent("booking-success"));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 導覽 */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="text-lg font-semibold text-slate-800">聊心室 · 錄音室預約</span>
          <nav className="flex gap-6 text-sm text-slate-600">
            <a href="#space" className="hover:text-sky-600">空間介紹</a>
            <a href="#venue" className="hover:text-sky-600">場地介紹</a>
            <a href="#rules" className="hover:text-sky-600">使用需知</a>
            <a href="#calendar" className="hover:text-sky-600">預約時段</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        {/* 1. 空間介紹（圖片） */}
        <section id="space" className="mb-20">
          <h2 className="mb-6 text-2xl font-bold text-slate-800">空間介紹</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {SPACE_IMAGES.map((src, i) => (
              <div
                key={i}
                className="aspect-[4/3] overflow-hidden rounded-xl bg-slate-200 shadow-md"
              >
                <img
                  src={src}
                  alt={`空間圖 ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </section>

        {/* 2. 場地介紹（文字） */}
        <section id="venue" className="mb-20">
          <h2 className="mb-6 text-2xl font-bold text-slate-800">場地介紹</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="mb-4 text-slate-700 leading-relaxed">
              <strong>空間大小：</strong>約 6 坪，適合最多 2 人錄音使用。
            </p>
            <p className="mb-4 text-slate-700 leading-relaxed">
              專業燈光與收音環境，適合 Podcast、訪談、配音錄製。現場提供基本錄音設備與燈光，可依需求調整。
            </p>
            <p className="text-slate-700 leading-relaxed">
              全台最適合拍攝 Video Podcast 的錄音室之一，從視覺、聽覺重新定義錄音體驗。
            </p>
          </div>
        </section>

        {/* 3. 場地使用需知（文字） */}
        <section id="rules" className="mb-20">
          <h2 className="mb-6 text-2xl font-bold text-slate-800">場地使用需知</h2>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-3 font-semibold text-slate-800">預約、入場與離場</h3>
            <ul className="mb-6 list-inside list-disc space-y-2 text-slate-700">
              <li>預約開始前五分鐘開放進場。</li>
              <li>請加入 LINE 官方帳號，索取大門及錄音室密碼。</li>
              <li>索取密碼時請準備訂單編號及訂購日期，以加快核對。</li>
              <li>攝影燈光將於預約時間開啟，並於結束時準時關閉。</li>
              <li>請務必準時收完設備並離開，並確認錄音室門與大門都已關閉。</li>
            </ul>
            <h3 className="mb-3 font-semibold text-slate-800">空間使用規範</h3>
            <ul className="mb-6 list-inside list-disc space-y-2 text-slate-700">
              <li>錄音室內全面禁止飲食、吸煙。</li>
              <li>請勿任意移動錄音室內的燈光設備；若移動桌椅，請於結束前歸位。</li>
            </ul>
            <h3 className="mb-3 font-semibold text-slate-800">錄音當天提醒</h3>
            <ul className="list-inside list-disc space-y-2 text-slate-700">
              <li>走廊為公共空間，請勿擺放私人物品以防遺失。</li>
              <li>進出時請保持安靜，以免影響他人錄音。</li>
              <li>請自行攜帶記憶卡以存取錄音資料。</li>
              <li>現場無常駐工作人員，需要協助請洽 LINE 官方帳號。</li>
            </ul>
          </div>
        </section>

        {/* 4 & 5 & 6. 行事曆 + 時段選擇 + 立即預約 */}
        <section id="calendar" className="mb-20">
          <h2 className="mb-6 text-2xl font-bold text-slate-800">空間使用狀況 · 選擇預約時段</h2>
          <p className="mb-6 text-slate-600">
            請先選擇日期，再選擇 1 小時或 30 分鐘的時段，並點選「立即預約」。
          </p>
          <CalendarSection
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onSelectSlot={handleSelectSlot}
          />
        </section>
      </main>

      {/* 立即預約彈窗 */}
      {showBookingModal && selectedSlot && (
        <BookingModal
          start={selectedSlot.start}
          end={selectedSlot.end}
          durationMinutes={selectedSlot.durationMinutes}
          onClose={handleCloseBooking}
          onSuccess={handleBookingSuccess}
        />
      )}

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-slate-500">
          錄音室預約系統 · 時段以 Google 行事曆為準
        </div>
      </footer>
    </div>
  );
}
