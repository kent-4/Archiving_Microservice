"use client";

import React, { useEffect } from "react"; // <-- 1. Import useEffect
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
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

  // --- 2. Move redirect logic into a useEffect ---
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login"); // Redirect to login
    }
  }, [isLoading, user, router]); // <-- Run this effect when these change

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
  if (!user) {
    // If not loading and no user, the useEffect is already handling the redirect.
    // Return null to render nothing while redirecting.
    return null; 
  }

  // 3. Render the protected layout (only if user exists and not loading)
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