"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { useAuth } from "@/hooks/useAuth";
import {
  CalendarIcon,
  SearchIcon,
  Download,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import axios from "axios";

// ShadCN Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// --- 1. Define Types (UPDATED) ---

interface ArchivedFile {
  file_id: string;
  filename: string;
  original_filename: string; // <-- NEW
  archived_at: string;
  size: number;
  tags: string[];
  status: string;
  content_type: string;
  original_content_type: string; // <-- NEW
  archive_policy: string;
}

interface FileDetails extends ArchivedFile {
  download_url: string;
}

// ... (searchSchema is unchanged) ...
const searchSchema = z.object({
  query: z.string().optional(),
  tags: z.string().optional(),
});
type SearchSchema = z.infer<typeof searchSchema>;

// --- 2. Helper Components & Functions (Unchanged) ---

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

// --- 3. Main Search Page Component ---

export default function SearchPage() {
  const { toast } = useToast();
  const auth = useAuth();

  const [results, setResults] = useState<ArchivedFile[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const [sortBy, setSortBy] = useState("archived_at");
  const [sortOrder, setSortOrder] = useState("desc");
  
  const form = useForm<SearchSchema>({
    resolver: zodResolver(searchSchema),
    defaultValues: { query: "", tags: "" },
  });
  const { query, tags } = form.watch();

  const [selectedFile, setSelectedFile] = useState<ArchivedFile | null>(null);
  const [fileDetails, setFileDetails] = useState<FileDetails | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  // --- 4. Data Fetching (Unchanged, but auth fix is still here) ---

  const handleSearch = async () => {
    setIsLoading(true);
    try {
      const params = {
        q: query || undefined,
        tags: tags || undefined,
        start_date: date?.from ? format(date.from, "yyyy-MM-dd") : undefined,
        end_date: date?.to ? format(date.to, "yyyy-MM-dd") : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      const response = await api.get("/search", { params });
      setResults(response.data.results || []);
      setTotalResults(response.data.total || 0);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        toast({
          variant: "destructive",
          title: "Session Expired",
          description: "Please log in again.",
        });
        auth.logout();
      } else {
        console.error("Failed to fetch search results:", error);
        toast({
          variant: "destructive",
          title: "Search Failed",
          description: "Could not fetch search results.",
        });
      }
    }
    setIsLoading(false);
  };

  const fetchFileDetails = async (fileId: string) => {
    try {
      const response = await api.get(`/archive/${fileId}`);
      setFileDetails(response.data);
    } catch (error) {
      console.error("Failed to fetch file details:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load file details.",
      });
      setSelectedFile(null);
    }
  };

  const handleDirectDownload = async (fileId: string, originalFilename: string) => {
    setDownloadingFileId(fileId);
    try {
      const response = await api.get(`/api/download/${fileId}`);
      const { download_url } = response.data;

      const link = document.createElement("a");
      link.href = download_url;
      link.setAttribute("download", originalFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download failed:", error);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Could not download the file.",
      });
    }
    setDownloadingFileId(null);
  };

  // --- UPDATED: Download function ---
  const handleDownload = async () => {
    if (!fileDetails) return;
    setIsDownloading(true);
    try {
      const link = document.createElement("a");
      link.href = fileDetails.download_url;
      // --- FIX: Use original_filename for the download ---
      link.setAttribute("download", fileDetails.original_filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Download failed:", error);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Could not download the file.",
      });
    }
    setIsDownloading(false);
  };

  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedFile) {
      fetchFileDetails(selectedFile.file_id);
    } else {
      setFileDetails(null);
    }
  }, [selectedFile, fetchFileDetails]);

  // --- 5. JSX (With updates) ---

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Page Title (Unchanged) */}
      <div>
        <h1 className="text-4xl font-bold">Search & Retrieve</h1>
        <p className="text-lg text-muted-foreground">
          Find and download your archived items
        </p>
      </div>

      {/* 2. Search Filters (Unchanged) */}
      <div className="flex flex-col md:flex-row gap-4">
        <Input
          placeholder="Search by filename..."
          className="h-11 flex-1"
          {...form.register("query")}
        />
        <Input
          placeholder="Search by tag (e.g., finance,q4)"
          className="h-11 flex-1"
          {...form.register("tags")}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "h-11 w-full justify-start text-left font-normal md:w-[300px]",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} -{" "}
                    {format(date.to, "LLL dd, y")}
                  </>
                ) : (
                  format(date.from, "LLL dd, y")
                )
              ) : (
                <span>Pick a date range</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={setDate}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-11 w-full md:w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="archived_at">Date Archived</SelectItem>
            <SelectItem value="filename">Filename</SelectItem>
            <SelectItem value="size">Size</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortOrder} onValueChange={setSortOrder}>
          <SelectTrigger className="h-11 w-full md:w-[120px]">
            <SelectValue placeholder="Order" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Descending</SelectItem>
            <SelectItem value="asc">Ascending</SelectItem>
          </SelectContent>
        </Select>
        <Button
          className="h-11 px-6"
          onClick={handleSearch}
          disabled={isLoading}
        >
          <SearchIcon className="mr-2 h-5 w-5" />
          {isLoading ? "Searching..." : "Search"}
        </Button>
      </div>

      {/* 3. Search Results Table (UPDATED) */}
      <Card>
        <CardHeader>
          <CardTitle>Search Results ({totalResults})</CardTitle>
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Loading results...
                  </TableCell>
                </TableRow>
              ) : results.length > 0 ? (
                results.map((file) => (
                  <TableRow
                    key={file.file_id}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium" onClick={() => setSelectedFile(file)}>
                      {file.original_filename}
                    </TableCell>
                    <TableCell onClick={() => setSelectedFile(file)}>{formatDate(file.archived_at)}</TableCell>
                    <TableCell onClick={() => setSelectedFile(file)}>{formatBytes(file.size)}</TableCell>
                    <TableCell className="flex gap-1 flex-wrap" onClick={() => setSelectedFile(file)}>
                      {file.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          #{tag}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell onClick={() => setSelectedFile(file)}>
                      <StatusBadge status={file.status} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDirectDownload(file.file_id, file.original_filename);
                        }}
                        disabled={downloadingFileId === file.file_id}
                      >
                        {downloadingFileId === file.file_id ? (
                          <Download className="h-4 w-4 animate-pulse" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No results found. Try adjusting your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {/* TODO: Add real pagination logic here */}
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>

      {/* 4. File Details Modal (UPDATED) */}
      <Dialog
        open={!!selectedFile}
        onOpenChange={(isOpen) => !isOpen && setSelectedFile(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              File Details
            </DialogTitle>
            <DialogDescription>
              Review the metadata and download the archived file.
            </DialogDescription>
          </DialogHeader>
          {fileDetails ? (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-right font-medium text-muted-foreground">
                  Filename
                </span>
                {/* --- FIX: Use original_filename --- */}
                <span className="col-span-2">
                  {fileDetails.original_filename}
                </span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-right font-medium text-muted-foreground">
                  File Size
                </span>
                <span className="col-span-2">
                  {formatBytes(fileDetails.size)}
                </span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-right font-medium text-muted-foreground">
                  Content Type
                </span>
                {/* --- FIX: Use original_content_type --- */}
                <span className="col-span-2">
                  {fileDetails.original_content_type}
                </span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-right font-medium text-muted-foreground">
                  Archived On
                </span>
                <span className="col-span-2">
                  {format(new Date(fileDetails.archived_at), "PPP p")}
                </span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-right font-medium text-muted-foreground">
                  Policy
                </span>
                <span className="col-span-2">
                  {fileDetails.archive_policy}
                </span>
              </div>
              <div className="grid grid-cols-3 items-center gap-4">
                <span className="text-right font-medium text-muted-foreground">
                  Tags
                </span>
                <div className="col-span-2 flex gap-2 flex-wrap">
                  {fileDetails.tags.length > 0 ? (
                    fileDetails.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        #{tag}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">No tags</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center">
              Loading file details...
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedFile(null)}
            >
              Close
            </Button>
            <Button
              onClick={handleDownload}
              disabled={!fileDetails || isDownloading}
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloading ? "Downloading..." : "Download File"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}