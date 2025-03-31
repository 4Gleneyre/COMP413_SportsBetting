'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  username: string | null;
  needsUsername: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  setUsername: (username: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsernameState] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Check if user document exists
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        // If user document doesn't exist, create it
        if (!userDoc.exists()) {
          await setDoc(userDocRef, {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            walletBalance: 0,
            trades: [],
            createdAt: new Date(),
            lifetimePnl: 0,
            username: null
          });
          setNeedsUsername(true);
        } else {
          // Check if username exists in the document
          const userData = userDoc.data();
          if (!userData.username) {
            setNeedsUsername(true);
          } else {
            setUsernameState(userData.username);
            setNeedsUsername(false);
          }
        }
      }
      setUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUsernameState(null);
      setNeedsUsername(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const setUsername = async (username: string) => {
    if (!user) return;
    
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { username });
      setUsernameState(username);
      setNeedsUsername(false);
    } catch (error) {
      console.error('Error setting username:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      username, 
      needsUsername,
      signInWithGoogle, 
      logout,
      setUsername 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 