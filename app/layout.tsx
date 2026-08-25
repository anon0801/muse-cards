import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Muse Cards", description: "나만의 AI 카드뉴스 스튜디오" };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="ko"><body>{children}</body></html>; }
