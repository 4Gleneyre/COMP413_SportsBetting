'use client';

import { useAuth } from '@/contexts/AuthContext';
import UsernameSetupModal from './UsernameSetupModal';

export default function UsernameCheck() {
  const { user, needsUsername, loading } = useAuth();

  // Only show the modal if the user is logged in and needs a username
  if (loading || !user || !needsUsername) {
    return null;
  }

  return <UsernameSetupModal />;
} 