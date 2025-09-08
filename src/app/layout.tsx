// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import AuthProvider from "@/components/AuthProvider";
import HeaderNav from "@/components/HeaderNav";

export const metadata: Metadata = {
  title: "Scheduling App",
  description: "Staff availability and scheduling",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <HeaderNav />
          <main className="container" style={{ paddingTop: 24, paddingBottom: 48 }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}