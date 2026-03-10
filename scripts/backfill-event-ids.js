// 一次性工具：為「使用記錄」試算表中舊資料補上 eventId
// 使用方式：
// 1. 確認已設定 GOOGLE_SHEET_ID、GOOGLE_SERVICE_ACCOUNT_JSON_*、GOOGLE_CALENDAR_BIG/SMALL
// 2. 在專案根目錄執行：node scripts/backfill-event-ids.js

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

// 先嘗試載入 .env.local，讓腳本可以沿用 Next.js 的環境變數
(() => {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.warn("[backfill-event-ids] 載入 .env.local 失敗（可忽略）：", e.message);
  }
})();

// ---- 共用認證（沿用 google-sheet.ts 的邏輯） ----
function getAuth() {
  let credentials = null;
  const jsonEnv =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_SHEETS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BIG;
  if (jsonEnv) {
    try {
      credentials = JSON.parse(jsonEnv);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_SHEETS / GOOGLE_SERVICE_ACCOUNT_JSON 格式錯誤");
    }
  }
  if (!credentials) {
    const credPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SHEETS ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS_BIG ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath) {
      const fs = require("fs");
      const pathModule = require("path");
      const resolvedPath = pathModule.isAbsolute(credPath)
        ? credPath
        : pathModule.resolve(process.cwd(), credPath);
      if (fs.existsSync(resolvedPath)) {
        credentials = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
      }
    }
  }
  if (!credentials) {
    throw new Error("未設定 Google 憑證（試算表 / 行事曆）");
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/calendar",
    ],
  });
}

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("未設定 GOOGLE_SHEET_ID");
  return id;
}

function getCalendarId(studio) {
  const id =
    studio === "big"
      ? process.env.GOOGLE_CALENDAR_BIG
      : process.env.GOOGLE_CALENDAR_SMALL;
  return id || process.env.GOOGLE_CALENDAR_ID || "primary";
}

async function getUsageSheetTitle(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const tabs = (res.data.sheets || []).map((s) => s.properties?.title || "");
  // 依專案約定：第 2 個工作表為「使用記錄」
  return tabs[1] || process.env.GOOGLE_SHEET_USAGE_SHEET || "使用記錄";
}

async function listUsageRowsWithoutEventId(sheets, spreadsheetId, usageTitle) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${usageTitle}!A2:G`,
  });
  const rows = (res.data.values || []);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const eventId = (row[6] || "").trim();
    if (!eventId) {
      out.push({ rowIndex: i + 2, row });
    }
  }
  return out;
}

function pickStudioId(label) {
  const t = (label || "").trim();
  if (t === "小間") return "small";
  return "big";
}

function parseHours(str) {
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : 0;
}

async function findEventIdForRow(calendar, studioId, code, dateStr, hours) {
  const calendarId = getCalendarId(studioId);
  const timeMin = new Date(`${dateStr}T00:00:00+08:00`).toISOString();
  const timeMax = new Date(`${dateStr}T23:59:59.999+08:00`).toISOString();

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });
  const items = res.data.items || [];
  const targetCode = (code || "").trim().toLowerCase();

  const candidates = [];
  for (const ev of items) {
    const summary = (ev.summary || "").toString();
    const desc = (ev.description || "").toString();
    // 只考慮系統建立的預約事件
    if (!summary.startsWith("[錄音室預約")) {
      continue;
    }
    if (targetCode && !desc.toLowerCase().includes(targetCode)) {
      continue;
    }
    const startStr = ev.start?.dateTime || ev.start?.date;
    const endStr = ev.end?.dateTime || ev.end?.date;
    if (!startStr || !endStr) continue;
    const start = new Date(startStr);
    const end = new Date(endStr);
    const durHours = (end.getTime() - start.getTime()) / 3600000;
    if (Math.abs(durHours - hours) > 1e-3) continue;
    candidates.push(ev);
  }

  if (candidates.length === 1 && candidates[0].id) {
    return candidates[0].id;
  }
  return null;
}

async function main() {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const calendar = google.calendar({ version: "v3", auth });
  const spreadsheetId = getSheetId();

  const usageTitle = await getUsageSheetTitle(sheets, spreadsheetId);
  console.log("使用記錄工作表：", usageTitle);

  const rows = await listUsageRowsWithoutEventId(
    sheets,
    spreadsheetId,
    usageTitle
  );
  console.log("待補 eventId 筆數：", rows.length);
  if (rows.length === 0) return;

  let filled = 0;
  for (const { rowIndex, row } of rows) {
    const [code, dateStr, hoursStr, summary, studioLabel] = row;
    if (!code || !dateStr || !hoursStr) continue;
    const studioId = pickStudioId(studioLabel);
    const hours = parseHours(hoursStr);
    try {
      const eventId = await findEventIdForRow(
        calendar,
        studioId,
        code,
        dateStr,
        hours
      );
      if (!eventId) {
        console.warn(
          `[skip] 找不到對應事件：row ${rowIndex} ${dateStr} ${code} ${hours}h`
        );
        continue;
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${usageTitle}!G${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [[eventId]] },
      });
      filled++;
      console.log(
        `[ok] row ${rowIndex} ${dateStr} ${code} -> eventId=${eventId}`
      );
    } catch (e) {
      console.error(
        `[error] row ${rowIndex} ${dateStr} ${code}:`,
        e && e.message ? e.message : e
      );
    }
  }

  console.log("完成，自動補上 eventId 筆數：", filled);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

