/**
 * Google Sheet API 整合（KOL 折扣碼）
 * 需 GOOGLE_SHEET_ID 與服務帳戶憑證（與行事曆相同）
 * 試算表需有工作表：KOL名單、使用記錄
 */

import { google } from "googleapis";

function getAuth() {
  let credentials: object | null = null;
  const jsonEnv =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_SHEETS ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (jsonEnv) {
    try {
      credentials = JSON.parse(jsonEnv) as object;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 格式錯誤");
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
        credentials = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as object;
      }
    }
  }
  if (!credentials) {
    throw new Error("未設定 Google 試算表憑證");
  }
  return new google.auth.GoogleAuth({
    credentials: credentials as any,
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

const KOL_SHEET = process.env.GOOGLE_SHEET_KOL_SHEET || "KOL名單";
const USAGE_SHEET = process.env.GOOGLE_SHEET_USAGE_SHEET || "使用記錄";

/** 取得工作表實際標題（依順序：第一個=KOL、第二個=使用記錄） */
async function getSheetTitles(): Promise<{ kol: string; usage: string }> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = getSheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const tabs = (meta.data.sheets || []).map((s) => s.properties?.title || "");
  return {
    kol: tabs[0] || KOL_SHEET,
    usage: tabs[1] || USAGE_SHEET,
  };
}

/** KOL 名單欄位：姓名、折扣碼、每月時數（單位：小時） */
export interface KolRecord {
  name: string;
  code: string;
  hoursPerMonth: number; // 小時
}

/** 依折扣碼查詢 KOL，不區分大小寫 */
export async function getKolByCode(code: string): Promise<KolRecord | null> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = getSheetId();
  const { kol } = await getSheetTitles();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${kol}!A2:C`,
  });
  const rows = (res.data.values || []) as string[][];
  const normalized = code.trim().toLowerCase();

  for (const row of rows) {
    const [name, c, hoursStr] = row;
    if (!c) continue;
    if (c.trim().toLowerCase() === normalized) {
      const hours = parseFloat(hoursStr || "0") || 0;
      return { name: (name || "").trim(), code: c.trim(), hoursPerMonth: hours };
    }
  }
  return null;
}

/** 取得某折扣碼當月已使用時數 */
export async function getMonthlyUsage(
  code: string,
  yearMonth: string
): Promise<number> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = getSheetId();
  const { usage } = await getSheetTitles();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${usage}!A2:D`,
  });
  const rows = (res.data.values || []) as string[][];
  const normalized = code.trim().toLowerCase();
  let total = 0;

  for (const row of rows) {
    const [c, dateStr, hoursStr] = row;
    if (!c || c.trim().toLowerCase() !== normalized) continue;
    const date = dateStr || "";
    if (!date.startsWith(yearMonth)) continue;
    total += parseFloat(hoursStr || "0") || 0;
  }
  return total;
}

/** 新增一筆使用記錄（含大小間欄位） */
export async function addUsageRecord(
  code: string,
  dateStr: string,
  hoursUsed: number,
  summary: string,
  studio?: "big" | "small"
): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = getSheetId();
  const { usage } = await getSheetTitles();

  const studioLabel = studio === "small" ? "小間" : studio === "big" ? "大間" : "";

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${usage}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[code.trim(), dateStr, hoursUsed, summary, studioLabel]],
    },
  });
}
