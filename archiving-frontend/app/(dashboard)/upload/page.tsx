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
import JSZip from "jszip"; // <-- ADD THIS
import { Folder } from "lucide-react"; // <-- ADD THIS
// --- UPDATED: Define limits ---
const SMALL_FILE_LIMIT = 25 * 1024 * 1024; // 25MB
const MULTIPART_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

// 1. UPDATED schema: Remove the size limit. We now handle it in logic.
// 1. UPDATED schema: Accept a FileList for folder uploads.
const formSchema = z.object({
  tags: z.string().optional(),
  policy: z.string().min(1, "Please select an archive policy."),
  files: z // <-- Rename 'file' to 'files'
    .instanceof(FileList)
    .refine((files) => files.length > 0, "Please select a file or folder."),
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
  // 2. Define the form
  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tags: "",
      policy: "standard-7",
      files: undefined, // <-- Use 'files'
    },
  });

  const selectedFiles = form.watch("files"); // <-- Rename to 'selectedFiles'

  // 3. Define the submit handler
  // 3. Define the submit handler (UPDATED FOR CLIENT-SIDE ZIPPING)
  async function onSubmit(values: FormSchema) {
    setIsUploading(true);
    setUploadProgress(0); // We'll use this for zipping progress

    const { files, tags, policy } = values;

    // --- 1. Create the Zip File in the Browser ---
    const zip = new JSZip();
    let folderName = "archive"; // Default name
    
    // Check if it's a folder upload by looking at the relative path
    const isFolder = files[0].webkitRelativePath;
    if (isFolder) {
      folderName = files[0].webkitRelativePath.split('/')[0];
    }

    toast({
      title: "Processing Files",
      description: `Zipping ${files.length} files... Please wait.`,
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Use webkitRelativePath to preserve folder structure, otherwise just use name
      const path = file.webkitRelativePath || file.name;
      zip.file(path, file);
      
      // Update progress bar based on zipping progress
      setUploadProgress(Math.round(((i + 1) / files.length) * 100));
    }

    // --- 2. Generate the Zip Blob ---
    let zipBlob: Blob;
    try {
      zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: {
          level: 6, // A good balance of speed and compression
        },
      });
    } catch (err) {
      console.error("Failed to generate zip:", err);
      toast({
        variant: "destructive",
        title: "Zipping Failed",
        description: "Could not create zip file on the client.",
      });
      setIsUploading(false);
      setUploadProgress(0);
      return;
    }
    
    // Create a File object from the Blob
    const zipFile = new File([zipBlob], `${folderName}.zip`, {
      type: "application/zip",
    });

    // --- 3. Upload the *Single Zip File* ---
    setUploadProgress(0); // Reset progress for upload
    let success = false;
    let errorMessage = "An unknown error occurred.";

    try {
      if (zipFile.size <= SMALL_FILE_LIMIT) {
        // Use small file handler for the zip
        toast({ title: "Uploading Zip File...", description: `Total size: ${(zipFile.size / (1024*1024)).toFixed(2)} MB` });
        await handleSmallFileUpload(zipFile, tags, policy);
      } else {
        // Use large file handler for the zip
        // The large file handler will set its own progress
        await handleLargeFileUpload(zipFile, tags, policy);
      }
      success = true;

    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data?.error || error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
    }

    // --- 4. Show Final Status ---
    if (success) {
      toast({
        title: "Upload Successful",
        description: `Your upload "${zipFile.name}" has been archived.`,
      });
      // Reset form
      form.reset();
      form.setValue("policy", "standard-7");
      const fileInput = document.getElementById("file-input") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
    } else {
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: errorMessage,
      });
    }

    setIsUploading(false);
    setUploadProgress(0);
  }

  // --- 4. Handler for SMALL files (REFACTORED) ---
  // This function now just uploads the single file it's given
  async function handleSmallFileUpload(
    file: File,
    tags: string | undefined,
    policy: string
  ) {
    const formData = new FormData();
    formData.append("file", file); // <-- This will be the zip file
    formData.append("tags", tags || "");
    formData.append("policy", policy);

    // Note: This returns a promise, which the onSubmit handler will await.
    return api.post("/archive", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  }

  // --- 5. Handler for LARGE files (REFACTORED) ---
  // This function now just uploads the single file it's given
  async function handleLargeFileUpload(
    file: File, // <-- This will be the zip file
    tags: string | undefined,
    policy: string
  ) {
    let uploadId = "";

    try {
      // Step 1: Start the multipart upload
      const startRes = await api.post("/archive/start-upload", {
        filename: file.name,
      });
      uploadId = startRes.data.uploadId;

      const totalParts = Math.ceil(file.size / MULTIPART_CHUNK_SIZE);
      const uploadedParts: UploadedPart[] = [];

      for (let i = 0; i < totalParts; i++) {
        const partNumber = i + 1;
        const start = i * MULTIPART_CHUNK_SIZE;
        const end = (i + 1) * MULTIPART_CHUNK_SIZE;
        const chunk = file.slice(start, end);

        // Step 2: Get the pre-signed URL for this part
        const partUrlRes = await api.post("/archive/get-upload-part-url", {
          filename: file.name,
          uploadId: uploadId,
          partNumber: partNumber,
        });
        const presignedUrl = partUrlRes.data.url;

        // Step 3: Upload the chunk directly to S3
        const uploadResponse = await fetch(presignedUrl, {
          method: "PUT",
          body: chunk,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error("S3 Upload Error Response:", errorText);
          throw new Error(
            `S3 upload failed for part ${partNumber} with status ${uploadResponse.status}`
          );
        }

        const etag = uploadResponse.headers.get("ETag")?.replace(/"/g, "");
        if (!etag) {
          throw new Error(
            `ETag not found in S3 response for part ${partNumber}`
          );
        }

        uploadedParts.push({ ETag: etag, PartNumber: partNumber });
        
        // Update progress
        setUploadProgress(Math.round((partNumber / totalParts) * 100));
      }

      // Step 4: Complete the upload
      // This returns a promise, which the onSubmit handler will await.
      return api.post("/archive/complete-upload", {
        filename: file.name,
        uploadId: uploadId,
        parts: uploadedParts,
        tags: tags || "",
        policy: policy,
        fileSize: file.size,
        contentType: file.type || "application/octet-stream",
      });
    } catch (error) {
      console.error(`Large file upload failed for ${file.name}:`, error);
      // Re-throw the error so the onSubmit loop can catch it
      throw error;
    }
  }

  // --- File Input Handlers (Unchanged) ---
  // --- File Input Handlers (UPDATED) ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files; // <-- Get the whole list
    if (fileList && fileList.length > 0) {
      form.setValue("files", fileList, { shouldValidate: true });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const fileList = e.dataTransfer.files; // <-- Get the whole list
    if (fileList && fileList.length > 0) {
      form.setValue("files", fileList, { shouldValidate: true });
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
          {/* --- File Dropzone (THIS IS THE CORRECTED PART) --- */}
          <FormField
            control={form.control}
            name="files"
            render={() => (
              <FormItem>
                <FormControl>
                  {/* This is the div you pasted, now in the right place */}
                  <div
                    className={cn(
                      "relative flex flex-col items-center justify-center w-full h-64 border-2 border-border border-dashed rounded-lg bg-muted/20 transition-colors",
                      dragActive && "border-primary bg-primary/10",
                      !isUploading && "cursor-pointer" // Keep pointer cursor
                    )}
                    onDragOver={(e) => handleDrag(e, true)}
                    onDragLeave={(e) => handleDrag(e, false)}
                    onDragEnd={(e) => handleDrag(e, false)}
                    onDrop={handleDrop}
                    // Main onClick is removed from here
                  >
                    {/* Your two hidden inputs are correct */}
                    <input
                      id="file-input"
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isUploading}
                      multiple
                    />
                    <input
                      id="folder-input"
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isUploading}
                      multiple
                      webkitdirectory="true"
                    />

                    {selectedFiles && selectedFiles.length > 0 ? (
                      // Your "Selected Files" UI is perfect
                      <div className="flex flex-col items-center text-center p-4">
                        {selectedFiles[0].webkitRelativePath ? (
                          <Folder className="w-16 h-16 text-primary" />
                        ) : (
                          <FileIcon className="w-16 h-16 text-primary" />
                        )}
                        <span className="font-medium mt-4 text-lg">
                          {selectedFiles.length} file(s) selected
                        </span>
                        <span className="text-muted-foreground">
                          {(
                            Array.from(selectedFiles).reduce(
                              (acc, file) => acc + file.size,
                              0
                            ) / (1024 * 1024)
                          ).toFixed(2)}{" "}
                          MB Total
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-4 right-4 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Reset both inputs
                            const fileInput = document.getElementById("file-input") as HTMLInputElement;
                            if (fileInput) fileInput.value = "";
                            const folderInput = document.getElementById("folder-input") as HTMLInputElement;
                            if (folderInput) folderInput.value = "";
                            
                            form.setValue("files", new DataTransfer().files, {
                              shouldValidate: true,
                            });
                          }}
                        >
                          <X className="w-5 h-5" />
                        </Button>
                      </div>
                    ) : (
                      // This is the NEW UI for the empty state
                      <div className="flex flex-col items-center justify-center text-center">
                        <UploadCloud className="w-16 h-16 text-muted-foreground" />
                        <p className="text-2xl font-semibold mt-4">
                          Drag & drop files or folders
                        </p>
                        <p className="text-muted-foreground mt-2">
                          or use the buttons below
                        </p>
                        <div className="flex gap-4 mt-6">
                          <Button
                            type="button"
                            onClick={() =>
                              document.getElementById("file-input")?.click()
                            }
                            disabled={isUploading}
                          >
                            Select Files
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              document.getElementById("folder-input")?.click()
                            }
                            disabled={isUploading}
                          >
                            Select Folder
                          </Button>
                        </div>
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