import { NextRequest, NextResponse } from "next/server";
import { getCalendarEvents } from "@/lib/google-calendar";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json(
      { error: "請提供 from 與 to 參數 (yyyy-MM-dd)" },
      { status: 400 }
    );
  }
  try {
    const events = await getCalendarEvents(from, to);
    return NextResponse.json({ events });
  } catch (e) {
    console.error("Calendar events error:", e);
    const message = e instanceof Error ? e.message : "無法取得行事曆";
    return NextResponse.json({ error: message, events: [] }, { status: 500 });
  }
}
