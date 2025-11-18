"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import axios from "axios";
import api from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Define Zod schema for the profile form
const profileFormSchema = z.object({
  displayName: z.string().max(50, { message: "Display name must be 50 characters or less." }).optional(),
  email: z.string().email(),
});

export default function SettingsPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = React.useState(true);
  const [profilePictureUrl, setProfilePictureUrl] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const profileForm = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: "",
      email: "",
    },
  });

  // Fetch user profile data on component mount
  React.useEffect(() => {
    async function fetchProfile() {
      setIsLoading(true);
      try {
        const response = await api.get("/user/me");
        profileForm.reset({
          displayName: response.data.displayName || "",
          email: response.data.email || "",
        });
        const initialUrl = response.data.profilePictureUrl;
        if (initialUrl) {
          setProfilePictureUrl(`${initialUrl}?v=${new Date().getTime()}`);
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        toast({
          variant: "destructive",
          title: "Failed to load profile",
          description: "Could not fetch your profile data. Please try again later.",
        });
      } finally {
        setIsLoading(false);
      }
    }
    fetchProfile();
  }, [profileForm, toast]);

  // Handle profile form submission
  async function onProfileSubmit(values: z.infer<typeof profileFormSchema>) {
    try {
      await api.put("/user/profile", {
        displayName: values.displayName,
      });
      toast({
        title: "Profile Updated",
        description: "Your display name has been successfully updated.",
      });
    } catch (error) {
      let errorMessage = "An unknown error occurred.";
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data?.error || error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: errorMessage,
      });
    }
  }

  // Handle profile picture upload
  async function handlePictureUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);

    try {
      const response = await api.post("/user/profile-picture", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newUrl = response.data.url;
      setProfilePictureUrl(`${newUrl}?v=${new Date().getTime()}`);
      toast({
        title: "Profile Picture Updated",
        description: "Your new profile picture has been saved.",
      });
    } catch (error) {
      let errorMessage = "An unknown error occurred.";
      if (axios.isAxiosError(error) && error.response) {
        errorMessage = error.response.data?.error || error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: errorMessage,
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings, preferences, and data usage.
        </p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="data-usage">Data Usage</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)}>
              <Card>
                <CardHeader>
                  <CardTitle>Profile</CardTitle>
                  <CardDescription>
                    This is how others will see you on the site.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {isLoading ? (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-4">
                        <Skeleton className="h-16 w-16 rounded-full" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-[250px]" />
                          <Skeleton className="h-4 w-[200px]" />
                        </div>
                      </div>
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center space-x-4">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={profilePictureUrl || undefined} alt="Profile picture" />
                          <AvatarFallback>
                            {profileForm.getValues("displayName")?.charAt(0) || profileForm.getValues("email")?.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <Label htmlFor="picture" className="cursor-pointer font-semibold text-primary hover:underline">
                            {isUploading ? "Uploading..." : "Change Picture"}
                          </Label>
                          <p className="text-xs text-muted-foreground">JPG, GIF or PNG. 1MB max.</p>
                          <Input id="picture" type="file" className="hidden" onChange={handlePictureUpload} disabled={isUploading} />
                        </div>
                      </div>

                      <FormField
                        control={profileForm.control}
                        name="displayName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Display Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your display name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={profileForm.getValues("email")} disabled />
                        <p className="text-xs text-muted-foreground">Your email address cannot be changed here.</p>
                      </div>
                    </>
                  )}
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isLoading || isUploading}>
                    {isLoading ? "Saving..." : "Save Changes"}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </Form>
        </TabsContent>

        {/* Account Tab (Placeholder) */}
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Manage your account settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input id="current-password" type="password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" />
              </div>
            </CardContent>
            <CardFooter>
              <Button>Update Password</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Notifications Tab (Placeholder) */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Configure how you receive notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center space-x-2">
                    <Checkbox id="email-notifications" defaultChecked />
                    <Label htmlFor="email-notifications">
                        Receive email notifications for important account activity.
                    </Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Checkbox id="newsletter" />
                    <Label htmlFor="newsletter">
                        Subscribe to our newsletter.
                    </Label>
                </div>
            </CardContent>
            <CardFooter>
              <Button>Save Preferences</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Data Usage Tab (Placeholder) */}
        <TabsContent value="data-usage">
          <Card>
            <CardHeader>
              <CardTitle>Data Usage</CardTitle>
              <CardDescription>
                View your current data usage statistics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Storage Used:</span>
                    <span>1.2 GB / 5 GB</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-muted-foreground">Files Archived:</span>
                    <span>125</span>
                </div>
                 <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Upload:</span>
                    <span>2025-11-08</span>
                </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
