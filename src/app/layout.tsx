import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "錄音室預約 | 聊心室",
  description: "專業錄音室空間預約，選擇您的時段立即預約",
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
