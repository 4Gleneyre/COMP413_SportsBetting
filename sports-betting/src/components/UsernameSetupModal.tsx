'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export default function UsernameSetupModal() {
  const { user, setUsername } = useAuth();
  const [inputUsername, setInputUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputUsername.trim()) {
      setError('Username cannot be empty');
      return;
    }
    
    // Username validation - alphanumeric and underscore only
    if (!/^[a-zA-Z0-9_]+$/.test(inputUsername)) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }
    
    // Check length
    if (inputUsername.length < 3 || inputUsername.length > 20) {
      setError('Username must be between 3 and 20 characters');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      if (!user || !user.uid) {
        throw new Error("User not authenticated");
      }
      
      // Call the Cloud Function to check username uniqueness
      const checkUsernameUnique = httpsCallable(functions, 'checkUsernameUnique');
      const result = await checkUsernameUnique({ username: inputUsername });
      const { isUnique } = result.data as { isUnique: boolean };
      
      if (!isUnique) {
        setError('Username already taken. Please choose another one.');
        setIsSubmitting(false);
        return;
      }

      // If not taken, proceed to set the username
      await setUsername(inputUsername);
    } catch (error) {
      setError('Failed to set username. Please try again.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-2xl font-bold mb-6">Set Up Your Username</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Choose a username to use on the platform. This will be visible to other users.
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={inputUsername}
              onChange={(e) => setInputUsername(e.target.value)}
              className="w-full p-3 border rounded-lg bg-transparent text-black dark:text-white border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
              placeholder="Enter a username"
              disabled={isSubmitting}
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
          
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Setting up...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
} 