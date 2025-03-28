'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

interface UserStats {
  id: string;
  username: string;
  totalPnL: number;
  winRate: number;
  totalBets: number;
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  
  // Reference to the last element for infinite scrolling
  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLTableRowElement | null) => {
    if (isFetchingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchMoreUsers();
      }
    });
    
    if (node) observer.current.observe(node);
  }, [isFetchingMore, hasMore]);

  // Fetch initial leaderboard data
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const getLeaderboard = httpsCallable(functions, 'getLeaderboard');
      const response = await getLeaderboard({ pageSize: 10 });
      
      // Type assertion to access the data from Firebase Functions
      const data = response.data as { users: UserStats[], hasMore: boolean };
      
      setUsers(data.users);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMoreUsers = async () => {
    if (!hasMore || isFetchingMore || users.length === 0) return;
    
    try {
      setIsFetchingMore(true);
      
      // Get the last user's PnL and ID for pagination
      const lastUser = users[users.length - 1];
      
      const getLeaderboard = httpsCallable(functions, 'getLeaderboard');
      const response = await getLeaderboard({ 
        pageSize: 10,
        lastPnL: lastUser.totalPnL,
        lastUserId: lastUser.id
      });
      
      // Type assertion to access the data
      const data = response.data as { users: UserStats[], hasMore: boolean };
      
      setUsers(prev => [...prev, ...data.users]);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Error fetching more users:', error);
    } finally {
      setIsFetchingMore(false);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h2 className="text-2xl font-bold mb-8">Top Performers</h2>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-bold mb-4">Top Performers</h2>
      
      <div className="flex justify-between items-center mb-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-4">
          <div className="w-8">Rank</div>
          <div>Trader</div>
        </div>
        <div className="text-right">
          Profit & Loss
        </div>
      </div>
      
      <div className="space-y-2">
        {users.map((user, index) => (
          <div
            key={user.id}
            ref={index === users.length - 1 ? lastElementRef : null}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between hover:border-gray-300 dark:hover:border-gray-600 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold">
                {index + 1}
              </div>
              <div>
                <h3 className="font-semibold">{user.username}</h3>
                <div className="flex gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span>{user.totalBets} bets</span>
                  <span>{(user.winRate * 100).toFixed(1)}% win rate</span>
                </div>
              </div>
            </div>
            <div className={`text-lg font-bold ${
              user.totalPnL > 0 
                ? 'text-green-600 dark:text-green-400' 
                : user.totalPnL < 0 
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-600 dark:text-gray-400'
            }`}>
              ${user.totalPnL.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {isFetchingMore && (
        <div className="animate-pulse space-y-2 mt-2">
          {[1, 2].map((i) => (
            <div key={`loading-${i}`} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      )}
      
      {!hasMore && users.length > 0 && (
        <div className="text-center text-gray-500 dark:text-gray-400 mt-6">
          No more users to display
        </div>
      )}
    </div>
  );
}
