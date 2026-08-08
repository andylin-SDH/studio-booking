/**
 * 預約完成通知郵件（Resend）
 * 需設定 RESEND_API_KEY，並於 Resend 後台驗證 sdh-corp.com 網域
 * 寄件者：andylin@sdh-corp.com
 */

import { Resend } from "resend";

const FROM_EMAIL = process.env.EMAIL_FROM || "盛德好錄音室 <andylin@sdh-corp.com>";

function getResendClient() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const ADMIN_INVOICE_EMAIL = "sandehao@gmail.com";

export interface BookingEmailParams {
  to: string; // 預約者 Email
  name: string;
  start: string; // ISO
  end: string;
  studio: "big" | "small";
  studioLabel: string;
  /** 訪談來賓（選填），用於 .ics 標題 */
  interviewGuests?: string;
  /** 是否為付費預約，用於 .ics 標題前綴 */
  isPaid?: boolean;
}

/** 需開立發票時，通知管理員（固定寄至 sandehao@gmail.com） */
export interface InvoiceNotificationParams {
  name: string;
  contact: string;
  start: string;
  end: string;
  studio: "big" | "small";
  studioLabel: string;
  /** 金額（選填，付費訂單時傳入） */
  amount?: number;
  /** 使用者備註（選填） */
  note?: string;
  /** 發票抬頭（選填） */
  invoiceTitle?: string;
  /** 統一編號（選填） */
  invoiceTaxId?: string;
  /** 發票收件 Email（選填） */
  invoiceRecipientEmail?: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
  const time = d.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

/** 產生預約的 .ics 內容，供客戶加入行事曆 */
function buildBookingIcs(params: {
  name: string;
  start: string;
  end: string;
  studio: "big" | "small";
  studioLabel: string;
  interviewGuests?: string;
  isPaid?: boolean;
}): string {
  const { name, start, end, studio, studioLabel, interviewGuests, isPaid } = params;
  const roomLabel = studio === "small" ? "小間" : "大間";
  const prefix = isPaid ? `[錄音室預約-付費-${roomLabel}]` : `[錄音室預約-${roomLabel}]`;
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@sdh-corp.com`;
  const startUtc = new Date(start).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const endUtc = new Date(end).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const summary = `${prefix} ${name}${interviewGuests?.trim() ? ` 訪談：${interviewGuests.trim()}` : ""}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//盛德好錄音室//Booking//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${startUtc}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${summary.replace(/\r?\n/g, " ")}`,
    `DESCRIPTION:${studioLabel} 錄音預約`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];
  return lines.join("\r\n");
}

export async function sendBookingConfirmation(params: BookingEmailParams): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.warn("[Email] 未設定 RESEND_API_KEY，跳過寄信");
    return false;
  }

  const { to, name, start, end, studio, studioLabel, interviewGuests, isPaid } = params;
  const startStr = formatDateTime(start);
  const endStr = formatDateTime(end);

  const icsContent = buildBookingIcs({ name, start, end, studio, studioLabel, interviewGuests, isPaid });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;font-family:system-ui,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
    <h2 style="margin:0 0 16px;font-size:1.25rem">【盛德好】預約完成通知</h2>
    <p style="margin:0 0 16px;color:#64748b">親愛的 ${name} 您好，</p>
    <p style="margin:0 0 16px">您的錄音室預約已完成。</p>
    <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0 0 8px"><strong>錄音室</strong>：${studioLabel}</p>
      <p style="margin:0 0 8px"><strong>開始時間</strong>：${startStr}</p>
      <p style="margin:0"><strong>結束時間</strong>：${endStr}</p>
    </div>
    <p style="margin:16px 0 0;font-size:0.875rem;color:#64748b">如需取消退款，請聯繫官方 Line@。<br><a href="https://lin.ee/v3u8YDR" style="color:#0ea5e9">https://lin.ee/v3u8YDR</a></p>
  </div>
</body>
</html>`;

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "【盛德好】預約完成通知",
      html,
      attachments: [
        {
          filename: "booking.ics",
          content: Buffer.from(icsContent, "utf-8").toString("base64"),
        },
      ],
    });
    if (error) {
      console.error("[Email] 寄送失敗", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Email] 寄送失敗", e);
    return false;
  }
}

/** 行事曆時段衝突的單筆資料 */
export interface ConflictPair {
  studioLabel: string;
  aSummary: string;
  aStart: string;
  aEnd: string;
  bSummary: string;
  bStart: string;
  bEnd: string;
}

/**
 * 行事曆時段衝突提醒（寄給管理端）
 * 收件人取自 CONFLICT_ALERT_EMAIL，未設定時回傳 false 不寄信
 */
export async function sendConflictAlert(conflicts: ConflictPair[]): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.warn("[Email] 未設定 RESEND_API_KEY，跳過衝突提醒信");
    return false;
  }
  const recipients = (process.env.CONFLICT_ALERT_EMAIL || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (recipients.length === 0) {
    console.warn("[Email] 未設定 CONFLICT_ALERT_EMAIL，跳過衝突提醒信");
    return false;
  }
  if (conflicts.length === 0) return false;

  const rows = conflicts
    .map(
      (c) => `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:0 0 12px">
      <p style="margin:0 0 8px;font-weight:600;color:#b91c1c">${c.studioLabel} · 時段重疊</p>
      <p style="margin:0 0 4px;color:#334155"><strong>A</strong>：${c.aSummary}</p>
      <p style="margin:0 0 8px;font-size:0.8125rem;color:#64748b">${formatDateTime(c.aStart)} — ${formatDateTime(c.aEnd)}</p>
      <p style="margin:0 0 4px;color:#334155"><strong>B</strong>：${c.bSummary}</p>
      <p style="margin:0;font-size:0.8125rem;color:#64748b">${formatDateTime(c.bStart)} — ${formatDateTime(c.bEnd)}</p>
    </div>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;font-family:system-ui,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
    <h2 style="margin:0 0 16px;font-size:1.25rem">【盛德好】行事曆預約衝突提醒</h2>
    <p style="margin:0 0 16px;color:#64748b">系統偵測到以下 ${conflicts.length} 組時段重疊，可能為人工與系統預約協作不一致，請人工確認。</p>
    ${rows}
    <p style="margin:16px 0 0;font-size:0.75rem;color:#94a3b8">此為自動偵測，僅供提醒，未修改任何行事曆或系統資料。</p>
  </div>
</body>
</html>`;

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: recipients,
      subject: `【盛德好】行事曆預約衝突提醒（${conflicts.length} 組）`,
      html,
    });
    if (error) {
      console.error("[Email] 衝突提醒信寄送失敗", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Email] 衝突提醒信寄送失敗", e);
    return false;
  }
}

export async function sendInvoiceNotificationToAdmin(
  params: InvoiceNotificationParams
): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.warn("[Email] 未設定 RESEND_API_KEY，跳過寄信");
    return false;
  }

  const {
    name,
    contact,
    start,
    end,
    studioLabel,
    amount,
    note,
    invoiceTitle,
    invoiceTaxId,
    invoiceRecipientEmail,
  } = params;
  const startStr = formatDateTime(start);
  const endStr = formatDateTime(end);
  const amountStr =
    amount != null && amount > 0 ? `NT$ ${amount.toLocaleString()}` : "";
  const noteStr = note?.trim() || "（未填寫）";
  const invoiceTitleStr = invoiceTitle?.trim() || "（未填寫）";
  const invoiceTaxIdStr = invoiceTaxId?.trim() || "（未填寫）";
  const invoiceRecipientEmailStr = invoiceRecipientEmail?.trim() || "（未填寫）";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;font-family:system-ui,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
    <h2 style="margin:0 0 16px;font-size:1.25rem">【盛德好】預約需開立發票</h2>
    <p style="margin:0 0 16px;color:#64748b">以下預約已勾選需要開立發票，請協助處理。</p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:16px 0;border:1px solid #fcd34d">
      <p style="margin:0 0 8px"><strong>預約人</strong>：${name}</p>
      <p style="margin:0 0 8px"><strong>聯絡方式</strong>：${contact}</p>
      <p style="margin:0 0 8px"><strong>錄音室</strong>：${studioLabel}</p>
      <p style="margin:0 0 8px"><strong>開始時間</strong>：${startStr}</p>
      <p style="margin:0 0 8px"><strong>結束時間</strong>：${endStr}</p>
      <p style="margin:0 0 8px"><strong>金額</strong>：${amountStr}</p>
      <p style="margin:0 0 8px"><strong>發票抬頭</strong>：${invoiceTitleStr}</p>
      <p style="margin:0 0 8px"><strong>統一編號</strong>：${invoiceTaxIdStr}</p>
      <p style="margin:0 0 8px"><strong>發票收件 Email</strong>：${invoiceRecipientEmailStr}</p>
      <p style="margin:0"><strong>備註</strong>：${noteStr}</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [ADMIN_INVOICE_EMAIL],
      subject: "【盛德好】預約需開立發票",
      html,
    });
    if (error) {
      console.error("[Email] 開立發票通知寄送失敗", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[Email] 開立發票通知寄送失敗", e);
    return false;
  }
}
