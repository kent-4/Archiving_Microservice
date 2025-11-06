"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { UploadCloud, File as FileIcon, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import api from "@/lib/api";
import axios from "axios"; // <-- NEW: Import standard axios for S3 uploads
import { cn } from "@/lib/utils";

// --- UPDATED: Define limits ---
const SMALL_FILE_LIMIT = 25 * 1024 * 1024; // 25MB
const MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// 1. UPDATED schema: Remove the size limit. We now handle it in logic.
const formSchema = z.object({
  tags: z.string().optional(),
  policy: z.string().min(1, "Please select an archive policy."),
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, "Please select a file to upload."),
});

type FormSchema = z.infer<typeof formSchema>;

type UploadedPart = {
  ETag: string;
  PartNumber: number;
};

export default function UploadPage() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  // --- NEW: State for multipart upload progress ---
  const [uploadProgress, setUploadProgress] = useState(0);

  // 2. Define the form
  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tags: "",
      policy: "standard-7",
    },
  });

  const selectedFile = form.watch("file");

  // 3. Define the submit handler
  async function onSubmit(values: FormSchema) {
    setIsUploading(true);
    setUploadProgress(0);

    // --- NEW: Logic to decide which upload flow to use ---
    if (values.file.size <= SMALL_FILE_LIMIT) {
      // Use the "small file" flow (with in-memory zipping on backend)
      await handleSmallFileUpload(values);
    } else {
      // Use the "large file" multipart flow
      await handleLargeFileUpload(values);
    }
    // --- END NEW LOGIC ---

    setIsUploading(false);
    setUploadProgress(0);
  }

  // --- 4. Handler for SMALL files (existing logic) ---
  async function handleSmallFileUpload(values: FormSchema) {
    const formData = new FormData();
    formData.append("file", values.file);
    formData.append("tags", values.tags || "");
    formData.append("policy", values.policy);

    try {
      await api.post("/archive", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast({
        title: "Upload Successful",
        description: `File "${values.file.name}" has been archived.`,
      });
      form.reset();
      form.setValue("policy", "standard-7");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.error || "An unknown error occurred.";
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: errorMessage,
      });
    }
  }

  // --- 5. Handler for LARGE files (NEW multipart logic) ---
  async function handleLargeFileUpload(values: FormSchema) {
    const file = values.file;
    let uploadId = "";

    try {
      // Step 1: Start the multipart upload
      const startRes = await api.post("/archive/start-upload", {
        filename: file.name,
      });
      uploadId = startRes.data.uploadId;

      const totalParts = Math.ceil(file.size / MULTIPART_CHUNK_SIZE);
      const partUploadPromises = [];
      const uploadedParts: UploadedPart[] = [];

      // Step 2 & 3: Chunk file and get pre-signed URLs
      for (let i = 0; i < totalParts; i++) {
        const partNumber = i + 1;
        const start = i * MULTIPART_CHUNK_SIZE;
        const end = (i + 1) * MULTIPART_CHUNK_SIZE;
        const chunk = file.slice(start, end);

        // Get the pre-signed URL for this part
        const partUrlRes = await api.post("/archive/get-upload-part-url", {
          filename: file.name,
          uploadId: uploadId,
          partNumber: partNumber,
        });
        const presignedUrl = partUrlRes.data.url;

        // Step 4: Upload chunk directly to S3 (use standard axios, not 'api')
        const uploadPromise = axios
          .put(presignedUrl, chunk, {
            headers: { "Content-Type": file.type },
          })
          .then((uploadRes) => {
            // Store the ETag (receipt) from S3
            const etag = uploadRes.headers["etag"];
            uploadedParts.push({ ETag: etag, PartNumber: partNumber });

            // Update progress
            setUploadProgress(Math.round((partNumber / totalParts) * 100));
          });
        partUploadPromises.push(uploadPromise);
      }

      // Wait for all parts to finish uploading
      await Promise.all(partUploadPromises);

      // Step 5: Complete the upload
      await api.post("/archive/complete-upload", {
        filename: file.name,
        uploadId: uploadId,
        parts: uploadedParts,
        tags: values.tags || "",
        policy: values.policy,
        fileSize: file.size,
        contentType: file.type,
      });

      toast({
        title: "Upload Successful",
        description: `File "${values.file.name}" has been archived.`,
      });
      form.reset();
      form.setValue("policy", "standard-7");
    } catch (error: any) {
      // TODO: Implement abort logic if upload fails midway
      console.error("Large file upload failed:", error);
      const errorMessage =
        error.response?.data?.error || "An unknown error occurred.";
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: errorMessage,
      });
    }
  }

  // --- File Input Handlers (Unchanged) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      form.setValue("file", file, { shouldValidate: true });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      form.setValue("file", file, { shouldValidate: true });
    }
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(active);
  };

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      {/* 1. Page Title */}
      <div>
        <h1 className="text-4xl font-bold">Upload New Files</h1>
        <p className="text-lg text-muted-foreground">
          Select files or drag & drop to start archiving
        </p>
      </div>

      {/* 2. Upload Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* --- File Dropzone (Unchanged) --- */}
          <FormField
            control={form.control}
            name="file"
            render={() => (
              <FormItem>
                <FormControl>
                  <div
                    className={cn(
                      "relative flex flex-col items-center justify-center w-full h-64 border-2 border-border border-dashed rounded-lg cursor-pointer bg-muted/20 transition-colors",
                      dragActive && "border-primary bg-primary/10"
                    )}
                    onDragOver={(e) => handleDrag(e, true)}
                    onDragLeave={(e) => handleDrag(e, false)}
                    onDragEnd={(e) => handleDrag(e, false)}
                    onDrop={handleDrop}
                    onClick={() =>
                      document.getElementById("file-input")?.click()
                    }
                  >
                    <input
                      id="file-input"
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isUploading}
                    />
                    {selectedFile ? (
                      <div className="flex flex-col items-center text-center p-4">
                        <FileIcon className="w-16 h-16 text-primary" />
                        <span className="font-medium mt-4 text-lg">
                          {selectedFile.name}
                        </span>
                        <span className="text-muted-foreground">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-4 right-4 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            form.setValue("file", new File([], ""), {
                              shouldValidate: true,
                            });
                          }}
                        >
                          <X className="w-5 h-5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center">
                        <UploadCloud className="w-16 h-16 text-muted-foreground" />
                        <p className="text-2xl font-semibold mt-4">
                          Drag & drop files here
                        </p>
                        <p className="text-muted-foreground">
                          or click to select files
                        </p>
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* --- Tags Input (Unchanged) --- */}
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-lg">
                  Add Tags (comma-separated)
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., finance, report, q4"
                    className="h-12"
                    {...field}
                    disabled={isUploading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* --- Archive Policy Select (Unchanged) --- */}
          <FormField
            control={form.control}
            name="policy"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-lg">Archive Policy</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  disabled={isUploading}
                >
                  <FormControl>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select a retention policy" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="standard-7">
                      Standard Retention (7 years)
                    </SelectItem>
                    <SelectItem value="legal-hold-indefinite">
                      Legal Hold (Indefinite)
                    </SelectItem>
                    <SelectItem value="temp-1">Temporary (1 year)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* --- NEW: Progress Bar --- */}
          {isUploading && uploadProgress > 0 && (
            <div className="space-y-2">
              <FormLabel>Uploading large file...</FormLabel>
              <ProgressBar value={uploadProgress} />
              <p className="text-sm text-muted-foreground">
                {uploadProgress}% complete
              </p>
            </div>
          )}

          <Button type="submit" className="h-12 px-8" disabled={isUploading}>
            {isUploading
              ? uploadProgress > 0
                ? "Uploading..."
                : "Processing..."
              : "Start Upload"}
          </Button>
        </form>
      </Form>
    </div>
  );
}

// --- NEW: Simple Progress Bar Component ---
const ProgressBar = ({
  value,
  className,
}: {
  value: number;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "h-2 w-full rounded-full bg-muted overflow-hidden",
        className
      )}
    >
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
};