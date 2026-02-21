import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "盛德好錄音室 | 預約",
  description: "盛德好錄音室大間、小間預約，選擇您的時段立即預約",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
