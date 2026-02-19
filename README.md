# 錄音室預約介面

仿 [MicVision 聊心室](https://micvision.studio/product/%E8%81%8A%E5%BF%83%E5%AE%A4-%E6%9C%80%E5%A4%9A2%E4%BA%BA%E9%8C%84%E9%9F%B3/) 的錄音室預約網站，包含：

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
   - 啟用 **Google Calendar API**（「API 和服務」→「程式庫」→ 搜尋 Calendar → 啟用）  

2. **服務帳戶**  
   - 「API 和服務」→「憑證」→「建立憑證」→「服務帳戶」  
   - 建立後進入該服務帳戶 →「金鑰」→「新增金鑰」→「JSON」  
   - 下載 JSON 檔案  

3. **共用行事曆**  
   - 開啟您要用來管理「錄音室預約」的 Google 行事曆  
   - 設定 → 與特定使用者共用 → 新增 **服務帳戶的 email**（JSON 裡的 `client_email`）  
   - 權限設為「變更活動的權限」或「管理共用設定」  

4. **環境變數**  
   - 複製 `.env.example` 為 `.env.local`  
   - 填寫：  
     - `GOOGLE_CALENDAR_ID`：行事曆 ID（例如 `primary` 或 `xxxx@group.calendar.google.com`）  
     - 擇一：  
       - **GOOGLE_SERVICE_ACCOUNT_JSON**：把整個 JSON 壓成**單行**貼上（適合 Vercel 等雲端部署）  
       - **GOOGLE_APPLICATION_CREDENTIALS**：本機開發可填 JSON 檔案路徑，例如 `./google-credentials.json`  

存檔後重啟 `npm run dev`，行事曆會顯示該日曆的已預約時段，預約成功後也會在該日曆建立新活動。

## 部署

此專案含 API routes，建議使用 **Vercel** 部署（原生支援 Next.js）：

1. 前往 [vercel.com](https://vercel.com)，用 GitHub 登入  
2. **Add New** → **Project** → 選擇 `studio-booking`  
3. 在 **Environment Variables** 新增 `GOOGLE_CALENDAR_ID` 和 `GOOGLE_SERVICE_ACCOUNT_JSON`  
4. 點 **Deploy**  

> Cloudflare Pages 需額外設定才能跑 Next.js API routes，容易出現 404，建議改用 Vercel。

## 自訂內容

- **空間圖片**：編輯 `src/app/page.tsx` 中的 `SPACE_IMAGES` 陣列，改為您的圖片 URL。  
- **場地介紹 / 使用需知**：同上檔案，直接改對應區塊的文字。  
- **營業時段**：在 `src/components/CalendarSection.tsx` 中修改 `DAY_START_HOUR`、`DAY_END_HOUR`（目前為 9–21）。  

## 授權

MIT
