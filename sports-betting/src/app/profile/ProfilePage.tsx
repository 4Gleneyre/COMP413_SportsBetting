'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, doc, getDoc, Timestamp, updateDoc, orderBy, limit } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import type { Event } from '@/types/events';
import type { Post } from '@/types/post';
import Image from 'next/image';
import GameInfoModal from '@/components/GameInfoModal';
import BettingModal from '@/components/BettingModal';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import PostItem from '@/components/PostItem';
import EventSelector from '@/components/EventSelector';
import { usePathname, useSearchParams } from 'next/navigation';

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
  currentValue?: number | null;
}

interface UserData {
  trades: string[];
  walletBalance: number;
  lifetimePnl?: number;
  private?: boolean;
}

interface ProfileUserData {
  photoURL?: string;
  username?: string;
  // Add trades property if needed, although trades state is handled separately
}

// Define the structure for the data returned by the Cloud Function
interface UserProfileInfoResponse {
  photoURL: string | null;
  username: string | null;
  trades: Trade[]; // Use the existing Trade interface
  private: boolean;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
}

function TeamLogo({ 
  abbreviation, 
  teamName, 
  sport, 
  teamId 
}: { 
  abbreviation: string; 
  teamName: string; 
  sport?: string; 
  teamId?: number | string 
}) {
  const [imageExists, setImageExists] = useState(true);

  // For soccer teams, use the football-data.org API
  let logoUrl = `/logos/${abbreviation}.png`; // Default logo
  
  if (sport === 'soccer' && teamId !== undefined) {
    // Use the football-data.org API for soccer team logos
    logoUrl = `https://crests.football-data.org/${teamId}.png`;
  }

  return imageExists ? (
    <Image
      src={logoUrl}
      alt={`${teamName} logo`}
      width={32}
      height={32}
      className="rounded-full"
      onError={() => setImageExists(false)}
    />
  ) : (
    // Fallback if image doesn't exist
    <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs font-medium">
      {abbreviation?.substring(0, 2) || "?"}
    </div>
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

function SellTradeModal({ 
  isOpen, 
  onClose, 
  trade,
  onConfirm
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  trade: Trade;
  onConfirm: () => Promise<void>;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setError('');
    setIsLoading(true);

    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('Error while selling trade:', err);
      setError('Failed to sell trade. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold mb-2">Confirm Trade Sale</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Are you sure you want to sell this trade?
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg mb-6">
          <div className="flex items-center gap-4 mb-4">
            {trade.event && (
              <div className="bg-white dark:bg-gray-700 p-3 rounded-lg">
                <TeamLogo
                  abbreviation={trade.selectedTeam === 'home' 
                    ? trade.event.home_team.abbreviation 
                    : trade.event.visitor_team.abbreviation}
                  teamName={trade.selectedTeam === 'home'
                    ? trade.event.home_team.full_name
                    : trade.event.visitor_team.full_name}
                  sport={trade.event?.sport}
                  teamId={trade.selectedTeam === 'home'
                    ? trade.event?.home_team?.id
                    : trade.event?.visitor_team?.id}
                />
              </div>
            )}
            <div>
              <h4 className="font-medium">
                {trade.event
                  ? (trade.selectedTeam === 'home'
                    ? trade.event.home_team.full_name
                    : trade.event.visitor_team.full_name)
                  : 'Unknown Team'}
              </h4>
              {trade.event && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  vs {trade.selectedTeam === 'home'
                    ? trade.event.visitor_team.full_name
                    : trade.event.home_team.full_name}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Original Amount</p>
              <p className="font-medium">{formatCurrency(trade.amount)}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Current Value</p>
              <p className={`font-medium ${
                (trade.currentValue || 0) > trade.amount 
                  ? 'text-green-600 dark:text-green-400' 
                  : (trade.currentValue || 0) < trade.amount 
                    ? 'text-red-600 dark:text-red-400' 
                    : ''
              }`}>
                {formatCurrency(trade.currentValue || trade.amount)}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm mb-4">{error}</p>
        )}

        <div className="flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Processing...' : 'Confirm Sale'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [lifetimePnl, setLifetimePnl] = useState<number | null>(null);
  const { user, username } = useAuth();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isAddFundsModalOpen, setIsAddFundsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' | 'draw' } | null>(null);
  const [activeTab, setActiveTab] = useState<'trades' | 'posts'>('posts');
  const [newPostContent, setNewPostContent] = useState('');
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [availableEvents, setAvailableEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [showEventSelector, setShowEventSelector] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // New state variables for viewing other user profiles
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [profileUserData, setProfileUserData] = useState<ProfileUserData | null>(null);
  // New state for profile privacy
  const [isPrivateProfile, setIsPrivateProfile] = useState(false);
  const [updatingPrivacy, setUpdatingPrivacy] = useState(false);
  // New state for trades search and filtering
  const [tradeSearchQuery, setTradeSearchQuery] = useState<string>('');
  const [tradeStatusFilter, setTradeStatusFilter] = useState<'all' | 'pending' | 'won' | 'lost' | 'sold'>('all');
  // New state for trade selling modal
  const [selectedTradeForSale, setSelectedTradeForSale] = useState<Trade | null>(null);
  const [isSellTradeModalOpen, setIsSellTradeModalOpen] = useState(false);

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
    // Check URL for event parameter and user parameters on page load
    const eventId = searchParams.get('event');
    const urlUserId = searchParams.get('userId');
    const urlUsername = searchParams.get('username');
    
    // Set profile user data from URL parameters
    if (urlUserId) {
      setProfileUserId(urlUserId);
      if (urlUsername) {
        setProfileUsername(urlUsername);
      }
    }
    
    if (eventId) {
      fetchEventById(eventId);
      
      // Clean up the URL without reloading the page
      const newUrl = window.location.pathname + 
        (urlUserId ? `?userId=${urlUserId}${urlUsername ? `&username=${urlUsername}` : ''}` : '');
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
  }, [searchParams]);

  // Determine if this is the logged-in user's profile
  useEffect(() => {
    if (user && profileUserId) {
      setIsOwnProfile(user.uid === profileUserId);
    } else {
      setIsOwnProfile(true); // Default to own profile if no profile user ID is set
    }
  }, [user, profileUserId]);

  // Fetch profile user data if viewing another user's profile
  useEffect(() => {
    async function fetchProfileUserData() {
      if (!profileUserId || (user && profileUserId === user.uid)) {
        // If no profile user ID or if it's the current user, use current user data
        setIsOwnProfile(true);
        return;
      }

      try {
        console.log('Fetching profile data for user:', profileUserId);
        
        // Call the updated Cloud Function
        const getUserProfileInfo = httpsCallable(functions, 'getUserProfileInfo');
        const result = await getUserProfileInfo({ userId: profileUserId });
        
        // Access the response data using the defined interface
        const profileData = result.data as UserProfileInfoResponse;
        
        setProfileUserData({
          photoURL: profileData.photoURL || undefined, // Convert null to undefined
          username: profileData.username || profileUsername || 'User'
        });
        
        // Set profile username specifically
        setProfileUsername(profileData.username || profileUsername || 'User');

        // Set the trades state with the data from the Cloud Function
        setTrades(profileData.trades || []); 
        setIsOwnProfile(false); // We fetched data, so it's not the own profile
        setIsPrivateProfile(profileData.private ?? false);

      } catch (error) {
        console.error('Error fetching profile user data:', error);
      }
    }

    fetchProfileUserData();
  }, [profileUserId, profileUsername, user, functions]); // Removed fetchUserData dependency

  useEffect(() => {
    async function fetchUserData() {
      // Only fetch wallet/pnl/trades if it's the user's own profile and user is logged in
      if (!user || !isOwnProfile) {
        console.log('Not own profile or user not logged in, skipping detailed user data fetch');
        if (!profileUserId) setLoading(false); // Ensure loading stops if no profileId was ever set
        return;
      }
      
      const targetUserId = user.uid;

      try {
        console.log('Fetching own user data for:', targetUserId);
        setLoading(true); // Start loading for own profile data
        
        // Get user document for wallet balance and PnL
        const userDoc = await getDoc(doc(db, 'users', targetUserId));
        if (!userDoc.exists()) {
          console.log('Own user document not found in Firestore');
          setLoading(false);
          return;
        }

        const userData = userDoc.data() as UserData;
        
        // Set wallet balance and pnl only for own profile
        setWalletBalance(userData.walletBalance || 0);
        setLifetimePnl(userData.lifetimePnl ?? null);
        // Set privacy setting from the 'private' field
        setIsPrivateProfile(userData.private ?? false);

        // Fetch trades separately for own profile using the function to ensure consistency
        // (or rely on Firestore listener if you prefer real-time updates for own profile)
        // For simplicity here, let's call the function again for own profile too
        // Alternatively, could set up a listener only for own profile trades
        try {
          const getUserProfileInfo = httpsCallable(functions, 'getUserProfileInfo');
          const result = await getUserProfileInfo({ userId: targetUserId });
          const profileData = result.data as UserProfileInfoResponse;
          setTrades(profileData.trades || []);
        } catch (tradeError) {
          console.error('Error fetching trades for own profile:', tradeError);
          setTrades([]); // Clear trades on error
        }
        
        /* 
        // --- OLD TRADE FETCHING LOGIC (REMOVED) --- 
        const userTrades = userData.trades || [];
        console.log('Found trade IDs:', userTrades);
        
        // Fetch all trades
        const tradesData: Trade[] = [];
        if (userTrades.length > 0) {
          const tradesQuery = query(collection(db, 'trades'), where(documentId(), 'in', userTrades));
          const tradeDocs = await getDocs(tradesQuery);

          const eventPromises = tradeDocs.docs.map(async (tradeDoc) => {
            const tradeData = { id: tradeDoc.id, ...tradeDoc.data() } as Trade;
    try {
      const eventDoc = await getDoc(doc(db, 'events', tradeData.eventId));
      if (eventDoc.exists()) {
                const eventData = eventDoc.data() as Event;
        eventData.id = eventDoc.id;
                // Add datetime property
        if (eventData.date && !eventData.datetime) {
          eventData.datetime = eventData.time
            ? `${eventData.date}T${eventData.time}`
            : `${eventData.date}T00:00:00`;
        }
                tradeData.event = eventData;
              }
            } catch (eventError) {
              console.error('Error fetching event for trade:', tradeData.id, eventError);
            }
            return tradeData;
          });

          const resolvedTrades = await Promise.all(eventPromises);
          // Sort trades by createdAt timestamp, newest first
          resolvedTrades.sort((a, b) => {
            const timeA = a.createdAt?.toMillis() || 0;
            const timeB = b.createdAt?.toMillis() || 0;
            return timeB - timeA;
          });
          tradesData.push(...resolvedTrades);
        }

        setTrades(tradesData);
        // --- END OF OLD TRADE FETCHING LOGIC --- 
        */

      } catch (error) {
        console.error('Error fetching own user data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  // Depend on user and isOwnProfile. isOwnProfile changes when profileUserId or user changes.
  }, [user, isOwnProfile, functions]); 

  // Fetch user posts
  useEffect(() => {
    async function fetchUserPosts() {
      // Determine which user ID to use for posts fetching
      const targetUserId = profileUserId || (user ? user.uid : null);
      
      if (!targetUserId) {
        console.log('No user ID found, skipping posts fetch');
        setLoadingPosts(false);
        return;
      }

      try {
        console.log('Fetching posts for user:', targetUserId);
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, where('userId', '==', targetUserId), orderBy('createdAt', 'desc'));
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
            updatedAt: data.updatedAt || null,
            userId: data.userId,
            username: data.username,
            userPhotoURL: data.userPhotoURL,
            mediaUrl: data.mediaUrl || undefined,
            mediaType: data.mediaType || undefined,
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
  }, [user, profileUserId]);

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
        where('status', '>=', today),
        orderBy('status', 'asc'),
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
      
      // Function to validate date
      const isValidDate = (dateString: string) => {
        const date = new Date(dateString);
        return !isNaN(date.getTime());
      };
      
      // Filter events to ensure they have valid status dates
      const validEvents = eventsData.filter(event => event.status && isValidDate(event.status));
      
      console.log('Events for tagging:', validEvents);
      setAvailableEvents(validEvents);
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
      let mediaUrl = '';
      let mediaTypeValue: 'image' | 'video' | null = null;
      
      // Upload media file if one is selected
      if (mediaFile) {
        const fileExtension = mediaFile.name.split('.').pop()?.toLowerCase() || '';
        const fileName = `post_media/${user.uid}/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
        const storageRef = ref(storage, fileName);
        
        // Upload the file
        const uploadTask = uploadBytesResumable(storageRef, mediaFile);
        
        // Return a promise that resolves when the upload is complete
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              // Track upload progress
              const progress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              setUploadProgress(progress);
            },
            (error) => {
              console.error('Error uploading file:', error);
              reject(error);
            },
            async () => {
              // Get the download URL
              mediaUrl = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Determine media type based on file extension
              if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
                mediaTypeValue = 'image';
              } else if (['mp4', 'webm', 'ogg', 'mov'].includes(fileExtension)) {
                mediaTypeValue = 'video';
              }
              
              resolve();
            }
          );
        });
      }
      
      // Call the Cloud Function to create a post
      const createPostFunction = httpsCallable(functions, 'createPost');
      const result = await createPostFunction({ 
        content: newPostContent.trim(), 
        taggedEvents: selectedEventIds,
        mediaUrl,
        mediaType: mediaTypeValue
      });
      
      // Access the response data
      const responseData = result.data as {
        success: boolean;
        postId: string;
        post: Post;
      };
      
      if (responseData.success) {
        // Add to local state with the returned post
        setPosts(prevPosts => [responseData.post, ...prevPosts]);
        
        // Clear the input and media
        setNewPostContent('');
        setSelectedEventIds([]);
        setMediaFile(null);
        setMediaPreview('');
        setMediaType(null);
        setUploadProgress(0);
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

  // Function to handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const fileType = file.type.split('/')[0];
    if (fileType !== 'image' && fileType !== 'video') {
      alert('Only image and video files are allowed.');
      return;
    }

    // Set the selected file
    setMediaFile(file);
    
    // Create a preview URL
    const objectUrl = URL.createObjectURL(file);
    setMediaPreview(objectUrl);
    
    // Set the media type
    setMediaType(fileType as 'image' | 'video');
    
    // Reset upload progress
    setUploadProgress(0);
  };

  // Function to remove selected media
  const handleRemoveMedia = () => {
    setMediaFile(null);
    setMediaPreview('');
    setMediaType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Function to toggle profile privacy
  const toggleProfilePrivacy = async () => {
    if (!user || !isOwnProfile) return;
    
    try {
      setUpdatingPrivacy(true);
      const newPrivacySetting = !isPrivateProfile;
      
      // Update in Firestore using the 'private' field
      await updateDoc(doc(db, 'users', user.uid), {
        private: newPrivacySetting
      });
      
      // Update local state
      setIsPrivateProfile(newPrivacySetting);
      
      // Show feedback (could add a toast notification here)
      console.log(`Profile privacy updated to: ${newPrivacySetting ? 'Private' : 'Public'}`);
    } catch (error) {
      console.error('Error updating profile privacy:', error);
    } finally {
      setUpdatingPrivacy(false);
    }
  };

  // Function to handle selling a trade
  const handleSellTrade = async () => {
    if (!user || !selectedTradeForSale) {
      console.error('No user or selected trade found when trying to sell trade');
      throw new Error('User or trade not found');
    }

    try {
      console.log('Selling trade:', selectedTradeForSale.id);
      
      // Call the Cloud Function to sell the trade
      const sellTradeFunction = httpsCallable(functions, 'sellTrade');
      const result = await sellTradeFunction({ 
        tradeId: selectedTradeForSale.id
      });
      
      // Access the response data
      const responseData = result.data as {
        success: boolean;
        newWalletBalance: number;
        soldValue: number;
      };
      
      if (responseData.success) {
        // Update wallet balance
        setWalletBalance(responseData.newWalletBalance);
        
        // Update the trade status in the local state
        setTrades(prevTrades => 
          prevTrades.map(trade => 
            trade.id === selectedTradeForSale.id 
              ? { ...trade, status: 'sold' } 
              : trade
          )
        );
        
        console.log('Trade sold successfully for:', formatCurrency(responseData.soldValue));
      } else {
        throw new Error('Failed to sell trade');
      }
    } catch (error) {
      console.error('Error while selling trade:', error);
      throw error; // Re-throw to be caught by the modal's error handler
    }
  };

  // Add debug logs in the render logic
  if (!user && !profileUserId) {
    console.log('Rendering: No user view');
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Profile</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Please sign in to view your profile and trades.
          </p>
        </div>
      </div>
    );
  }

  if (loading && activeTab === 'trades') {
    console.log('Rendering: Loading view');
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h2 className="text-2xl font-bold mb-8">User Profile</h2>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  console.log('Rendering: Main view, trades length:', trades.length);
  
  // Determine which user data to display
  const displayName = user?.displayName;
    
  const userPhotoURL = !isOwnProfile 
    ? profileUserData?.photoURL 
    : user?.photoURL;
    
  const displayUsername = !isOwnProfile 
    ? profileUsername || (profileUserData?.username) || 'User'
    : username || user?.email;
  
  const renderTradeHistory = () => {
    if (!isOwnProfile && isPrivateProfile) {
      return (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-gray-500 dark:text-gray-400">
            This user&apos;s profile setting is set to private, so you can&apos;t view the user&apos;s trades.
          </p>
        </div>
      );
    }
    
    if (loading) {
      return <div className="text-center p-4">Loading trades...</div>;
    }

    // Add search and filter UI
    const renderTradeSearchAndFilter = () => {
      // Count trades by status for the filter badges
      const statusCounts = trades.reduce((acc, trade) => {
        const status = trade.status?.toLowerCase() || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
          {/* Search input */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
              </svg>
            </div>
            <input
              type="text"
              className="block w-full p-2.5 pl-10 text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
              placeholder="Search by team name..."
              value={tradeSearchQuery}
              onChange={(e) => setTradeSearchQuery(e.target.value)}
            />
          </div>
          
          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTradeStatusFilter('all')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                tradeStatusFilter === 'all' 
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              All ({trades.length})
            </button>
            
            <button
              onClick={() => setTradeStatusFilter('pending')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                tradeStatusFilter === 'pending' 
                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Pending ({statusCounts['pending'] || 0})
            </button>
            
            <button
              onClick={() => setTradeStatusFilter('won')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                tradeStatusFilter === 'won' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Won ({statusCounts['won'] || 0})
            </button>
            
            <button
              onClick={() => setTradeStatusFilter('lost')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                tradeStatusFilter === 'lost' 
                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Lost ({statusCounts['lost'] || 0})
            </button>
            
            <button
              onClick={() => setTradeStatusFilter('sold')}
              className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                tradeStatusFilter === 'sold' 
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' 
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              Sold ({statusCounts['sold'] || 0})
            </button>
          </div>
        </div>
      );
    };

    if (trades.length === 0) {
      return (
        <>
          {renderTradeSearchAndFilter()}
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">
              No trades placed yet.
            </p>
          </div>
        </>
      );
    }

    console.log('Rendering: Trade History tab, trades:', trades);

    // Filter trades based on search query and status filter
    const filteredTrades = trades.filter(trade => {
      // Status filter
      if (tradeStatusFilter !== 'all' && trade.status?.toLowerCase() !== tradeStatusFilter) {
        return false;
      }
      
      // Search query filter
      if (tradeSearchQuery.trim() !== '') {
        const query = tradeSearchQuery.toLowerCase();
        const homeTeamName = trade.event?.home_team?.full_name?.toLowerCase() || '';
        const visitorTeamName = trade.event?.visitor_team?.full_name?.toLowerCase() || '';
        const homeTeamAbbrev = trade.event?.home_team?.abbreviation?.toLowerCase() || '';
        const visitorTeamAbbrev = trade.event?.visitor_team?.abbreviation?.toLowerCase() || '';
        
        return (
          homeTeamName.includes(query) || 
          visitorTeamName.includes(query) ||
          homeTeamAbbrev.includes(query) ||
          visitorTeamAbbrev.includes(query)
        );
      }
      
      return true;
    });

    return (
      <div>
        {renderTradeSearchAndFilter()}
        
        {filteredTrades.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <p className="text-gray-500 dark:text-gray-400">
              No trades match your search criteria.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredTrades.map((trade) => {
              const eventDate = trade.event ? parseLocalDate(trade.event.datetime) : null;
              return (
                <div
                  key={trade.id}
                  className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-md"
                >
                  {/* Add a header with status and sell button for pending trades */}
                  {trade.status?.toLowerCase() === 'pending' && (
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-1.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                          </svg>
                          Pending
                        </span>
                      </div>
                      <button
                        className="py-2 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow"
                        onClick={() => {
                          setSelectedTradeForSale(trade);
                          setIsSellTradeModalOpen(true);
                        }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Sell Trade
                      </button>
                    </div>
                  )}
                  
                  {/* Status badge for non-pending trades */}
                  {trade.status?.toLowerCase() !== 'pending' && (
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-1.5 ${ 
                        trade.status?.toLowerCase() === 'won'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : trade.status?.toLowerCase() === 'lost'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : trade.status?.toLowerCase() === 'sold'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' // Default/Unknown
                      }`}>
                        {trade.status?.toLowerCase() === 'won' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {trade.status?.toLowerCase() === 'lost' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {trade.status?.toLowerCase() === 'sold' && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                        {trade.status ? trade.status.charAt(0).toUpperCase() + trade.status.slice(1) : 'Unknown'}
                      </span>
                    </div>
                  )}

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
                              sport={trade.event?.sport}
                              teamId={trade.selectedTeam === 'home'
                                ? trade.event?.home_team?.id
                                : trade.event?.visitor_team?.id}
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

                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500 dark:text-gray-400">Trade placed</p>
                          <p className="mt-1 font-medium">
                            {trade.createdAt 
                              ? (typeof trade.createdAt.toDate === 'function' 
                                  // Handle Firestore Timestamp
                                  ? formatFullDateTime(trade.createdAt.toDate())
                                  // Handle serialized timestamp format (seconds + nanoseconds)
                                  : trade.createdAt.seconds 
                                    ? formatFullDateTime(new Date(trade.createdAt.seconds * 1000))
                                    // Handle ISO string
                                    : typeof trade.createdAt === 'string' 
                                      ? formatFullDateTime(new Date(trade.createdAt))
                                      // Last resort - just show something
                                      : 'Date available')
                              : 'N/A'}
                          </p> 
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
                      
                      {trade.currentValue !== undefined && trade.currentValue !== null && trade.status?.toLowerCase() === 'pending' && (
                        <div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">Current Value</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className={`text-lg font-semibold ${
                              trade.currentValue > trade.amount 
                                ? 'text-green-600 dark:text-green-400' 
                                : trade.currentValue < trade.amount 
                                  ? 'text-red-600 dark:text-red-400' 
                                  : 'text-gray-700 dark:text-gray-300'
                            }`}>
                              {formatCurrency(trade.currentValue)}
                            </p>
                            
                            {trade.amount > 0 && (
                              <div className={`flex items-center text-sm font-medium ${
                                trade.currentValue > trade.amount 
                                  ? 'text-green-600 dark:text-green-400' 
                                  : trade.currentValue < trade.amount 
                                    ? 'text-red-600 dark:text-red-400' 
                                    : 'text-gray-500 dark:text-gray-400'
                              }`}>
                                {trade.currentValue > trade.amount ? (
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                  </svg>
                                ) : trade.currentValue < trade.amount ? (
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
                                  </svg>
                                ) : null}
                                {((trade.currentValue / trade.amount - 1) * 100).toFixed(2)}%
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
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
      </div>
    );
  };
  
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-4">
              {userPhotoURL && (
                <Image
                  src={userPhotoURL}
                  alt={displayName || 'User'}
                  width={64}
                  height={64}
                  className="rounded-full"
                />
              )}
              <div>
                {isOwnProfile ? (
                  <>
                    <p className="text-lg font-semibold">{displayName}</p>
                    <p className="text-gray-500 dark:text-gray-400">@{displayUsername}</p>
                    
                    {/* Privacy toggle for own profile */}
                    <div className="mt-2 flex items-center">
                      <button
                        onClick={toggleProfilePrivacy}
                        disabled={updatingPrivacy}
                        className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full transition-colors"
                        aria-label={isPrivateProfile ? "Make profile public" : "Make profile private"}
                      >
                        <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          isPrivateProfile 
                            ? 'bg-blue-600 dark:bg-blue-500' 
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isPrivateProfile ? 'translate-x-4' : 'translate-x-1'
                          }`} />
                        </span>
                        <span className="font-medium">
                          {updatingPrivacy ? 'Updating...' : (isPrivateProfile ? 'Private Profile' : 'Public Profile')}
                        </span>
                        
                        {/* Information tooltip */}
                        <div className="relative inline-block ml-1.5 group">
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            className="h-4 w-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 cursor-help"
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                            />
                          </svg>
                          <div className="absolute left-1/2 bottom-full -translate-x-1/2 mb-2 w-64 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                            <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-lg">
                              <p className="mb-1">
                                <span className="font-semibold">Private Profile:</span> Your posts remain visible to the community, while your trading activity stays confidential.
                              </p>
                              <p>
                                <span className="font-semibold">Public Profile:</span> Share your complete trading journey with the MeiYunDong community, showcasing both your posts and trading history.
                              </p>
                              <div className="absolute left-1/2 top-full -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-semibold">@{displayUsername}</p>
                    <span
                      className={`px-2 py-0.5 text-sm rounded-full ${
                        isPrivateProfile
                          ? 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                      }`}
                    >
                      {isPrivateProfile ? 'Private' : 'Public'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {isOwnProfile && (
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
                          if (trade.status === 'won') {
                          return total + (trade.expectedPayout - trade.amount);
                          } else if (trade.status === 'lost') {
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
            )}
          </div>

          {isOwnProfile && (
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
          )}
        </div>
      </div>

      {/* Apple-style tabs - only show trade history tab for own profile */}
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
          {(trades.length > 0 || loading) && (
          <button
            onClick={() => setActiveTab('trades')}
            className={`py-3 px-5 text-base font-medium border-b-2 transition-colors ${
              activeTab === 'trades'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Trades
          </button>
          )}
        </div>
      </div>

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <div className="space-y-6">
          {/* Post creation form - only show for own profile */}
          {isOwnProfile && (
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
              
              {/* Media Preview */}
              {mediaPreview && (
                <div className="relative mb-3 border rounded-lg overflow-hidden">
                  {mediaType === 'image' ? (
                    <img 
                      src={mediaPreview} 
                      alt="Post image" 
                      className="w-full max-h-80 object-contain"
                    />
                  ) : mediaType === 'video' ? (
                    <video 
                      src={mediaPreview} 
                      controls 
                      className="w-full max-h-80"
                    />
                  ) : null}
                  
                  {/* Upload progress indicator */}
                  {isSubmittingPost && uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gray-200 h-1">
                      <div 
                        className="bg-blue-500 h-1" 
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  )}
                  
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={handleRemoveMedia}
                    className="absolute top-2 right-2 bg-gray-900/70 text-white rounded-full p-1 hover:bg-gray-900"
                    aria-label="Remove media"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
              
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
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
                  
                  {/* Media upload button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center px-3 py-1.5 text-sm rounded-lg border bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {mediaFile ? 'Change Media' : 'Add Media'}
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,video/*"
                    className="hidden"
                  />
                </div>
                
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
          )}

          {/* Event selector */}
          {showEventSelector && isOwnProfile && (
            <EventSelector
              selectedEventIds={selectedEventIds}
              toggleEventSelection={toggleEventSelection}
            />
          )}

          {/* Posts display */}
          {loadingPosts ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400">
                {isOwnProfile ? "You haven't created any posts yet." : "This user hasn't created any posts yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostItem 
                  key={post.id} 
                  post={post} 
                  onPostDeleted={(postId) => {
                    // Remove the deleted post from the posts array
                    setPosts(prevPosts => prevPosts.filter(p => p.id !== postId));
                  }}
                />
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
                No trades yet.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {renderTradeHistory()}
            </div>
          )}
        </>
      )}

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
      
      {/* Add Funds Modal - only shown for own profile */}
      {isOwnProfile && (
        <AddFundsModal
          isOpen={isAddFundsModalOpen}
          onClose={() => setIsAddFundsModalOpen(false)}
          onAddFunds={handleAddFunds}
          currentBalance={walletBalance}
        />
      )}
      
      {/* Sell Trade Modal */}
      {selectedTradeForSale && (
        <SellTradeModal
          isOpen={isSellTradeModalOpen}
          onClose={() => setIsSellTradeModalOpen(false)}
          trade={selectedTradeForSale}
          onConfirm={handleSellTrade}
        />
      )}
    </div>
  );
}