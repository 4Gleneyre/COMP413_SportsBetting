'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { Event } from '@/types/events';
import Image from 'next/image';

interface Trade {
  id: string;
  amount: number;
  expectedPayout: number;
  createdAt: Timestamp;
  eventId: string;
  selectedTeam: 'home' | 'visitor';
  status: string;
  userId: string;
  event?: Event;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function TeamLogo({ abbreviation, teamName }: { abbreviation: string; teamName: string }) {
  const [imageExists, setImageExists] = useState(true);

  useEffect(() => {
    fetch(`/logos/${abbreviation}.png`)
      .then(res => {
        if (!res.ok) {
          setImageExists(false);
        }
      })
      .catch(() => setImageExists(false));
  }, [abbreviation]);

  if (!imageExists) {
    return null;
  }

  return (
    <Image
      src={`/logos/${abbreviation}.png`}
      alt={`${teamName} logo`}
      width={32}
      height={32}
      className="rounded-full"
    />
  );
}

export default function ProfilePage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Add debug log for trades state changes
  useEffect(() => {
    console.log('Trades state updated:', trades);
  }, [trades]);

  useEffect(() => {
    async function fetchTrades() {
      if (!user) {
        console.log('No user found, skipping trade fetch');
        setLoading(false);
        return;
      }

      try {
        console.log('Fetching trades for user:', user.uid);
        
        // Get user document to get trade IDs
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          console.log('User document not found in Firestore');
          setLoading(false);
          return;
        }

        const userTrades = userDoc.data().trades || [];
        console.log('Found trade IDs:', userTrades);
        
        // Fetch all trades
        const tradesData: Trade[] = [];
        for (const tradeId of userTrades) {
          console.log('Fetching trade:', tradeId);
          const tradeDoc = await getDoc(doc(db, 'trades', tradeId));
          
          if (tradeDoc.exists()) {
            const tradeData = tradeDoc.data() as Omit<Trade, 'id'>;
            console.log('Trade data found:', tradeData);
            
            // Fetch associated event
            console.log('Fetching event:', tradeData.eventId);
            const eventDoc = await getDoc(doc(db, 'events', tradeData.eventId));
            const eventData = eventDoc.exists() ? eventDoc.data() as Event : undefined;
            
            if (eventData) {
              console.log('Event data found for trade');
            } else {
              console.log('No event data found for trade');
            }

            tradesData.push({
              id: tradeDoc.id,
              ...tradeData,
              createdAt: tradeData.createdAt,
              event: eventData
            });
          } else {
            console.log('Trade document not found:', tradeId);
          }
        }

        console.log('Final trades data:', tradesData);
        // Sort trades by date (newest first)
        tradesData.sort((a, b) => b.createdAt.toDate().getTime() - a.createdAt.toDate().getTime());
        setTrades(tradesData);
      } catch (error) {
        console.error('Error fetching trades:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchTrades();
  }, [user]);

  // Add debug logs in the render logic
  if (!user) {
    console.log('Rendering: No user view');
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Profile</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Please sign in to view your profile and trade history.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    console.log('Rendering: Loading view');
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h2 className="text-2xl font-bold mb-8">Your Trade History</h2>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  console.log('Rendering: Main view, trades length:', trades.length);
  
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Your Profile</h2>
        <div className="mt-4 flex items-center gap-4">
          {user.photoURL && (
            <Image
              src={user.photoURL}
              alt={user.displayName || 'User'}
              width={64}
              height={64}
              className="rounded-full"
            />
          )}
          <div>
            <p className="text-lg font-semibold">{user.displayName}</p>
            <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
          </div>
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-6">Trade History</h3>
      {trades.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <p className="text-gray-500 dark:text-gray-400">
            You haven't placed any trades yet.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {trades.map((trade) => {
            console.log('Rendering trade:', trade);
            return (
              <div
                key={trade.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    {trade.event && (
                      <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded-lg">
                        <TeamLogo
                          abbreviation={trade.selectedTeam === 'home' 
                            ? trade.event.home_team.abbreviation 
                            : trade.event.visitor_team.abbreviation}
                          teamName={trade.selectedTeam === 'home'
                            ? trade.event.home_team.full_name
                            : trade.event.visitor_team.full_name}
                        />
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-lg">
                        {trade.event
                          ? (trade.selectedTeam === 'home'
                            ? trade.event.home_team.full_name
                            : trade.event.visitor_team.full_name)
                          : 'Unknown Team'}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {trade.createdAt.toDate().toLocaleDateString(undefined, {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Bet Amount:</span>
                        <span className="font-semibold">{formatCurrency(trade.amount)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Expected Payout:</span>
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          {formatCurrency(trade.expectedPayout)}
                        </span>
                      </div>
                    </div>
                    <p className={`text-sm font-medium px-3 py-1 rounded-full inline-block ${
                      trade.status === 'pending' 
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : trade.status === 'won'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {trade.status.charAt(0).toUpperCase() + trade.status.slice(1)}
                    </p>
                  </div>
                </div>
                {trade.event && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    {trade.event.home_team.full_name} vs {trade.event.visitor_team.full_name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 