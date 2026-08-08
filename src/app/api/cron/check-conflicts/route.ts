import { NextRequest, NextResponse } from "next/server";
import { getCalendarEventsDetailed } from "@/lib/google-calendar";
import { sendConflictAlert, type ConflictPair } from "@/lib/email";
import { STUDIOS, type StudioId } from "@/lib/studios";

/**
 * 排程：唯讀檢查兩間錄音室行事曆是否有時段重疊
 *
 * 目的：人工與系統各自加入行事曆時，可能造成同時段重複預約。
 * 本端點僅讀取行事曆（不修改行事曆、不動試算表），發現衝突時寄信提醒。
 *
 * 需在 Vercel 設定 CRON_SECRET 與 CONFLICT_ALERT_EMAIL，並於 vercel.json 設定排程。
 * 手動測試：呼叫時帶 ?always=1 可在無衝突時也回傳結果（但不會寄信）。
 */

/** 檢查未來幾天內的預約（含今天） */
const CHECK_WINDOW_DAYS = 90;

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const from = toDateStr(now);
    const toDate = new Date(now);
    toDate.setDate(toDate.getDate() + CHECK_WINDOW_DAYS);
    const to = toDateStr(toDate);

    const studios: StudioId[] = ["big", "small"];
    const conflicts: ConflictPair[] = [];

    for (const studio of studios) {
      const events = await getCalendarEventsDetailed(from, to, studio);
      // 忽略全天事件（多為公告/封館標記，非具體時段預約）
      const timed = events
        .filter((e) => !e.isAllDay)
        .map((e) => ({
          ...e,
          startMs: new Date(e.start).getTime(),
          endMs: new Date(e.end).getTime(),
        }))
        .sort((a, b) => a.startMs - b.startMs);

      for (let i = 0; i < timed.length; i++) {
        for (let j = i + 1; j < timed.length; j++) {
          // 已排序：一旦後者的開始 >= 前者的結束，之後都不可能重疊
          if (timed[j].startMs >= timed[i].endMs) break;
          // 重疊條件：A.start < B.end 且 A.end > B.start
          if (timed[i].startMs < timed[j].endMs && timed[i].endMs > timed[j].startMs) {
            conflicts.push({
              studioLabel: STUDIOS[studio],
              aSummary: timed[i].summary,
              aStart: timed[i].start,
              aEnd: timed[i].end,
              bSummary: timed[j].summary,
              bStart: timed[j].start,
              bEnd: timed[j].end,
            });
          }
        }
      }
    }

    let emailed = false;
    if (conflicts.length > 0) {
      emailed = await sendConflictAlert(conflicts);
    }

    return NextResponse.json({
      range: { from, to },
      conflicts: conflicts.length,
      emailed,
      details:
        request.nextUrl.searchParams.get("always") === "1"
          ? conflicts
          : undefined,
    });
  } catch (e) {
    console.error("[Cron check-conflicts] 錯誤", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
