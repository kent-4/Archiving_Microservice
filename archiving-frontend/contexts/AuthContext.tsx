// In contexts/AuthContext.tsx

"use client";

import { createContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

interface User {
  email: string;
}

interface AuthContextType {
  user: User | null;
  // token: string | null; // <-- 1. We no longer store the token
  login: (user: User) => void; // <-- 2. Login just takes a user
  logout: () => void;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  // const [token, setToken] = useState<string | null>(null); // <-- 3. Remove token state
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Try to load user from localStorage on initial load
    try {
      // 4. We only check for the user now
      // The cookie's existence is checked by the server
      const storedUser = localStorage.getItem("user");
      
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      localStorage.removeItem("user");
    }
    setIsLoading(false);
  }, []);

  // 5. Update login function
  const login = (newUser: User) => {
    // The cookie is already set by the backend
    setUser(newUser);
    localStorage.setItem("user", JSON.stringify(newUser));
    router.push("/dashboard");
  };

  // 6. Update logout function
  const logout = async () => {
    try {
      // Call the new backend logout endpoint
      await api.post("/auth/logout"); 
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      // Always clear frontend state
      setUser(null);
      localStorage.removeItem("user");
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};