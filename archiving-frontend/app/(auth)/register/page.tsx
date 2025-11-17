"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FaRegUserCircle } from "react-icons/fa";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export default function RegisterPage() {
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      await api.post("/auth/register", {
        email: values.email,
        password: values.password,
      });

      toast({
        title: "Registration Successful",
        description: "You can now log in with your new account.",
      });

      router.push("/login");

    } catch (error) {
      console.error("Registration failed:", error);
      let errorMessage = "An unknown error occurred.";
      if (axios.isAxiosError(error) && error.response) {
          errorMessage = error.response.data?.error || error.message;
      } else if (error instanceof Error) {
          errorMessage = error.message;
      }
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-border">
      <CardHeader className="text-center">
        <div className="mb-4 text-center text-4xl text-primary">
          Archiving Microservice
        </div>
        <CardTitle className="text-3xl font-bold">Create an Account</CardTitle>
        <CardDescription>Enter your details to get started.</CardDescription>
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
                    <Input placeholder="name@example.com" {...field} className="h-12" />
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
                    <Input type="password" placeholder="Password" {...field} className="h-12" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Input type="password" placeholder="Confirm Password" {...field} className="h-12" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full h-12 text-lg" disabled={isLoading}>
              {isLoading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </Form>
        <div className="mt-6 text-center text-sm">
          <span className="text-muted-foreground">Already have an account? </span>
          <Link href="/login" className="text-primary hover:underline">
            Log In
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
