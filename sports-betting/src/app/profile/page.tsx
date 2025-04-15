'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, getDoc, Timestamp, updateDoc, addDoc, setDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { Event } from '@/types/events';
import Image from 'next/image';
import GameInfoModal from '@/components/GameInfoModal';
import BettingModal from '@/components/BettingModal';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import PostItem, { Post } from '@/components/PostItem';

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
  const [activeTab, setActiveTab] = useState<'trades' | 'posts'>('posts');
  const [newPostContent, setNewPostContent] = useState('');
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [availableEvents, setAvailableEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [showEventSelector, setShowEventSelector] = useState(false);

  // Add debug log for trades state changes
  useEffect(() => {
    console.log('Trades state updated:', trades);
  }, [trades]);

  /**
   * Fetch event by ID from Firestore
   */
  const fetchEventById = async (eventId: string | number | null) => {
    if (eventId === null || eventId === undefined) {
      console.error('No event ID provided');
      return;
    }
    
    // Always convert to string for Firestore
    const docId = String(eventId);
    
    try {
      const eventDoc = await getDoc(doc(db, 'events', docId));
      if (eventDoc.exists()) {
        const eventData = eventDoc.data() as Event;
        eventData.id = eventDoc.id;
        setSelectedEvent(eventData);
      } else {
        console.error('Event document does not exist');
      }
    } catch (error) {
      console.error('Error fetching event by ID:', error);
    }
  };

  // Handle event ID from URL and custom events
  useEffect(() => {
    // Check URL for event parameter on page load
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    
    if (eventId) {
      fetchEventById(eventId);
      
      // Clean up the URL without reloading the page
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    // Listen for custom event when event is selected from TradeConfirmationModal
    const handleEventSelected = (e: CustomEvent) => {
      if (e.detail && typeof e.detail === 'object' && 'eventId' in e.detail) {
        const { eventId } = e.detail;
        // eventId can be string or number, fetchEventById will handle it
        fetchEventById(eventId);
      } else {
        console.error('Invalid custom event format', e);
      }
    };
    
    // Add event listener for custom event
    window.addEventListener('eventSelected', handleEventSelected as EventListener);
    
    // Clean up event listener
    return () => {
      window.removeEventListener('eventSelected', handleEventSelected as EventListener);
    };
  }, []);

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
            // Listen for real-time updates to this event
            const unsub = onSnapshot(doc(db, 'events', tradeData.eventId), (eventDoc) => {
              if (eventDoc.exists()) {
                const eventData = eventDoc.data() as Event;
                eventData.id = eventDoc.id;
                // Update the trade's event details with real-time data
                setTrades(prevTrades => prevTrades.map(t => t.id === tradeDoc.id ? { ...t, event: eventData } : t));
              }
            });
            // Store unsub if you need to clean up listeners later
            // (optional: push to an array for cleanup on component unmount)
            
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
            userPhotoURL: data.userPhotoURL,
            taggedEvents: data.taggedEvents
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

  // Function to fetch events for tagging
  const fetchEventsForTagging = async () => {
    if (!user) return;
    
    setLoadingEvents(true);
    try {
      console.log('Fetching events for tagging');
      const eventsRef = collection(db, 'events');
      // Get upcoming events (where date is in the future)
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      const q = query(
        eventsRef, 
        where('date', '>=', today),
        orderBy('date', 'asc'),
        // Limit to prevent fetching too many events
        limit(20)
      );
      
      const querySnapshot = await getDocs(q);
      console.log('Events query results:', querySnapshot.size, 'events found');
      
      const eventsData: Event[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as Event;
        data.id = doc.id; // Ensure ID is set
        eventsData.push(data);
      });
      
      console.log('Events for tagging:', eventsData);
      setAvailableEvents(eventsData);
    } catch (error) {
      console.error('Error fetching events for tagging:', error);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Fetch events when showing the event selector
  useEffect(() => {
    if (showEventSelector) {
      fetchEventsForTagging();
    }
  }, [showEventSelector]);

  // Toggle the event selector
  const toggleEventSelector = () => {
    setShowEventSelector(prev => !prev);
  };

  const toggleEventSelection = (eventId: string) => {
    setSelectedEventIds(prev => {
      if (prev.includes(eventId)) {
        return prev.filter(id => id !== eventId);
      } else {
        return [...prev, eventId];
      }
    });
  };

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
      const result = await createPostFunction({ content: newPostContent.trim(), taggedEvents: selectedEventIds });
      
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
        setSelectedEventIds([]);
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
            onClick={() => setActiveTab('posts')}
            className={`py-3 px-5 text-base font-medium border-b-2 transition-colors ${
              activeTab === 'posts'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Posts
          </button>
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
        </div>
      </div>

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <div className="space-y-6">
          {/* Post creation form */}
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <form onSubmit={handleSubmitPost}>
              <div className="mb-3">
                <textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder="Share your thoughts on upcoming games..."
                  className="w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                ></textarea>
              </div>
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={toggleEventSelector}
                  className={`flex items-center px-3 py-1.5 text-sm rounded-lg border ${
                    showEventSelector || selectedEventIds.length > 0
                      ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600'
                  }`}
                >
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {selectedEventIds.length > 0 
                    ? `${selectedEventIds.length} Event${selectedEventIds.length > 1 ? 's' : ''} Tagged` 
                    : 'Tag Events'}
                </button>
                <button
                  type="submit"
                  disabled={!newPostContent.trim() || isSubmittingPost}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingPost ? 'Posting...' : 'Post'}
                </button>
              </div>
            </form>
          </div>

          {/* Event selector */}
          {showEventSelector && (
            <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium">Tag events in your post</h3>
                {loadingEvents && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">Loading...</span>
                )}
              </div>
              
              {availableEvents.length === 0 && !loadingEvents ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming events found.</p>
              ) : (
                <div className="overflow-x-auto pb-2">
                  <div className="flex space-x-3" style={{ minWidth: 'max-content' }}>
                    {loadingEvents ? (
                      // Loading placeholders
                      Array(4).fill(0).map((_, i) => (
                        <div key={i} className="w-52 h-28 bg-gray-100 dark:bg-gray-700 rounded-md animate-pulse flex-shrink-0"></div>
                      ))
                    ) : (
                      // Actual events
                      availableEvents.map((event, index) => {
                        const isSelected = selectedEventIds.includes(event.id);
                        // Add medal styling for top events (gold, silver, bronze)
                        const medalStyles = index < 3 ? [
                          'border-yellow-400 dark:border-yellow-600 shadow-yellow-100 dark:shadow-yellow-900/20',
                          'border-gray-300 dark:border-gray-500 shadow-gray-100 dark:shadow-gray-900/20',
                          'border-amber-700 dark:border-amber-800 shadow-amber-100 dark:shadow-amber-900/20'
                        ][index] : '';
                        
                        return (
                          <div 
                            key={event.id}
                            onClick={() => toggleEventSelection(event.id)}
                            className={`w-52 p-3 rounded-lg cursor-pointer flex-shrink-0 relative border-2 transition-all ${
                              isSelected 
                                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 shadow-md' 
                                : `bg-white dark:bg-gray-800 border-transparent hover:border-gray-200 dark:hover:border-gray-700 ${medalStyles}`
                            }`}
                          >
                            {/* Medal indicator for top events */}
                            {index < 3 && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" 
                                style={{ 
                                  backgroundColor: index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : '#CD7F32',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}>
                                {index + 1}
                              </div>
                            )}
                            
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center">
                                <TeamLogo 
                                  abbreviation={event.home_team.abbreviation}
                                  teamName={event.home_team.full_name}
                                />
                              </div>
                              {isSelected && (
                                <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <div className="text-sm font-medium line-clamp-2 h-10 mb-2">
                              {event.home_team.full_name} vs {event.visitor_team.full_name}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(event.date).toLocaleDateString(undefined, { 
                                weekday: 'short', 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

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
              {posts.map((post) => (
                <PostItem key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      )}

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
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            {trade.status === 'Won' && (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                            {trade.status === 'Lost' && (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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