// In app/layout.tsx

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "./providers";
import { Toaster } from "@/components/ui/toaster"; // <-- 1. This is the correct import

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
      suppressHydrationWarning={true}
    >
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable
        )}
      >
        <Providers>
          {children}
          <Toaster /> {/* <-- 2. Render the Toaster here */}
        </Providers>
      </body>
    </html>
  );
}