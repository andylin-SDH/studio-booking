# Vercel 環境變數設定清單

部署到 Vercel 後，請至專案 → Settings → Environment Variables 新增以下變數。

---

## 必填（行事曆與預約）

| 變數名稱 | 說明 | 範例 |
|---------|------|------|
| `GOOGLE_CALENDAR_BIG` | 大間錄音室行事曆 ID | `xxx@group.calendar.google.com` |
| `GOOGLE_CALENDAR_SMALL` | 小間錄音室行事曆 ID | `yyy@group.calendar.google.com` |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BIG` | 大間服務帳戶 JSON（整份貼上，單行） | `{"type":"service_account",...}` |
| `GOOGLE_SERVICE_ACCOUNT_JSON_SMALL` | 小間服務帳戶 JSON（整份貼上） | 同上 |
| `GOOGLE_SHEET_ID` | KOL 試算表 ID（網址中的一長串） | `1abc...xyz` |

> 若大／小間共用同一服務帳戶，可只設 `GOOGLE_SERVICE_ACCOUNT_JSON_BIG`，並在試算表設定中指向它。

---

## 試算表（KOL、待付款訂單）

試算表憑證若未設 `GOOGLE_SERVICE_ACCOUNT_JSON_SHEETS`，會自動使用 `GOOGLE_SERVICE_ACCOUNT_JSON_BIG`。

| 變數名稱 | 說明 | 必填 |
|---------|------|------|
| `GOOGLE_SERVICE_ACCOUNT_JSON_SHEETS` | 試算表用服務帳戶 JSON | 與行事曆同帳戶時可略 |
| `GOOGLE_SHEET_KOL_SHEET` | KOL 工作表名稱 | 預設 `KOL名單` |
| `GOOGLE_SHEET_USAGE_SHEET` | 使用記錄工作表名稱 | 預設 `使用記錄` |
| `GOOGLE_SHEET_PENDING_SHEET` | 待付款訂單工作表名稱 | 預設 `待付款訂單` |

---

## 綠界 ECPay（付費預約）

| 變數名稱 | 說明 | 範例 |
|---------|------|------|
| `ECPAY_MERCHANT_ID` | 綠界特店編號 | `3002607`（測試） |
| `ECPAY_HASH_KEY` | 綠界 HashKey | `pwFHCqoQZGmho4w6`（測試） |
| `ECPAY_HASH_IV` | 綠界 HashIV | `EkRm7iFT261dpevs`（測試） |
| `ECPAY_SANDBOX` | 測試環境請設 `true` | `true` |
| `PAYMENT_HOURLY_RATE` | 每小時金額（元） | `500` |
| `PAYMENT_INCLUDE_TAX` | 是否含 5% 稅 | `true` 或 `false` |

---

## 網址（綠界回調必填）

| 變數名稱 | 說明 |
|---------|------|
| `NEXT_PUBLIC_APP_URL` | 部署後的網址，例如 `https://your-app.vercel.app`。綠界 ReturnURL 會用這個網址。 |

> Vercel 會自動提供 `VERCEL_URL`，但若有自訂網域請設 `NEXT_PUBLIC_APP_URL` 確保綠界能正確打回。

---

## 預約完成通知郵件（選填）

使用 [Resend](https://resend.com) 寄送預約完成通知。需先於 Resend 後台驗證網域 `sdh-corp.com`。

| 變數名稱 | 說明 |
|---------|------|
| `RESEND_API_KEY` | Resend API Key（從 Resend 後台取得） |
| `EMAIL_FROM` | 寄件者，預設 `盛德好錄音室 <andylin@sdh-corp.com>` |

未設定時會跳過寄信，不影響預約流程。

---

## 行事曆刪除同步（選填）

當您手動刪除 Google 行事曆上的預約事件時，系統會定期比對並移除對應的使用記錄，老師的額度會還回。

| 變數名稱 | 說明 |
|---------|------|
| `CRON_SECRET` | 排程驗證密鑰。請設一組隨機字串（例如 `openssl rand -hex 32`）。若未設，排程仍會執行。 |

Vercel Cron 會每小時呼叫 `/api/cron/sync-deleted-usage`。使用記錄需含 **事件 ID**（G 欄）才會被納入同步；新預約會自動寫入，舊記錄可手動補填或略過。

---

## 完整清單（複製用）

```
GOOGLE_CALENDAR_BIG=
GOOGLE_CALENDAR_SMALL=
GOOGLE_SERVICE_ACCOUNT_JSON_BIG=
GOOGLE_SERVICE_ACCOUNT_JSON_SMALL=
GOOGLE_SHEET_ID=
ECPAY_MERCHANT_ID=
ECPAY_HASH_KEY=
ECPAY_HASH_IV=
ECPAY_SANDBOX=true
NEXT_PUBLIC_APP_URL=https://你的專案.vercel.app
RESEND_API_KEY=
EMAIL_FROM=盛德好錄音室 <andylin@sdh-corp.com>
CRON_SECRET=
```

填入實際值後貼到 Vercel 環境變數即可。
