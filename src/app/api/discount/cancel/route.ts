import { NextRequest, NextResponse } from "next/server";
import {
  listUsageRecordsWithEventId,
  deleteUsageRecordRow,
  logCancelledUsage,
} from "@/lib/google-sheet";
import { deleteCalendarEvent } from "@/lib/google-calendar";
import type { StudioId } from "@/lib/studios";

export async function POST(request: NextRequest) {
  let body: { code?: string; eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "無效的請求內容" }, { status: 400 });
  }

  const code = body.code?.trim();
  const eventId = body.eventId?.trim();

  if (!code || !eventId) {
    return NextResponse.json(
      { error: "請提供 code 與 eventId" },
      { status: 400 }
    );
  }

  try {
    const records = await listUsageRecordsWithEventId();
    const normalized = code.toLowerCase();
    const todayStr = new Date().toISOString().slice(0, 10);

    const record = records.find(
      (r) =>
        r.code.toLowerCase() === normalized &&
        r.eventId === eventId &&
        r.dateStr >= todayStr
    );

    if (!record) {
      return NextResponse.json(
        { error: "找不到對應的未來預約紀錄，可能已取消或不屬於此折扣碼" },
        { status: 404 }
      );
    }

    // 刪除行事曆事件；若事件已不存在（例如先在行事曆刪除），視為成功，繼續移除使用記錄
    try {
      await deleteCalendarEvent(eventId, record.studio as StudioId);
    } catch (e) {
      console.warn("[discount/cancel] 刪除行事曆事件失敗，仍繼續刪除試算表紀錄", e);
    }

    await logCancelledUsage({
      code: record.code,
      dateStr: record.dateStr,
      hoursUsed: record.hoursUsed,
      summary: record.summary,
      studio: record.studio,
      eventId,
      source: "manual",
    });

    await deleteUsageRecordRow(record.rowIndex);

    return NextResponse.json({
      success: true,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("[discount/cancel] 取消預約失敗", e);
    return NextResponse.json(
      { error: "取消預約失敗，請稍後再試", detail: err },
      { status: 500 }
    );
  }
}

