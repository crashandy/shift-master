import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "18度雞 員工小站",
  description: "18度雞 班表、清潔清點與店務紀錄",
  appleWebApp: { capable: true, title: "18度雞", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffb81f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-cream text-stone-800">{children}</body>
    </html>
  );
}
