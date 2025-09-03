import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import Providers from "@/components/Providers";
import UserMenu from "@/components/UserMenu";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scheduling App",
  description: "Simple scheduling app Phase 1",
  // Set theme-color dynamically for OS UI chrome
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <header className="app-header">
            <div className="container app-header__inner">
              <Link href="/" className="text-lg font-bold">
                Scheduling App
              </Link>
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/week" className="link">Week View</Link>
                <Link href="/manager" className="link">Manager</Link>
                <UserMenu />
              </nav>
            </div>
          </header>

          <main className="container" style={{ padding: "24px 16px" }}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}