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

import type { StudioId } from "./studios";

function getCalendarId(studio: StudioId): string {
  const id =
    studio === "big"
      ? process.env.GOOGLE_CALENDAR_BIG
      : process.env.GOOGLE_CALENDAR_SMALL;
  return id || process.env.GOOGLE_CALENDAR_ID || "primary";
}

function loadCredentialsFromEnv(
  jsonEnv: string | undefined,
  pathEnv: string | undefined,
  fallbackPath: string | undefined
): object | null {
  if (jsonEnv) {
    try {
      return JSON.parse(jsonEnv) as object;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 格式錯誤");
    }
  }
  const credPath =
    pathEnv || fallbackPath || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath) return null;
  const fs = require("fs");
  const pathModule = require("path");
  const resolvedPath = pathModule.isAbsolute(credPath)
    ? credPath
    : pathModule.resolve(process.cwd(), credPath);
  if (fs.existsSync(resolvedPath)) {
    return JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as object;
  }
  return null;
}

function getCalendarClient(studio: StudioId) {
  const calendarId = getCalendarId(studio);
  const credentials =
    studio === "big"
      ? loadCredentialsFromEnv(
          process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BIG,
          process.env.GOOGLE_APPLICATION_CREDENTIALS_BIG,
          process.env.GOOGLE_APPLICATION_CREDENTIALS
        )
      : loadCredentialsFromEnv(
          process.env.GOOGLE_SERVICE_ACCOUNT_JSON_SMALL,
          process.env.GOOGLE_APPLICATION_CREDENTIALS_SMALL,
          process.env.GOOGLE_APPLICATION_CREDENTIALS
        );

  if (!credentials) {
    throw new Error(
      `未設定 Google 行事曆憑證（${studio === "big" ? "大間" : "小間"}）。請設定 GOOGLE_APPLICATION_CREDENTIALS_BIG / GOOGLE_APPLICATION_CREDENTIALS_SMALL 或共用 GOOGLE_APPLICATION_CREDENTIALS，見 README。`
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
  to: string,
  studio: StudioId = "big"
): Promise<{ start: string; end: string }[]> {
  const { calendar, calendarId } = getCalendarClient(studio);
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
 * 回傳建立的事件 ID，供試算表使用記錄同步刪除時比對
 */
export async function createCalendarEvent(
  input: CalendarEventInput,
  studio: StudioId = "big"
): Promise<string> {
  const { calendar, calendarId } = getCalendarClient(studio);
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start, timeZone: "Asia/Taipei" },
      end: { dateTime: input.end, timeZone: "Asia/Taipei" },
    },
  });
  const eventId = (res.data && "id" in res.data ? res.data.id : null) ?? "";
  if (!eventId) {
    console.warn("[createCalendarEvent] API 未回傳 event id", { data: res.data });
  }
  return String(eventId);
}

/**
 * 檢查行事曆事件是否仍存在（未被刪除）
 */
export async function calendarEventExists(
  eventId: string,
  studio: StudioId
): Promise<boolean> {
  try {
    const { calendar, calendarId } = getCalendarClient(studio);
    const ev = await calendar.events.get({
      calendarId,
      eventId,
    });
    return (ev.data.status ?? "") !== "cancelled";
  } catch {
    return false; // 404 或已刪除
  }
}
