"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, HardDrive, Package } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/hooks/useAuth"; // <-- 1. IMPORT useAuth

// (Interfaces and helper functions remain the same)
interface DashboardStats {
  totalItems: number;
  storageUsed: number; // in bytes
  lastUpload: string | null;
}

interface ArchivedFile {
  file_id: string;
  filename: string;
  original_filename: string; // <-- Make sure this is here from our last step
  archived_at: string;
  size: number; // in bytes
  tags: string[];
  status: string;
}

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentFiles, setRecentFiles] = useState<ArchivedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const auth = useAuth(); // <-- 2. GET THE AUTH CONTEXT

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        // Fetch in parallel
        const [statsRes, recentRes] = await Promise.all([
          api.get("/dashboard/stats"),
          api.get("/dashboard/recent"),
        ]);

        setStats(statsRes.data);
        setRecentFiles(recentRes.data.results);
      } catch (error: any) {
        // --- 3. ADD THIS UPDATED CATCH BLOCK ---
        if (error.response && error.response.status === 401) {
          // 401 error! Our cookie is invalid or expired.
          toast({
            variant: "destructive",
            title: "Session Expired",
            description: "Please log in again.",
          });
          auth.logout(); // This will clear localStorage and redirect to /login
        } else {
          // Other error (e.g., server is down)
          console.error("Failed to fetch dashboard data:", error);
          toast({
            variant: "destructive",
            title: "Failed to load dashboard",
            description: "Could not fetch dashboard statistics and recent files.",
          });
        }
        // --- END UPDATED CATCH BLOCK ---
      }
      setIsLoading(false);
    }
    fetchData();
  }, [toast, auth]); // <-- 4. ADD auth TO DEPENDENCY ARRAY

  // ... (StatusBadge component is unchanged) ...
  const StatusBadge = ({ status }: { status: string }) => {
    let variant: "default" | "secondary" | "destructive" = "secondary";
    if (status === "archived") variant = "default";
    if (status === "error") variant = "destructive";

    return (
      <Badge
        variant={variant}
        className={
          variant === "default"
            ? "bg-green-600 text-green-50"
            : variant === "destructive"
            ? "bg-red-600 text-red-50"
            : "bg-yellow-500 text-yellow-50"
        }
      >
        {status === "archived"
          ? "Completed"
          : status === "processing"
          ? "Processing"
          : "Error"}
      </Badge>
    );
  };

  if (isLoading) {
    return <div>Loading dashboard data...</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Page Title (Unchanged) */}
      <div>
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="text-lg text-muted-foreground">
          Overview of your archived items
        </p>
      </div>

      {/* 2. Stats Cards (Unchanged) */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Items Summary
            </CardTitle>
            <Package className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold">
              {stats?.totalItems.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <HardDrive className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold">
              {formatBytes(stats?.storageUsed || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Upload</CardTitle>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-5xl font-bold">
              {formatTimeAgo(stats?.lastUpload ?? null)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Recent Archives Table (Unchanged) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Archives</CardTitle>
          <Button variant="outline" size="sm">
            View All <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filename</TableHead>
                <TableHead>Date Archived</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentFiles.length > 0 ? (
                recentFiles.map((file) => (
                  <TableRow key={file.file_id}>
                    <TableCell className="font-medium">
                      {file.original_filename}
                    </TableCell>
                    <TableCell>{formatDate(file.archived_at)}</TableCell>
                    <TableCell>{formatBytes(file.size)}</TableCell>
                    <TableCell className="flex gap-1">
                      {file.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          #{tag}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={file.status} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center h-24 text-muted-foreground"
                  >
                    No recent files found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}