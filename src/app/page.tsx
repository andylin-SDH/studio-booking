"use client";

import { useState, useCallback } from "react";
import { CalendarSection } from "@/components/CalendarSection";
import { BookingModal } from "@/components/BookingModal";
import { STUDIOS, type StudioId } from "@/lib/studios";

const SPACE_IMAGES = [
  "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=80",
  "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&q=80",
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80",
];

export default function Home() {
  const [studio, setStudio] = useState<StudioId>("big");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date; durationMinutes: number } | null>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const handleSelectSlot = useCallback((start: Date, end: Date) => {
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    setSelectedSlot({ start, end, durationMinutes });
    setShowBookingModal(true);
  }, []);

  const handleCloseBooking = useCallback(() => {
    setShowBookingModal(false);
    setSelectedSlot(null);
  }, []);

  const handleBookingSuccess = useCallback(() => {
    setShowBookingModal(false);
    setSelectedSlot(null);
    setSelectedDate(null);
    window.dispatchEvent(new CustomEvent("booking-success"));
  }, []);

  const handleStudioChange = useCallback((id: StudioId) => {
    setStudio(id);
    setSelectedDate(null);
    setSelectedSlot(null);
  }, []);

  return (
    <div className="min-h-screen bg-[#0c0f14]">
      {/* 導覽 */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0c0f14]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <a href="#" className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="SDI 盛德好"
              className="h-8 w-auto object-contain"
            />
            <span className="text-lg font-bold tracking-tight text-white">
              <span className="gradient-text">錄音室 · 預約</span>
            </span>
          </a>
          <nav className="flex gap-8 text-sm">
            <a href="#space" className="text-slate-400 transition hover:text-amber-400">空間介紹</a>
            <a href="#venue" className="text-slate-400 transition hover:text-amber-400">場地介紹</a>
            <a href="#rules" className="text-slate-400 transition hover:text-amber-400">使用需知</a>
            <a href="#calendar" className="text-slate-400 transition hover:text-amber-400">預約時段</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        {/* 1. 空間介紹 */}
        <section id="space" className="mb-24">
          <h2 className="mb-8 text-3xl font-bold tracking-tight text-white">
            空間介紹
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {SPACE_IMAGES.map((src, i) => (
              <div
                key={i}
                className="group aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-slate-800/50 ring-1 ring-white/5 transition duration-300 hover:border-amber-500/30 hover:ring-amber-500/20"
              >
                <img
                  src={src}
                  alt={`空間圖 ${i + 1}`}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
              </div>
            ))}
          </div>
        </section>

        {/* 2. 場地介紹（大間 / 小間） */}
        <section id="venue" className="mb-24">
          <h2 className="mb-8 text-3xl font-bold tracking-tight text-white">
            場地介紹
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* 大間 */}
            <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-950/30 to-slate-900/50 p-6 shadow-xl ring-1 ring-amber-500/10">
              <div className="mb-4 inline-block rounded-full bg-amber-500/20 px-3 py-1 text-sm font-semibold text-amber-400">
                大間
              </div>
              <p className="mb-3 text-slate-300 leading-relaxed">
                空間大小約 <strong className="text-white">18 坪</strong>，適合最多 <strong className="text-white">4 人</strong>錄音使用。
              </p>
              <p className="mb-3 text-slate-300 leading-relaxed">
                額外兼具約 <strong className="text-amber-400">20–30 人</strong> Live Podcast 聽眾空間。
              </p>
              <p className="text-slate-300 leading-relaxed">
                兩盞 120W LED 燈光與收音環境，適合 Podcast、訪談。可依需求調整。
              </p>
            </div>
            {/* 小間 */}
            <div className="rounded-2xl border border-white/10 bg-slate-800/30 p-6 shadow-xl ring-1 ring-white/5">
              <div className="mb-4 inline-block rounded-full bg-slate-600/50 px-3 py-1 text-sm font-semibold text-slate-300">
                小間
              </div>
              <p className="mb-3 text-slate-300 leading-relaxed">
                空間大小約 <strong className="text-white">6 坪</strong>，適合最多 <strong className="text-white">4 人</strong>錄音使用。
              </p>
              <p className="text-slate-300 leading-relaxed">
                兩盞 120W LED 燈光與收音環境，適合 Podcast、訪談。可依需求調整。
              </p>
            </div>
          </div>
        </section>

        {/* 3. 場地使用需知 */}
        <section id="rules" className="mb-24">
          <h2 className="mb-8 text-3xl font-bold tracking-tight text-white">
            場地使用需知
          </h2>
          <div className="rounded-2xl border border-white/10 bg-slate-800/20 p-8 shadow-xl ring-1 ring-white/5">
            <div className="space-y-8">
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-amber-400">
                  <span className="h-1 w-1 rounded-full bg-amber-400" />
                  預約、入場與離場
                </h3>
                <ul className="list-inside list-disc space-y-2 text-slate-400">
                  <li>預約開始前五分鐘開放進場。</li>
                  <li>請務必準時收完設備並離開，並確認錄音室門與大門都已關閉。</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-amber-400">
                  <span className="h-1 w-1 rounded-full bg-amber-400" />
                  空間使用規範
                </h3>
                <ul className="list-inside list-disc space-y-2 text-slate-400">
                  <li>錄音室內全面禁止飲食、吸煙。</li>
                  <li>若有移動桌椅、燈光等等，請於結束前歸位。</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-amber-400">
                  <span className="h-1 w-1 rounded-full bg-amber-400" />
                  錄音當天提醒
                </h3>
                <ul className="list-inside list-disc space-y-2 text-slate-400">
                  <li>進出時請保持安靜，以免影響他人錄音。</li>
                  <li>請自行攜帶 MicroSD 卡以存取錄音資料。</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 4. 行事曆 + 預約 */}
        <section id="calendar" className="mb-24">
          <h2 className="mb-2 text-3xl font-bold tracking-tight text-white">
            空間使用狀況 · 選擇預約時段
          </h2>
          <div className="mb-6 flex flex-wrap gap-3">
            {(Object.keys(STUDIOS) as StudioId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => handleStudioChange(id)}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  studio === id
                    ? "bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/25"
                    : "border border-white/20 bg-white/5 text-slate-400 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
                }`}
              >
                {STUDIOS[id]}
              </button>
            ))}
          </div>
          <p className="mb-6 text-slate-500">
            請先選擇錄音室，再選擇日期與時段，並點選「立即預約」。
          </p>
          <div className="rounded-2xl border border-white/10 bg-slate-800/20 p-6 ring-1 ring-white/5">
            <CalendarSection
              studio={studio}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onSelectSlot={handleSelectSlot}
            />
          </div>
        </section>
      </main>

      {showBookingModal && selectedSlot && (
        <BookingModal
          studio={studio}
          start={selectedSlot.start}
          end={selectedSlot.end}
          durationMinutes={selectedSlot.durationMinutes}
          onClose={handleCloseBooking}
          onSuccess={handleBookingSuccess}
        />
      )}

      <footer className="border-t border-white/10 bg-[#0c0f14] py-8">
        <div className="mx-auto max-w-5xl px-4 text-center text-sm text-slate-500">
          盛德好錄音室預約系統 · 時段以 Google 行事曆為準
        </div>
      </footer>
    </div>
  );
}
