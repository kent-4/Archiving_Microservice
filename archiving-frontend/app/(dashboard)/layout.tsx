"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Providers } from "../providers";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";



// This layout component acts as our "Private Route"
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  // 1. Handle loading state
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        {/* You can replace this with a beautiful spinner later */}
        <p>Loading application...</p>
      </div>
    );
  }

  // 2. Handle unauthenticated state
  if (!isLoading && !user) {
    router.replace("/login"); // Redirect to login
    return null; // Don't render anything
  }

  // 3. Render the protected layout
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header user={user} onLogout={logout} />
        <main className="flex-1 p-6 md:p-10">{children}</main>
      </div>
    </div>
  );
}