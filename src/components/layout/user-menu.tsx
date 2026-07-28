'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings } from 'lucide-react';
import { useState } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { DEFAULT_LOGIN_PATH } from '@/lib/auth/constants';

function getUserInitials(displayName: string | null, email: string | null): string {
  const name = displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
    }

    return name.slice(0, 2).toUpperCase();
  }

  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return 'U';
}

export function UserMenu() {
  const router = useRouter();
  const { user, isLoading, signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const displayName = user?.displayName?.trim() || 'Signed-in user';
  const email = user?.email ?? 'Not signed in';
  const initials = getUserInitials(user?.displayName ?? null, user?.email ?? null);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await signOut();
      router.push(DEFAULT_LOGIN_PATH);
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="User menu"
      >
        <Avatar>
          <AvatarFallback>{isLoading ? '…' : initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{isLoading ? 'Loading…' : displayName}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {isLoading ? 'Loading…' : email}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={isLoading || isSigningOut} onClick={handleSignOut}>
            <LogOut />
            {isSigningOut ? 'Signing out…' : 'Log out'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
