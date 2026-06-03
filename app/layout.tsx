import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "駅構内点検アプリ",
  description: "駅構内点検の写真カルテ・傾斜測定カルテ作成アプリ",
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
