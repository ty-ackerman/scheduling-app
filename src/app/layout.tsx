import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
        <header className="bg-gray-100 border-b border-gray-300 p-4">
          <h1 className="text-xl font-bold">Scheduling App</h1>
        </header>
        <main className="container mx-auto p-6">{children}</main>
      </body>
    </html>
  );
}
