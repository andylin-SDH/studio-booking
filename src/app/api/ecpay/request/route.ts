import { NextRequest, NextResponse } from "next/server";
import { buildEcpayForm } from "@/lib/ecpay";
import { addPendingOrder } from "@/lib/google-sheet";

/** 超出時數：每小時 500、每半小時 250（TWD） */
const HOURLY_RATE =
  parseFloat(process.env.PAYMENT_HOURLY_RATE || "500") || 500;
/** 開立發票時加 5% 稅金 */
const INCLUDE_TAX = process.env.PAYMENT_INCLUDE_TAX !== "false";

/** 綠界 MerchantTradeNo 限制 20 字元 */
function generateOrderId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `SDH${t}${r}`.slice(0, 20);
}

export async function POST(request: NextRequest) {
  let body: {
    start?: string;
    end?: string;
    durationMinutes?: number;
    name?: string;
    contact?: string;
    note?: string;
    discountCode?: string;
    studio?: string;
    paidHours?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "無效的請求內容" }, { status: 400 });
  }

  const {
    start,
    end,
    durationMinutes = 0,
    name,
    contact,
    note = "",
    discountCode = "",
    studio = "big",
    paidHours = 0,
  } = body;

  if (!start || !end || !name || !contact || paidHours <= 0) {
    return NextResponse.json(
      { error: "請提供 start、end、name、contact、paidHours" },
      { status: 400 }
    );
  }

  const studioId = (studio === "small" ? "small" : "big") as "big" | "small";
  let amount = Math.ceil(paidHours * HOURLY_RATE);
  if (INCLUDE_TAX) {
    amount = Math.ceil(amount * 1.05);
  }
  if (amount < 1) {
    return NextResponse.json({ error: "金額計算錯誤" }, { status: 400 });
  }

  const orderId = generateOrderId();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  const returnUrl = `${baseUrl}/api/ecpay/return`;
  const orderResultUrl = `${baseUrl}/api/ecpay/order-result`;
  const clientBackUrl = `${baseUrl}/#calendar`;

  try {
    await addPendingOrder({
      orderId,
      start,
      end,
      durationMinutes,
      name: name.trim(),
      contact: contact.trim(),
      note: note.trim(),
      discountCode: discountCode.trim(),
      studio: studioId,
      paidHours,
      amount,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    const { formActionUrl, formData } = buildEcpayForm({
      orderId,
      amount,
      productName: `盛德好錄音室 · 超出 KOL 額度 ${paidHours.toFixed(1)} 小時${INCLUDE_TAX ? "（含5%稅）" : ""}`,
      returnUrl,
      orderResultUrl,
      clientBackUrl,
    });

    return NextResponse.json({
      formActionUrl,
      formData,
      orderId,
    });
  } catch (e) {
    console.error("ECPay request error:", e);
    const msg = e instanceof Error ? e.message : "建立付款失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
