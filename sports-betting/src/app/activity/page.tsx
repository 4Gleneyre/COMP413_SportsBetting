'use client';

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Trade {
  id: string;
  amount: number;
  expectedPayout: number;
  selectedTeam: 'home' | 'visitor';
  status: string;
  createdAt: any;
  eventId: string;
  userId: string;
  user?: {
    displayName: string;
  };
  event?: {
    home_team: {
      full_name: string;
    };
    visitor_team: {
      full_name: string;
    };
  };
}

export default function ActivityPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrades() {
      try {
        // Query all trades, ordered by creation date
        const tradesQuery = query(
          collection(db, 'trades'),
          orderBy('createdAt', 'desc')
        );

        const tradesSnapshot = await getDocs(tradesQuery);
        const tradesData: Trade[] = [];

        // Fetch associated event and user data for each trade
        for (const tradeDoc of tradesSnapshot.docs) {
          const tradeData = tradeDoc.data() as Trade;
          
          // Fetch event details
          const eventDoc = await getDocs(query(
            collection(db, 'events'),
            where('__name__', '==', tradeData.eventId)
          ));

          // Fetch user details
          const userDoc = await getDocs(query(
            collection(db, 'users'),
            where('__name__', '==', tradeData.userId)
          ));
          tradesData.push({
            ...tradeData,
            id: tradeDoc.id,
            event: eventDoc.docs[0]?.data() as {
              home_team: { full_name: string };
              visitor_team: { full_name: string };
            },
            user: userDoc.docs[0]?.data() as { displayName: string }
          });
        }

        setTrades(tradesData);
      } catch (error) {
        console.error('Error fetching trades:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchTrades();
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h2 className="text-2xl font-bold mb-8">Activity Feed</h2>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-bold mb-8">Activity Feed</h2>
      
      {trades.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          No betting activity yet. Be the first to place a bet!
        </p>
      ) : (
        <div className="space-y-4">
          {trades.map((trade) => (
            <div
              key={trade.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold">
                    {trade.selectedTeam === 'home'
                      ? trade.event?.home_team.full_name
                      : trade.event?.visitor_team.full_name}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    vs {trade.selectedTeam === 'home'
                      ? trade.event?.visitor_team.full_name
                      : trade.event?.home_team.full_name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Placed by {trade.user?.displayName || 'Anonymous'}
                    {trade.userId === user?.uid && ' (You)'}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                    trade.status === 'Pending'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                      : trade.status === 'Won'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                  }`}>
                    {trade.status}
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Bet Amount: ${trade.amount}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  Potential Payout: ${trade.expectedPayout}
                </span>
              </div>
              <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                {trade.createdAt.toDate().toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 