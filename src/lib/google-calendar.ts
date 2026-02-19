/**
 * Google 行事曆 API 整合
 * 需設定環境變數：
 * - GOOGLE_CALENDAR_ID: 您的 Google 行事曆 ID（例如 primary 或 xxx@group.calendar.google.com）
 * - GOOGLE_SERVICE_ACCOUNT_JSON: Service Account 的 JSON 字串（建議用單行）
 *   或 GOOGLE_APPLICATION_CREDENTIALS: 指向 credentials 檔案路徑
 *
 * 取得方式：Google Cloud Console → 建立服務帳戶 → 金鑰 → JSON
 * 並將該行事曆「與服務帳戶的 email 共用」編輯權限。
 */

import { google } from "googleapis";

function getCalendarClient() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  let credentials: object | null = null;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) as object;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 格式錯誤");
    }
  }

  if (!credentials && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const fs = require("fs");
    const pathModule = require("path");
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const resolvedPath = pathModule.isAbsolute(credPath)
      ? credPath
      : pathModule.resolve(process.cwd(), credPath);
    if (fs.existsSync(resolvedPath)) {
      credentials = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as object;
    }
  }

  if (!credentials) {
    throw new Error(
      "未設定 Google 行事曆憑證。請設定 GOOGLE_SERVICE_ACCOUNT_JSON 或 GOOGLE_APPLICATION_CREDENTIALS，見 README。"
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: credentials as any,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  const calendar = google.calendar({ version: "v3", auth });
  return { calendar, calendarId };
}

export interface CalendarEventInput {
  start: string; // ISO 8601
  end: string;
  summary: string;
  description?: string;
}

/**
 * 取得指定日期範圍內的行事曆事件（用於顯示已預約時段）
 * 全天事件 (date) 會轉成 Asia/Taipei 的明確時間，避免時區解析錯誤
 */
export async function getCalendarEvents(
  from: string,
  to: string
): Promise<{ start: string; end: string }[]> {
  const { calendar, calendarId } = getCalendarClient();
  const timeMin = new Date(from + "T00:00:00+08:00").toISOString();
  const timeMax = new Date(to + "T23:59:59.999+08:00").toISOString();

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events: { start: string; end: string }[] = [];
  for (const ev of res.data.items || []) {
    const start = ev.start?.dateTime ?? ev.start?.date;
    const end = ev.end?.dateTime ?? ev.end?.date;
    if (!start || !end) continue;

    // 全天事件：date 格式為 "2026-03-10"，需轉成明確的 Asia/Taipei 時間
    const startStr = ev.start?.date
      ? `${start}T00:00:00+08:00`
      : start;
    const endStr = ev.end?.date
      ? `${end}T00:00:00+08:00`  // Google 全天事件的 end 為 exclusive，即次日 00:00
      : end;

    events.push({ start: startStr, end: endStr });
  }
  return events;
}

/**
 * 建立一筆預約事件到 Google 行事曆
 */
export async function createCalendarEvent(input: CalendarEventInput): Promise<void> {
  const { calendar, calendarId } = getCalendarClient();
  await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start, timeZone: "Asia/Taipei" },
      end: { dateTime: input.end, timeZone: "Asia/Taipei" },
    },
  });
}
