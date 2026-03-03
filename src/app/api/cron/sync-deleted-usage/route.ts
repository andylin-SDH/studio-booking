import { NextRequest, NextResponse } from "next/server";
import {
  listUsageRecordsWithEventId,
  deleteUsageRecordRow,
  logCancelledUsage,
} from "@/lib/google-sheet";
import { calendarEventExists } from "@/lib/google-calendar";

/**
 * 排程：比對行事曆與試算表
 * 若有人工刪除行事曆事件，對應的使用記錄會移除，老師時數會還回
 *
 * 需在 Vercel 設定 CRON_SECRET，並於 vercel.json 設定排程
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const records = await listUsageRecordsWithEventId();
    const toDelete: { rowIndex: number; idx: number }[] = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const exists = await calendarEventExists(rec.eventId, rec.studio);
      if (!exists) {
        toDelete.push({ rowIndex: rec.rowIndex, idx: i });
      }
    }

    // 由下往上刪除，避免列索引偏移；同時記住原本的 record 內容
    toDelete.sort((a, b) => b.rowIndex - a.rowIndex);
    for (const item of toDelete) {
      const rec = records[item.idx];
      await logCancelledUsage({
        code: rec.code,
        dateStr: rec.dateStr,
        hoursUsed: rec.hoursUsed,
        summary: rec.summary,
        studio: rec.studio,
        eventId: rec.eventId,
        source: "cron",
      });
      await deleteUsageRecordRow(item.rowIndex);
    }

    return NextResponse.json({
      checked: records.length,
      deleted: toDelete.length,
    });
  } catch (e) {
    console.error("[Cron sync-deleted-usage] 錯誤", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
