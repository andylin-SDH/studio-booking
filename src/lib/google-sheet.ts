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
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BIG;
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
const PENDING_SHEET =
  process.env.GOOGLE_SHEET_PENDING_SHEET || "待付款訂單";

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

/** 待付款訂單欄位 */
export interface PendingOrder {
  orderId: string;
  start: string;
  end: string;
  durationMinutes: number;
  name: string;
  contact: string;
  note: string;
  discountCode: string;
  studio: "big" | "small";
  paidHours: number;
  amount: number;
  status: "pending" | "completed" | "cancelled";
  createdAt: string;
  /** 是否需要開立發票 */
  includeInvoice: boolean;
}

/** 取得待付款工作表名稱（試算表中須有此工作表） */
async function getPendingSheetName(): Promise<string> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = getSheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const titles = (meta.data.sheets || []).map((s) => s.properties?.title || "");
  return titles.includes(PENDING_SHEET) ? PENDING_SHEET : titles[2] || PENDING_SHEET;
}

/** 新增待付款訂單 */
export async function addPendingOrder(order: PendingOrder): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = getSheetId();
  const sheetName = await getPendingSheetName();

  // 使用 RAW 保留 start/end 的 ISO 字串格式，供行事曆 API 使用
  // 欄位 A~N：orderId, start, end, durationMinutes, name, contact, note, discountCode, studio, paidHours, amount, status, createdAt, includeInvoice
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${sheetName}!A:N`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          order.orderId,
          order.start,
          order.end,
          order.durationMinutes,
          order.name,
          order.contact,
          order.note,
          order.discountCode,
          order.studio,
          order.paidHours,
          order.amount,
          order.status,
          order.createdAt,
          order.includeInvoice ? "是" : "",
        ],
      ],
    },
  });
}

/** 依 orderId 查詢待付款訂單 */
export async function getPendingOrder(
  orderId: string
): Promise<PendingOrder | null> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = getSheetId();
  const sheetName = await getPendingSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A2:N`,
  });
  const rows = (res.data.values || []) as string[][];
  const normalized = orderId.trim();

  for (const row of rows) {
    const [oid] = row;
    if (oid && oid.trim() === normalized) {
      const includeInvoiceVal = row[13];
      return {
        orderId: row[0] || "",
        start: row[1] || "",
        end: row[2] || "",
        durationMinutes: parseInt(row[3] || "0", 10),
        name: row[4] || "",
        contact: row[5] || "",
        note: row[6] || "",
        discountCode: row[7] || "",
        studio: (row[8] === "small" ? "small" : "big") as "big" | "small",
        paidHours: parseFloat(row[9] || "0"),
        amount: parseFloat(row[10] || "0"),
        status: (row[11] as "pending" | "completed" | "cancelled") || "pending",
        createdAt: row[12] || "",
        includeInvoice: includeInvoiceVal === "是" || includeInvoiceVal === "true" || includeInvoiceVal === "1",
      };
    }
  }
  return null;
}

/** 更新待付款訂單狀態（需依 row 更新，此處簡化：新增 completed 記錄到另一欄或標記） */
export async function markPendingOrderCompleted(orderId: string): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const sheetId = getSheetId();
  const sheetName = await getPendingSheetName();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A2:N`,
  });
  const rows = (res.data.values || []) as string[][];
  const normalized = orderId.trim();

  for (let i = 0; i < rows.length; i++) {
    const [oid] = rows[i];
    if (oid && oid.trim() === normalized) {
      const rowIndex = i + 2; // 1-based, skip header
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!L${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["completed"]] },
      });
      return;
    }
  }
}
