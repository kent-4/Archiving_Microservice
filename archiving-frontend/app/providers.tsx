// In app/providers.tsx

"use client";

import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/components/ui/toast"; // 1. Import ToastProvider
import { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider> {/* 2. Wrap your children */}
        {children}
      </ToastProvider>
    </AuthProvider>
  );
}