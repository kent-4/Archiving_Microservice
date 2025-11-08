"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { FaRegUserCircle } from "react-icons/fa"; // Using react-icons

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast"; // For showing errors
import { useAuth } from "@/hooks/useAuth"; // Our auth context
import api from "@/lib/api";
import axios from "axios";

// 1. Define the form validation schema
const formSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  password: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
  remember: z.boolean().default(false).optional(),
});

export default function LoginPage() {
  const { toast } = useToast();
  const auth = useAuth();
  const [isLoading, setIsLoading] = React.useState(false);

  // 2. Define the form
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "demo@example.com", // From mockup
      password: "••••••••",       // From mockup
      remember: true,
    },
  });

  // 3. Define the submit handler
  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const response = await api.post("/auth/login", {
        email: values.email,
        password: values.password,
      });

      // --- 1. UPDATE LOGIN CALL ---
      // We only get the user now, the cookie is set automatically
      const { user } = response.data;
      auth.login(user); // Pass the user object to the context
      // --- END UPDATE ---

      toast({
        title: "Login Successful",
        description: `Welcome back, ${user.email}!`,
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
        title: "Login Failed",
        description: errorMessage,
      });
      setIsLoading(false);
    }
  }

  // 4. Build the JSX
  return (
    <Card className="w-full max-w-md border-border">
      <CardHeader className="text-center">
        <div className="mb-4 text-center text-4xl text-primary">
          Archiving Microservice
        </div>
        <CardTitle className="text-3xl font-bold">Welcome Back</CardTitle>
        <CardDescription>Please sign in to your account</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex w-full justify-center pb-6">
          <FaRegUserCircle className="h-20 w-20 text-muted-foreground" />
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="demo@example.com"
                      {...field}
                      className="h-12"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      {...field}
                      className="h-12"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center justify-between">
              <FormField
                control={form.control}
                name="remember"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Remember me</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
              <Link
                href="#"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Button
              type="submit"
              className="w-full h-12 text-lg"
              disabled={isLoading}
            >
              {isLoading ? "Signing In..." : "Sign In"}
            </Button>
          </form>
        </Form>
        <div className="mt-6 flex justify-between text-sm text-muted-foreground">
          <Link href="#" className="hover:text-primary">
            Privacy Policy
          </Link>
          <Link href="#" className="hover:text-primary">
            Terms of Service
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}