# 盛德好錄音室預約系統

支援兩間錄音室（大間、小間），各自對應獨立 Google 行事曆，KOL 折扣碼共用同一份試算表。包含：

1. **空間介紹**：圖片區塊  
2. **場地介紹**：文字說明  
3. **場地使用需知**：入場、離場、使用規範  
4. **空間使用狀況行事曆**：串接 **Google 行事曆 API**，顯示已預約時段  
5. **時段選擇**：點選日期後可選 **30 分鐘** 或 **1 小時**  
6. **立即預約**：填寫姓名、聯絡方式後送出，會寫入您的 Google 行事曆  

## 技術

- **Next.js 14**（App Router）+ TypeScript + Tailwind CSS  
- **Google Calendar API**（讀取事件 + 建立預約事件）  

## 安裝與執行

```bash
cd studio-booking
npm install
npm run dev
```

瀏覽 [http://localhost:3000](http://localhost:3000) 即可。

## 設定 Google 行事曆 API

未設定時，行事曆區塊會顯示錯誤提示，預約送出也會失敗。請依下列步驟設定：

1. **Google Cloud Console**  
   - 前往 [Google Cloud Console](https://console.cloud.google.com/)  
   - 建立專案（或選既有專案）  
   - 啟用 **Google Calendar API** 與 **Google Sheets API**（「API 和服務」→「程式庫」→ 搜尋後啟用）  

2. **服務帳戶**  
   - 「API 和服務」→「憑證」→「建立憑證」→「服務帳戶」  
   - 建立後進入該服務帳戶 →「金鑰」→「新增金鑰」→「JSON」  
   - 下載 JSON 檔案  

3. **共用行事曆與試算表**  
   - **大間**行事曆 → 與 `cal1-574@winter-wonder-487904-d7.iam.gserviceaccount.com` 共用（變更活動權限）  
   - **小間**行事曆 → 與 `cal-small@gen-lang-client-0270894688.iam.gserviceaccount.com` 共用（變更活動權限）  
   - KOL 折扣碼試算表 → 與**大間**的服務帳戶共用（編輯權限）  

4. **環境變數**  
   - 複製 `.env.example` 為 `.env.local`  
   - 填寫：  
     - `GOOGLE_CALENDAR_BIG`：大間錄音室行事曆 ID  
     - `GOOGLE_CALENDAR_SMALL`：小間錄音室行事曆 ID  
     - `GOOGLE_APPLICATION_CREDENTIALS_BIG`：大間服務帳戶 JSON 檔案路徑  
     - `GOOGLE_APPLICATION_CREDENTIALS_SMALL`：小間服務帳戶 JSON 檔案路徑  
     - `GOOGLE_APPLICATION_CREDENTIALS`：試算表用（可與 BIG 相同）  
   - **GOOGLE_SHEET_ID**（KOL 折扣碼）：試算表網址中 `spreadsheets/d/` 後的那串 ID  

存檔後重啟 `npm run dev`，行事曆會顯示該日曆的已預約時段，預約成功後也會在該日曆建立新活動。

## 部署

此專案含 API routes，建議使用 **Vercel** 部署（原生支援 Next.js）：

1. 前往 [vercel.com](https://vercel.com)，用 GitHub 登入  
2. **Add New** → **Project** → 選擇 `studio-booking`  
3. 在 **Environment Variables** 新增 `GOOGLE_CALENDAR_ID`、`GOOGLE_SERVICE_ACCOUNT_JSON`、`GOOGLE_SHEET_ID`  
4. 點 **Deploy**  

> Cloudflare Pages 需額外設定才能跑 Next.js API routes，容易出現 404，建議改用 Vercel。

## KOL 折扣碼

試算表需有 KOL名單、使用記錄。若啟用綠界 ECPay 付費，另需「待付款訂單」工作表：

| 工作表 | 欄位（第 1 列為標題） | 單位 |
|--------|------------------------|------|
| **KOL名單** | 姓名 \| 折扣碼 \| 每月時數 | 每月時數填「小時」 |
| **使用記錄** | 折扣碼 \| 使用日期 \| 使用時數 \| 預約摘要 \| 大小間 | 使用時數、大小間由系統寫入 |
| **待付款訂單** | orderId \| start \| end \| durationMinutes \| name \| contact \| note \| discountCode \| studio \| paidHours \| amount \| status \| createdAt | ECPay 待付款時由系統寫入 |

系統**全程以小時計算**。預約時填寫折扣碼、點「驗證」，顯示本月剩餘額度。預約成功後會自動寫入使用記錄（含大小間欄位，值為「大間」或「小間」）。

若既有使用記錄僅有 4 欄，請在試算表中新增第 5 欄標題「大小間」。

付費計費：每小時 500 元、每半小時 250 元；開立發票時加 5% 稅金。若啟用綠界 ECPay 付費（KOL 額度不足時），請設定 ECPAY_* 環境變數，並在試算表新增工作表「待付款訂單」，第 1 列標題：`orderId | start | end | durationMinutes | name | contact | note | discountCode | studio | paidHours | amount | status | createdAt | includeInvoice`（最後一欄記錄是否需開立發票，有勾選時為「是」）。當使用者勾選需開立發票時，系統會另寄一封通知信至 sandehao@gmail.com。

若工作表名稱不同，可設 `GOOGLE_SHEET_KOL_SHEET`、`GOOGLE_SHEET_USAGE_SHEET` 覆寫。

## 自訂內容

- **空間圖片**：編輯 `src/app/page.tsx` 中的 `SPACE_IMAGES` 陣列，改為您的圖片 URL。  
- **場地介紹 / 使用需知**：同上檔案，直接改對應區塊的文字。  
- **營業時段**：在 `src/components/CalendarSection.tsx` 中修改 `DAY_START_HOUR`、`DAY_END_HOUR`（目前為 9–21）。  

## 授權

MIT
