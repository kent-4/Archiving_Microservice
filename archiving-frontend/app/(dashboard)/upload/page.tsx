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
import { cn } from "@/lib/utils";

// 1. Define the validation schema
const formSchema = z.object({
  tags: z.string().optional(),
  policy: z.string().min(1, "Please select an archive policy."),
  file: z
    .instanceof(File)
    .refine((file) => file.size > 0, "Please select a file to upload.")
    // We can add the size validation from your backend here too
    .refine(
      (file) => file.size <= 25 * 1024 * 1024, // 25MB
      `File size must be 25MB or less.`
    ),
});

type FormSchema = z.infer<typeof formSchema>;

export default function UploadPage() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

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

    // We must use FormData to send a file
    const formData = new FormData();
    formData.append("file", values.file);
    formData.append("tags", values.tags || "");
    formData.append("policy", values.policy);

    try {
      // Call the backend /archive endpoint
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
    } finally {
      setIsUploading(false);
    }
  }

  // --- File Input Handlers ---
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
          {/* --- File Dropzone --- */}
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
                    {/* Hidden actual file input */}
                    <input
                      id="file-input"
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={isUploading}
                    />

                    {selectedFile ? (
                      // Show selected file
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
                            e.stopPropagation(); // Prevent re-opening file dialog
                            form.setValue("file", new File([], ""), {
                              shouldValidate: true,
                            });
                          }}
                        >
                          <X className="w-5 h-5" />
                        </Button>
                      </div>
                    ) : (
                      // Show dropzone prompt
                      <div className="flex flex-col items-center justify-center text-center">
                        <UploadCloud className="w-16 h-16 text-muted-foreground" />
                        <p className="text-2xl font-semibold mt-4">
                          Drag & drop files here
                        </p>
                        <p className="text-muted-foreground">
                          or click to select files
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          (Max 25MB per file)
                        </p>
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* --- Tags Input --- */}
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

          {/* --- Archive Policy Select --- */}
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

          <Button type="submit" className="h-12 px-8" disabled={isUploading}>
            {isUploading ? "Uploading..." : "Start Upload"}
          </Button>
        </form>
      </Form>
    </div>
  );
}