'use client';

import { useAuth } from "@/contexts/AuthContext";

export default function ActivityPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Activity</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Please sign in to view your activity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-bold mb-8">Your Activity</h2>
    </div>
  );
} 