// In app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import { Toast } from "@/components/ui/toast"; // <-- 1. This should be Toaster, not Toast

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Archive Service",
  description: "Find and download your archived items",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning={true} // <-- 2. This must be a prop of the <html> tag
    >
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <Providers>
          {children}
          <Toast /> {/* <-- 3. This should be Toaster, not Toast */}
        </Providers>
      </body>
    </html>
  );
}