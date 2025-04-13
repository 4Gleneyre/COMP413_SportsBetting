'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, Timestamp, updateDoc, addDoc, setDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { Event } from '@/types/events';
import Image from 'next/image';
import GameInfoModal from '@/components/GameInfoModal';
import BettingModal from '@/components/BettingModal';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';

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

interface Post {
  id: string;
  content: string;
  createdAt: Timestamp;
  userId: string;
  username: string;
  userPhotoURL?: string;
}

interface UserData {
  trades: string[];
  walletBalance: number;
  lifetimePnl?: number;
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
  onAddFunds,
  currentBalance 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onAddFunds: (amount: number) => Promise<void>;
  currentBalance: number;
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

    const newTotal = currentBalance + numAmount;
    if (newTotal > 10000) {
      setError('Total balance cannot exceed $10,000');
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

  const maxAllowedDeposit = Math.min(1000, 10000 - currentBalance);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-bold mb-4">Add Funds to Wallet</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="amount" className="block text-sm font-medium mb-2">
              Amount (USD) - Max ${maxAllowedDeposit.toFixed(2)}
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
                max={maxAllowedDeposit}
              />
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Current balance: ${currentBalance.toFixed(2)}
            </p>
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
              disabled={isLoading || maxAllowedDeposit <= 0}
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

// Function to parse date strings without timezone conversion
function parseLocalDate(dateString: string) {
  // If the format is YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    // Create date with local time set to midnight
    return new Date(year, month - 1, day, 0, 0, 0);
  }
  
  // For other formats, use standard date parsing but handle potential timezone issues
  const date = new Date(dateString);
  return date;
}

export default function ProfilePage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [lifetimePnl, setLifetimePnl] = useState<number | null>(null);
  const { user, username } = useAuth();
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' } | null>(null);
  const [activeTab, setActiveTab] = useState<'trades' | 'posts'>('trades');
  const [newPostContent, setNewPostContent] = useState('');
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);

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
        setLifetimePnl(userData.lifetimePnl ?? null);
        
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
              // Add datetime property to event data by combining date and time
              if (eventData.date && !eventData.datetime) {
                // Use date + time if available, or just date with a default time
                eventData.datetime = eventData.time 
                  ? `${eventData.date}T${eventData.time}` 
                  : `${eventData.date}T00:00:00`;
              }
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

  // Fetch user posts
  useEffect(() => {
    async function fetchUserPosts() {
      if (!user) {
        console.log('No user found, skipping posts fetch');
        setLoadingPosts(false);
        return;
      }

      try {
        console.log('Fetching posts for user:', user.uid);
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
        console.log('Posts query:', q);
        const querySnapshot = await getDocs(q);
        
        console.log('Posts query results:', querySnapshot.size, 'documents found');
        
        const postsData: Post[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          console.log('Post data:', data);
          postsData.push({
            id: doc.id,
            content: data.content,
            createdAt: data.createdAt,
            userId: data.userId,
            username: data.username,
            userPhotoURL: data.userPhotoURL
          });
        });
        
        console.log('Final posts array:', postsData);
        setPosts(postsData);
      } catch (error) {
        console.error('Error fetching user posts:', error);
      } finally {
        setLoadingPosts(false);
      }
    }

    fetchUserPosts();
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

      // Update only the walletBalance field, preserving other fields like lifetimePnl
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

  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !newPostContent.trim()) return;
    
    setIsSubmittingPost(true);
    
    try {
      // Call the Cloud Function to create a post
      const createPostFunction = httpsCallable(functions, 'createPost');
      const result = await createPostFunction({ content: newPostContent.trim() });
      
      // Access the response data
      const responseData = result.data as {
        success: boolean;
        postId: string;
        post: Post;
      };
      
      if (responseData.success) {
        // Add to local state with the returned post
        setPosts(prevPosts => [responseData.post, ...prevPosts]);
        
        // Clear the input
        setNewPostContent('');
      } else {
        throw new Error('Failed to create post');
      }
    } catch (error) {
      console.error('Error submitting post:', error);
      alert('Failed to submit post. Please try again.');
    } finally {
      setIsSubmittingPost(false);
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

  if (loading && activeTab === 'trades') {
    console.log('Rendering: Loading view');
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h2 className="text-2xl font-bold mb-8">Your Profile</h2>
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
                <p className="text-gray-500 dark:text-gray-400">@{username || user.email}</p>
              </div>
            </div>
            
            <div className="mt-4 flex gap-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
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

              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-sm font-medium">Lifetime P&L</p>
                <p className="mt-1">
                  {(() => {
                    const pnl = lifetimePnl !== null ? lifetimePnl :
                      trades.reduce((total, trade) => {
                        if (trade.status === 'Won') {
                          return total + (trade.expectedPayout - trade.amount);
                        } else if (trade.status === 'Lost') {
                          return total - trade.amount;
                        }
                        return total;
                      }, 0);
                    
                    return (
                      <span className={`font-bold text-lg ${
                        pnl > 0 ? 'text-green-600 dark:text-green-400'
                        : pnl === 0 ? 'text-blue-600 dark:text-blue-400'
                        : 'text-red-600 dark:text-red-400'
                      }`}>
                        {formatCurrency(pnl)}
                      </span>
                    );
                  })()}
                </p>
              </div>
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

      {/* Apple-style tabs */}
      <div className="mb-6">
        <div className="flex justify-center border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('trades')}
            className={`py-3 px-5 text-base font-medium border-b-2 transition-colors ${
              activeTab === 'trades'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Trade History
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`py-3 px-5 text-base font-medium border-b-2 transition-colors ${
              activeTab === 'posts'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Posts
          </button>
        </div>
      </div>

      {/* Trade History Tab */}
      {activeTab === 'trades' && (
        <>
          {trades.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400">
                You haven't placed any trades yet.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {trades.map((trade) => {
                console.log('Trade:', trade.id, 'Event:', trade.event);
                if (trade.event) {
                  console.log('Raw event date:', trade.event.datetime);
                  console.log('Event date type:', typeof trade.event.datetime);
                }
                const eventDate = trade.event ? parseLocalDate(trade.event.datetime) : null;
                console.log('Event date for trade:', trade.id, eventDate);
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
                            <div 
                              className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg cursor-pointer"
                              onClick={() => trade.event && setSelectedEvent(trade.event)}
                            >
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
        </>
      )}

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <div className="space-y-6">
          {/* Post creation form */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <form onSubmit={(e) => {
              e.preventDefault();
              handleSubmitPost(e);
              return false;
            }}>
              <div className="mb-4">
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="What's on your mind about sports betting?"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none min-h-[100px]"
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingPost || !newPostContent.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingPost ? 'Posting...' : 'Post'}
                </button>
              </div>
            </form>
          </div>

          {/* Posts display */}
          {(() => { console.log('Rendering posts section. loadingPosts:', loadingPosts, 'posts.length:', posts.length); return null; })()}
          {loadingPosts ? (
            <div className="animate-pulse space-y-4">
              {(() => { console.log('Showing loading skeleton'); return null; })()}
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              {(() => { console.log('No posts found to display'); return null; })()}
              <p className="text-gray-500 dark:text-gray-400">
                You haven't created any posts yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {(() => { console.log('About to map through posts:', posts); return null; })()}
              {posts.map((post) => {
                console.log('Rendering post:', post.id, post);
                return (
                  <div 
                    key={post.id}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-all"
                  >
                    {/* Post Header with User Info */}
                    <div className="flex items-center mb-3">
                      {post.userPhotoURL ? (
                        <Image
                          src={post.userPhotoURL}
                          alt={post.username}
                          width={40}
                          height={40}
                          className="rounded-full mr-3"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 mr-3 flex items-center justify-center text-gray-600 dark:text-gray-300 font-semibold">
                          {post.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{post.username}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {(() => {
                            // Helper function to format date consistently
                            const formatDate = (date: Date) => {
                              return date.toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              });
                            };
                            
                            try {
                              // Handle different timestamp formats
                              if (typeof post.createdAt === 'string') {
                                return formatDate(new Date(post.createdAt));
                              } else if (post.createdAt && typeof post.createdAt.toDate === 'function') {
                                // Firebase Timestamp object
                                return formatDate(post.createdAt.toDate());
                              } else if (post.createdAt instanceof Date) {
                                return formatDate(post.createdAt);
                              } else {
                                // Fallback for any other format - try to convert to Date
                                const timestamp = post.createdAt as any;
                                if (timestamp && timestamp.seconds) {
                                  // Handle Firestore Timestamp format {seconds: number, nanoseconds: number}
                                  return formatDate(new Date(timestamp.seconds * 1000));
                                }
                                return "Unknown date";
                              }
                            } catch (error) {
                              console.error("Error formatting date:", error);
                              return "Date error";
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                    {/* Post Content */}
                    <div className="text-gray-800 dark:text-gray-200 whitespace-pre-line">
                      {post.content}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <AddFundsModal
        isOpen={isAddFundsModalOpen}
        onClose={() => setIsAddFundsModalOpen(false)}
        onAddFunds={handleAddFunds}
        currentBalance={walletBalance}
      />

      {/* Game Info Modal */}
      {selectedEvent && (
        <GameInfoModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSelectTeam={(team) => {
            setSelectedBet({ event: selectedEvent, team });
            setSelectedEvent(null);
          }}
        />
      )}
      
      {/* Betting Modal */}
      {selectedBet && (
        <BettingModal
          event={selectedBet.event}
          selectedTeam={selectedBet.team}
          onClose={() => setSelectedBet(null)}
        />
      )}
    </div>
  );
}