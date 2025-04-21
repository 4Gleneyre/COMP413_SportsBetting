'use client';

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { usePathname } from 'next/navigation';
import Image from "next/image";

export function Navbar() {
  const { user, username, signInWithGoogle, logout } = useAuth();
  const pathname = usePathname();

  const getLinkClassName = (path: string) => {
    return `${
      pathname === path ? 'text-white font-bold' : 'text-gray-300'
    } hover:text-white transition-colors font-medium`;
  };

  return (
    <header className="bg-gray-900 text-white p-4 shadow-md">
      <div className="container mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center hover:opacity-90 transition-opacity">
          <Image src="/logo.png" alt="Meiyundong Logo" width={180} height={60} className="rounded-md" priority />
        </Link>
        
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6">
            <Link 
              href="/for-you" 
              className={getLinkClassName('/for-you')}
            >
              For You
            </Link>
            <Link 
              href="/events" 
              className={getLinkClassName('/events')}
            >
              Events
            </Link>
            <Link 
              href="/activity" 
              className={getLinkClassName('/activity')}
            >
              Activity
            </Link>
            <Link 
              href="/trending" 
              className={getLinkClassName('/trending')}
            >
              Trending
            </Link>
            <Link 
              href="/leaderboard" 
              className={getLinkClassName('/leaderboard')}
            >
              Leaderboard
            </Link>
            {user && (
              <Link 
                href={`/profile?userId=${user.uid}`} 
                className={getLinkClassName('/profile')}
              >
                Profile
              </Link>
            )}
          </nav>
          
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-gray-800">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.photoURL || undefined} alt={username || user.displayName || 'User'} />
                    <AvatarFallback>{username?.[0] || user.displayName?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {username && (
                  <div className="px-2 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
                    @{username}
                  </div>
                )}
                <Link href={`/profile?userId=${user.uid}`}>
                  <DropdownMenuItem className="cursor-pointer">
                    Profile
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuItem className="cursor-pointer">
                  Privacy Policy
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  Terms & Conditions
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onClick={logout}>
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              className="bg-gray-800 text-white hover:bg-gray-700 border-gray-700"
              onClick={signInWithGoogle}
            >
              Sign in with Google
            </Button>
          )}
        </div>
      </div>
    </header>
  );
} 