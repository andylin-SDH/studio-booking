/** 付款成功且要開發票時，把資料送進 ERP 待審核。失敗只記 log，不擋預約完成。 */

export async function sendBookingInvoiceToErp(input: {
  orderId: string;
  buyerName?: string;
  buyerIdentifier?: string;
  buyerEmail?: string;
  amountTaxIncluded: number;
  studioLabel: string;
  start: string;
  end: string;
  guestName?: string;
  paidHours?: number;
  note?: string;
}): Promise<void> {
  const url = process.env.ERP_INVOICE_INGEST_URL?.trim();
  const secret = process.env.ERP_INVOICE_INGEST_SECRET?.trim();
  if (!url || !secret) {
    console.warn("[ERP Invoice] 未設定 ERP_INVOICE_INGEST_URL 或 ERP_INVOICE_INGEST_SECRET，略過");
    return;
  }
  if (!input.buyerName?.trim() || !input.buyerIdentifier?.trim() || !input.buyerEmail?.trim()) {
    console.warn("[ERP Invoice] 缺少抬頭、統編或 Email，略過", { orderId: input.orderId });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        orderId: input.orderId,
        buyerName: input.buyerName.trim(),
        buyerIdentifier: input.buyerIdentifier.trim(),
        buyerEmail: input.buyerEmail.trim(),
        amountTaxIncluded: input.amountTaxIncluded,
        studioLabel: input.studioLabel,
        start: input.start,
        end: input.end,
        guestName: input.guestName,
        paidHours: input.paidHours,
        note: input.note,
      }),
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; alreadyExists?: boolean } | null;
    if (!response.ok || !body?.ok) {
      console.error("[ERP Invoice] 建立待審核失敗", {
        orderId: input.orderId,
        status: response.status,
        error: body?.error ?? response.statusText,
      });
      return;
    }
    console.log("[ERP Invoice] 已送進待審核", { orderId: input.orderId, alreadyExists: body.alreadyExists === true });
  } catch (error) {
    console.error("[ERP Invoice] 呼叫 ERP 失敗", {
      orderId: input.orderId,
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}
