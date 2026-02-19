import { NextRequest, NextResponse } from "next/server";
import { createCalendarEvent } from "@/lib/google-calendar";

export async function POST(request: NextRequest) {
  let body: {
    start?: string;
    end?: string;
    durationMinutes?: number;
    name?: string;
    contact?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "無效的請求內容" }, { status: 400 });
  }
  const { start, end, name, contact, note } = body;
  if (!start || !end || !name || !contact) {
    return NextResponse.json(
      { error: "請提供 start、end、name、contact" },
      { status: 400 }
    );
  }
  try {
    await createCalendarEvent({
      start,
      end,
      summary: `[預約] ${name}`,
      description: `聯絡方式：${contact}${note ? `\n備註：${note}` : ""}`,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Calendar book error:", e);
    const message = e instanceof Error ? e.message : "預約失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
