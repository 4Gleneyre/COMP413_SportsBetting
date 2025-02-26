'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
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

interface UserData {
  trades: string[];
  walletBalance: number;
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

function AddFundsModal({ 
  isOpen, 
  onClose, 
  onAddFunds 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAddFunds: (amount: number) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount');
      setIsLoading(false);
      return;
    }

    if (numAmount > 1000) {
      setError('Maximum amount allowed is $1,000');
      setIsLoading(false);
      return;
    }

    try {
      await onAddFunds(numAmount);
      onClose();
      setAmount('');
    } catch (err) {
      console.error('Error in modal while adding funds:', err);
      setError('Failed to add funds. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-bold mb-4">Add Funds to Wallet</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="amount" className="block text-sm font-medium mb-2">
              Amount (USD) - Max $1,000
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                placeholder="0.00"
                step="0.01"
                min="0"
                max="1000"
              />
            </div>
          </div>
          {error && (
            <p className="text-red-500 text-sm mb-4">{error}</p>
          )}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Funds'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function formatFullDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

export default function ProfilePage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const { user } = useAuth();
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false);

  // Add debug log for trades state changes
  useEffect(() => {
    console.log('Trades state updated:', trades);
  }, [trades]);

  useEffect(() => {
    async function fetchUserData() {
      if (!user) {
        console.log('No user found, skipping data fetch');
        setLoading(false);
        return;
      }

      try {
        console.log('Fetching user data for:', user.uid);
        
        // Get user document
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          console.log('User document not found in Firestore');
          setLoading(false);
          return;
        }

        const userData = userDoc.data() as UserData;
        setWalletBalance(userData.walletBalance || 0);
        
        const userTrades = userData.trades || [];
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
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [user]);

  const handleAddFunds = async (amount: number) => {
    if (!user) {
      console.error('No user found when trying to add funds');
      throw new Error('User not found');
    }

    try {
      console.log('Adding funds:', amount, 'to user:', user.uid);
      console.log('Current wallet balance:', walletBalance);
      
      const userRef = doc(db, 'users', user.uid);
      const newBalance = walletBalance + amount;
      
      console.log('New balance will be:', newBalance);

      await updateDoc(userRef, {
        walletBalance: newBalance
      });

      console.log('Successfully updated wallet balance');
      setWalletBalance(newBalance);
    } catch (error) {
      console.error('Error while adding funds:', error);
      throw error; // Re-throw to be caught by the modal's error handler
    }
  };

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
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4">Your Profile</h2>

        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-4">
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
            
            <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 inline-block">
              <p className="text-sm font-medium">Trade Record</p>
              <p className="mt-1">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">
                  {trades.filter(t => t.status === 'Won').length}W
                </span>
                <span className="mx-2 text-gray-400">-</span>
                <span className="text-red-600 dark:text-red-400 font-bold text-lg">
                  {trades.filter(t => t.status === 'Lost').length}L
                </span>
              </p>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-500 to-emerald-600 dark:from-green-600 dark:to-emerald-700 py-4 px-6 rounded-xl shadow-lg min-w-[240px]">
            <p className="text-sm text-green-50 dark:text-green-100">Available Balance</p>
            <p className="text-3xl font-bold text-white mt-1">
              {formatCurrency(walletBalance)}
            </p>
            <button
              onClick={() => setIsAddFundsModalOpen(true)}
              className="mt-3 w-full px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition-colors"
            >
              Add Funds
            </button>
          </div>
        </div>
      </div>

      <h3 className="text-xl font-semibold mb-6">Trade History</h3>
      {trades.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">
            You haven't placed any trades yet.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {trades.map((trade) => {
            const eventDate = trade.event ? new Date(trade.event.date) : null;
            return (
              <div
                key={trade.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-md"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  {/* Team and Event Info */}
                  <div className="flex-grow space-y-4">
                    <div className="flex items-center gap-4">
                      {trade.event && (
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
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
                        <h3 className="text-lg font-semibold">
                          {trade.event
                            ? (trade.selectedTeam === 'home'
                              ? trade.event.home_team.full_name
                              : trade.event.visitor_team.full_name)
                            : 'Unknown Team'}
                        </h3>
                        {trade.event && (
                          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            vs {trade.selectedTeam === 'home'
                              ? trade.event.visitor_team.full_name
                              : trade.event.home_team.full_name}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-1.5 ${
                        trade.status === 'Pending' 
                          ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                          : trade.status === 'Won'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {trade.status === 'Pending' && (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {trade.status === 'Won' && (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {trade.status === 'Lost' && (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {trade.status}
                      </span>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400">Trade placed</p>
                        <p className="mt-1 font-medium">{formatFullDateTime(trade.createdAt.toDate())}</p>
                      </div>
                      {eventDate && (
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">Event date</p>
                          <p className="mt-1 font-medium">{formatFullDateTime(eventDate)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bet Details */}
                  <div className="flex flex-col gap-3 min-w-[200px] bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Bet Amount</p>
                      <p className="text-lg font-semibold mt-1">{formatCurrency(trade.amount)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Potential Payout</p>
                      <p className="text-lg font-semibold text-green-600 dark:text-green-400 mt-1">
                        {formatCurrency(trade.expectedPayout)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddFundsModal
        isOpen={isAddFundsModalOpen}
        onClose={() => setIsAddFundsModalOpen(false)}
        onAddFunds={handleAddFunds}
      />
    </div>
  );
} 