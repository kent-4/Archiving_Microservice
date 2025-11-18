"use client";

import { Bell, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface User {
  email: string;
}

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
}

export default function Header({ user, onLogout }: HeaderProps) {
  // Get first letter for Avatar fallback
 const fallbackLetter = user?.email?.[0]?.toUpperCase() || "A";

  return (
    <header className="flex h-16 items-center justify-end gap-4 border-b border-border bg-muted/20 px-6">
      <Button variant="ghost" size="icon">
        <Bell className="h-5 w-5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar className="h-10 w-10">
              {/* <AvatarImage src="/path-to-user-image.jpg" alt={user?.email} /> */}
              <AvatarFallback className="text-lg">
                {fallbackLetter}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="font-medium">Admin User</div>
            <div className="text-xs font-normal text-muted-foreground">
              {user?.email}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onLogout}
            className="cursor-pointer text-red-500"
          >
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}