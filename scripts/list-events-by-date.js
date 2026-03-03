// 小工具：列出指定日期、指定錄音室的所有 Google 行事曆事件（含 eventId）
// 使用方式（在專案根目錄）：
//   node scripts/list-events-by-date.js 2026-03-23 big
// 或：
//   node scripts/list-events-by-date.js 2026-03-23 small
//
// 方便你對照「使用記錄」試算表手動補 eventId。

const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

// 嘗試載入 .env.local，沿用 Next.js 的設定
(function loadEnvLocal() {
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
    console.warn("[list-events-by-date] 載入 .env.local 失敗（可忽略）：", e.message);
  }
})();

function getCalendarId(studio) {
  const id =
    studio === "big"
      ? process.env.GOOGLE_CALENDAR_BIG
      : process.env.GOOGLE_CALENDAR_SMALL;
  return id || process.env.GOOGLE_CALENDAR_ID || "primary";
}

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
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON_* 格式錯誤");
    }
  }
  if (!credentials) {
    const credPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SHEETS ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS_BIG ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath) {
      const resolved = path.isAbsolute(credPath)
        ? credPath
        : path.join(process.cwd(), credPath);
      if (fs.existsSync(resolved)) {
        credentials = JSON.parse(fs.readFileSync(resolved, "utf8"));
      }
    }
  }
  if (!credentials) {
    throw new Error("未設定 Google 憑證（GOOGLE_SERVICE_ACCOUNT_JSON_* 或 GOOGLE_APPLICATION_CREDENTIALS_*）");
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
}

async function main() {
  const [, , dateStr, studioArg] = process.argv;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    console.error("請輸入日期，例如：node scripts/list-events-by-date.js 2026-03-23 big");
    process.exit(1);
  }
  const studio = studioArg === "small" ? "small" : "big";

  const auth = await getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const calendarId = getCalendarId(studio);

  const timeMin = new Date(`${dateStr}T00:00:00+08:00`).toISOString();
  const timeMax = new Date(`${dateStr}T23:59:59.999+08:00`).toISOString();

  console.log(`查詢 ${dateStr} 錄音室-${studio === "big" ? "大間" : "小間"} 的事件（calendarId = ${calendarId}）`);

  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });

  const items = res.data.items || [];
  if (items.length === 0) {
    console.log("此日無任何事件。");
    return;
  }

  for (const ev of items) {
    const id = ev.id || "(無 id)";
    const summary = ev.summary || "(無標題)";
    const desc = (ev.description || "").toString();
    const start = ev.start?.dateTime || ev.start?.date || "";
    const end = ev.end?.dateTime || ev.end?.date || "";
    console.log("────────────────────────");
    console.log("eventId :", id);
    console.log("標題    :", summary);
    console.log("開始    :", start);
    console.log("結束    :", end);
    if (desc) {
      console.log("描述含折扣碼？:", desc.includes("折扣碼") ? "是" : "否");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

