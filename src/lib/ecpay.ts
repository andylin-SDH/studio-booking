/**
 * 綠界 ECPay 全方位金流（導轉式）
 * 需設定：ECPAY_MERCHANT_ID、ECPAY_HASH_KEY、ECPAY_HASH_IV
 * 測試：ECPAY_SANDBOX=true
 * 文件：https://developers.ecpay.com.tw/
 */

import crypto from "crypto";

const PROD_URL = "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5";
const SANDBOX_URL = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

function getActionUrl(): string {
  return process.env.ECPAY_SANDBOX === "true" ? SANDBOX_URL : PROD_URL;
}

function getCredentials() {
  const id = process.env.ECPAY_MERCHANT_ID;
  const key = process.env.ECPAY_HASH_KEY;
  const iv = process.env.ECPAY_HASH_IV;
  if (!id || !key || !iv) {
    throw new Error("未設定 ECPAY_MERCHANT_ID、ECPAY_HASH_KEY、ECPAY_HASH_IV");
  }
  return { merchantId: id, hashKey: key, hashIv: iv };
}

/** 產生 CheckMacValue（綠界 SHA256 檢查碼，依官方文件 2902） */
function genCheckMacValue(params: Record<string, string>): string {
  const { hashKey, hashIv } = getCredentials();
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== "CheckMacValue" && params[k] !== undefined && params[k] !== null)
    .sort();
  const query = sortedKeys.map((k) => `${k}=${params[k]}`).join("&");
  const raw = `HashKey=${hashKey}&${query}&HashIV=${hashIv}`;
  let encoded = encodeURIComponent(raw).toLowerCase();
  // 依 ECPay urlencode 轉換表還原特定字元（符合 .NET 編碼）
  encoded = encoded
    .replace(/%20/g, "+")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

/** 驗證綠界回傳的 CheckMacValue */
export function verifyCheckMacValue(params: Record<string, string>): boolean {
  const received = params["CheckMacValue"] || params["checkmacvalue"] || "";
  const copy = { ...params };
  delete copy.CheckMacValue;
  delete copy.checkmacvalue;
  const expected = genCheckMacValue(copy);
  return received === expected;
}

export interface EcpayFormInput {
  orderId: string;
  amount: number;
  productName: string;
  returnUrl: string;
  orderResultUrl?: string;
  clientBackUrl?: string;
}

/** 建立 ECPay 導轉表單參數（前端需 POST 至綠界） */
export function buildEcpayForm(input: EcpayFormInput): {
  formActionUrl: string;
  formData: Record<string, string>;
} {
  const { merchantId } = getCredentials();
  const now = new Date();
  const tradeDate =
    `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ` +
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

  const params: Record<string, string> = {
    MerchantID: merchantId,
    MerchantTradeNo: input.orderId,
    MerchantTradeDate: tradeDate,
    PaymentType: "aio",
    TotalAmount: String(Math.round(input.amount)),
    TradeDesc: "盛德好錄音室預約",
    ItemName: input.productName,
    ReturnURL: input.returnUrl,
    ChoosePayment: "ALL", // 讓消費者自選付款方式
    EncryptType: "1", // SHA256
  };
  if (input.orderResultUrl) params.OrderResultURL = input.orderResultUrl;
  if (input.clientBackUrl) params.ClientBackURL = input.clientBackUrl;

  params.CheckMacValue = genCheckMacValue(params);

  return {
    formActionUrl: getActionUrl(),
    formData: params,
  };
}
