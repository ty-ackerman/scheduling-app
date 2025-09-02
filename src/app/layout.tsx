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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <header className="bg-gray-100 border-b border-gray-300">
            <div className="container mx-auto flex items-center justify-between p-4">
              <Link href="/" className="text-xl font-bold">
                Scheduling App
              </Link>
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/week" className="underline hover:no-underline">
                  Week View
                </Link>
                <Link href="/manager" className="underline hover:no-underline">
                  Manager
                </Link>
                <UserMenu />
              </nav>
            </div>
          </header>
          <main className="container mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}