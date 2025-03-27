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

export function Navbar() {
  const { user, signInWithGoogle, logout } = useAuth();
  const pathname = usePathname();

  const getLinkClassName = (path: string) => {
    return `${
      pathname === path ? 'text-white font-bold' : 'text-gray-300'
    } hover:text-white transition-colors font-medium`;
  };

  return (
    <header className="bg-gray-900 text-white p-4 shadow-md">
      <div className="container mx-auto flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold hover:text-gray-200 transition-colors">
          Sports Betting
        </Link>
        
        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6">
            <Link 
              href="/" 
              className={getLinkClassName('/')}
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
              href="/leaderboard" 
              className={getLinkClassName('/leaderboard')}
            >
              Leaderboard
            </Link>
            {user && (
              <Link 
                href="/profile" 
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
                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} />
                    <AvatarFallback>{user.displayName?.[0] || 'U'}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <Link href="/profile">
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