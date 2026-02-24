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
}

/** 需開立發票時，通知管理員（固定寄至 sandehao@gmail.com） */
export interface InvoiceNotificationParams {
  name: string;
  contact: string;
  start: string;
  end: string;
  studio: "big" | "small";
  studioLabel: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
  const time = d.toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export async function sendBookingConfirmation(params: BookingEmailParams): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.warn("[Email] 未設定 RESEND_API_KEY，跳過寄信");
    return false;
  }

  const { to, name, start, end, studioLabel } = params;
  const startStr = formatDateTime(start);
  const endStr = formatDateTime(end);

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
    <p style="margin:16px 0 0;font-size:0.875rem;color:#64748b">如需修改，請聯繫官方Line@或您的經紀人夥伴。<br><a href="https://lin.ee/v3u8YDR" style="color:#0ea5e9">lin.ee/v3u8YDR</a></p>
  </div>
</body>
</html>`;

  try {
    const { error } = await client.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "【盛德好】預約完成通知",
      html,
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

export async function sendInvoiceNotificationToAdmin(
  params: InvoiceNotificationParams
): Promise<boolean> {
  const client = getResendClient();
  if (!client) {
    console.warn("[Email] 未設定 RESEND_API_KEY，跳過寄信");
    return false;
  }

  const { name, contact, start, end, studioLabel } = params;
  const startStr = formatDateTime(start);
  const endStr = formatDateTime(end);

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
      <p style="margin:0"><strong>結束時間</strong>：${endStr}</p>
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
