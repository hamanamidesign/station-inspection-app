import type { Metadata, Viewport } from "next";
import "./globals.css";

const appName = "駅構内点検アプリ";
const appDescription = "駅構内点検の写真カルテ・傾斜測定カルテ作成アプリ";
const themeColor = "#f97316";

export const metadata: Metadata = {
  title: appName,
  description: appDescription,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
