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
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Top Performers</h1>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rank</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total P&L</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Win Rate</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Bets</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user, index) => (
              <tr 
                key={user.id} 
                className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                ref={index === users.length - 1 ? lastElementRef : null}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {index + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.username}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${user.totalPnL.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.totalBets > 0 ? `${(user.winRate * 100).toFixed(1)}%` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {user.totalBets}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isFetchingMore && (
        <div className="flex justify-center items-center p-4">
          <p className="text-gray-500">Loading more users...</p>
        </div>
      )}
      {!hasMore && users.length > 0 && (
        <div className="flex justify-center items-center p-4">
          <p className="text-gray-500">No more users to display</p>
        </div>
      )}
    </div>
  );
}
