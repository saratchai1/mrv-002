import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mangrove MRV | แปลงตัวอย่างและการติดตามคาร์บอน",
  description: "ทะเบียนข้อมูลเบสไลน์ MOC2 VSD บันทึกรอบสำรวจต้นไม้ ตรวจคุณภาพ และรายงาน MRV ที่ตรวจสอบย้อนกลับได้",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
