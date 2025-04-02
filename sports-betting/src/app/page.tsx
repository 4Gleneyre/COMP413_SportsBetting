'use client';

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  orderBy,
  limit,
  startAfter,
  addDoc,
  updateDoc,
  doc,
  arrayUnion,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db, functions } from '@/lib/firebase';
import type { Event } from '@/types/events';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import DateRangePicker from '@/components/DateRangePicker';
import { httpsCallable } from "firebase/functions";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import OddsHistoryChart from '@/components/OddsHistoryChart';

interface BettingModalProps {
  event: Event;
  selectedTeam: 'home' | 'visitor';
  onClose: () => void;
}

interface GameInfoModalProps {
  event: Event;
  onClose: () => void;
  onSelectTeam: (team: 'home' | 'visitor') => void;
}

function GameInfoModal({ event, onClose, onSelectTeam }: GameInfoModalProps) {
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<{analysis: string, citations: Array<{text: string, url: string, title: string}>, metadata: any} | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const getGameBettingAnalysisFunction = httpsCallable(functions, "getGameBettingAnalysis");

  const generateAnalysis = async () => {
    setIsGeneratingAnalysis(true);
    setAnalysisError(null);
    
    try {
      // Format the date in YYYY-MM-DD format
      const gameDate = new Date(event.status).toISOString().split('T')[0];
      
      // Call the Cloud Function
      const result = await getGameBettingAnalysisFunction({
        homeTeam: event.home_team.full_name,
        awayTeam: event.visitor_team.full_name,
        gameDate: gameDate
      });
      
      // Set the analysis data
      setAnalysis(result.data as any);
    } catch (error: any) {
      console.error("Error generating analysis:", error);
      setAnalysisError(error.message || "Failed to generate analysis. Please try again.");
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Game Details</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex justify-between items-center mb-4">
          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium">
            Basketball
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(event.status).toLocaleDateString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </span>
        </div>
        
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Place a Bet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Select a team to bet on:</p>
          
          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
            <button
              onClick={() => onSelectTeam('home')}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group flex flex-col items-center h-40 w-full justify-between"
            >
              <div className="flex-1 flex items-center justify-center">
                <TeamLogo
                  abbreviation={event.home_team.abbreviation}
                  teamName={event.home_team.full_name}
                />
              </div>
              <div className="text-center">
                <span className="block font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate max-w-full">
                  {event.home_team.full_name}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 mt-1 block">{event.homeTeamCurrentOdds}% chance</span>
              </div>
            </button>
            
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-gray-500 dark:text-gray-400">VS</span>
            </div>
            
            <button
              onClick={() => onSelectTeam('visitor')}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group flex flex-col items-center h-40 w-full justify-between"
            >
              <div className="flex-1 flex items-center justify-center">
                <TeamLogo
                  abbreviation={event.visitor_team.abbreviation}
                  teamName={event.visitor_team.full_name}
                />
              </div>
              <div className="text-center">
                <span className="block font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate max-w-full">
                  {event.visitor_team.full_name}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 mt-1 block">{event.visitorTeamCurrentOdds}% chance</span>
              </div>
            </button>
          </div>
        </div>
        
        <div className="mb-6">
          <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold mb-4">Odds History</h3>
            <OddsHistoryChart 
              eventId={event.id.toString()}
              homeTeamName={event.home_team.name}
              visitorTeamName={event.visitor_team.name}
            />
          </div>
          
          <div className="mt-4 mb-6 flex justify-center">
            <button
              onClick={generateAnalysis}
              disabled={isGeneratingAnalysis}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingAnalysis ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Analysis...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate AI Analysis of Game
                </>
              )}
            </button>
          </div>
          
          {analysis && (
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">AI Betting Analysis</h3>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {analysis.analysis}
                </ReactMarkdown>
              </div>
              
              {analysis.citations && analysis.citations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <h4 className="text-sm font-medium mb-2">Sources</h4>
                  <ul className="text-xs text-gray-600 dark:text-gray-300">
                    {analysis.citations.map((citation, i) => (
                      <li key={i} className="mb-1">
                        <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          {citation.title || citation.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {analysisError && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
              <p>{analysisError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BettingModal({ event, selectedTeam, onClose }: BettingModalProps) {
  const [betAmount, setBetAmount] = useState<string>('');
  const [showAuthAlert, setShowAuthAlert] = useState(false);
  const [showBalanceAlert, setShowBalanceAlert] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const placeBetFunction = httpsCallable(functions, "placeBet");
  const { user } = useAuth();
  const teamName =
    selectedTeam === 'home'
      ? event.home_team.full_name
      : event.visitor_team.full_name;
  const selectedOdds = selectedTeam === 'home' 
    ? event.homeTeamCurrentOdds 
    : event.visitorTeamCurrentOdds;
  const numericAmount = Number(betAmount);
  const potentialPayout = numericAmount * (100 / selectedOdds);

  // Fetch user's balance when modal opens
  useEffect(() => {
    async function fetchUserBalance() {
      if (!user) return;
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        setUserBalance(userDoc.data().walletBalance || 0);
      }
    }
    fetchUserBalance();
  }, [user]);

  const handleBet = async () => {
    if (!user) {
      setShowAuthAlert(true);
      setTimeout(() => setShowAuthAlert(false), 3000);
      return;
    }
  
    // Check if user can afford the bet
    if (userBalance === null || numericAmount > userBalance) {
      setShowBalanceAlert(true);
      setTimeout(() => setShowBalanceAlert(false), 3000);
      return;
    }
  
    try {
      setIsPlacingBet(true);
  
      // Call the Cloud Function with the required parameters.
      const result = await placeBetFunction({
        eventId: event.id,
        betAmount: numericAmount,
        selectedTeam,
        selectedOdds: selectedOdds
      });
  
      // If successful, you can show a success message and close the modal.
      alert(`Bet placed successfully: $${betAmount} on ${teamName}`);
      onClose();
    } catch (error: any) {
      console.error("Error placing bet:", error);
      alert("Failed to place bet. Please try again.");
    } finally {
      setIsPlacingBet(false);
    }
  };  

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-2xl font-bold mb-6">Place Your Bet</h2>
        <div className="space-y-6">
          {userBalance !== null && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Available Balance: ${userBalance.toFixed(2)}
            </div>
          )}
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Selected Team</p>
            <p className="text-lg font-semibold">{teamName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Bet Amount</p>
            <input
              type="number"
              min="0"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-full p-3 border rounded-lg bg-transparent text-white border-gray-600 focus:border-white focus:ring-1 focus:ring-white outline-none"
              placeholder="Enter amount"
            />
          </div>
          {numericAmount > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">
                Potential Payout: ${potentialPayout.toFixed(2)}
              </p>
              <p className="text-xs text-green-500 dark:text-green-300 mt-1">
                Based on {selectedOdds}% odds
              </p>
            </div>
          )}
          {showAuthAlert && (
            <div className="bg-red-500/10 dark:bg-red-500/20 border border-red-200/20 px-4 py-3 rounded-md text-sm text-red-600 dark:text-red-300">
              You must be logged in to place a bet
            </div>
          )}
          {showBalanceAlert && (
            <div className="bg-red-500/10 dark:bg-red-500/20 border border-red-200/20 px-4 py-3 rounded-md text-sm text-red-600 dark:text-red-300">
              Insufficient balance to place this bet
            </div>
          )}
          <div className="flex gap-3">
            <button
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleBet}
              disabled={numericAmount <= 0 || isPlacingBet}
            >
              {isPlacingBet ? 'Placing Bet...' : 'Place Bet'}
            </button>
            <button
              className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={onClose}
              disabled={isPlacingBet}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamLogo({ abbreviation, teamName }: { abbreviation: string; teamName: string }) {
  const [imageExists, setImageExists] = useState(true);

  return imageExists ? (
    <Image
      src={`/logos/${abbreviation}.png`}
      alt={`${teamName} logo`}
      width={48}
      height={48}
      className="rounded-full"
      onError={() => setImageExists(false)}
    />
  ) : null;
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDates, setFilterDates] = useState<[Date | null, Date | null]>([null, null]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const { user } = useAuth();

  // Add debug logging for filterDates
  useEffect(() => {
    console.log('filterDates changed:', filterDates);
  }, [filterDates]);

  // For Firestore pagination
  const lastDocRef = useRef<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination when filters change
  useEffect(() => {
    console.log('Filter dates changed - Resetting pagination');
    console.log('Previous lastDoc:', lastDocRef.current ? { id: lastDocRef.current.id, date: lastDocRef.current.data().date } : null);
    setEvents([]);
    setHasMore(true);
    lastDocRef.current = null;
    fetchEvents();
  }, [searchQuery, filterDates]);

  /**
   * Fetch the next batch of events (10 at a time).
   */
  const fetchEvents = async () => {
    console.log('fetchEvents called - current lastDoc:', lastDocRef.current ? { id: lastDocRef.current.id, date: lastDocRef.current.data().date } : null);
    if (!hasMore) {
      return;
    }

    setIsFetchingMore(true);

    try {
      const eventsRef = collection(db, 'events');
      let constraints: any[] = [
        orderBy('date', 'asc'),
        orderBy('__name__', 'asc'),
        limit(10)
      ];
      
      // Add date filter if a date range is selected
      if (filterDates[0]) {
        const startDateStr = filterDates[0].toISOString().split('T')[0]; // Format: YYYY-MM-DD
        constraints.push(where('date', '>=', startDateStr));
        if (filterDates[1]) {
          const endDateStr = filterDates[1].toISOString().split('T')[0]; // Format: YYYY-MM-DD
          constraints.push(where('date', '<=', endDateStr));
        }
      } else {
        const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        constraints.push(where('date', '>=', today));
      }

      // Add pagination if there's a last document
      if (lastDocRef.current) {
        constraints.push(startAfter(lastDocRef.current.data().date, lastDocRef.current.id));
      }

      // Debug logging
      console.log('Query Debug Info:');
      console.log('Events Reference:', {
        path: eventsRef.path,
        id: eventsRef.id,
        type: eventsRef.type,
      });
      console.log('Constraints:', constraints.map(c => ({
        type: c.type,
        field: c.field,
        value: c.value,
        direction: c.direction, // for orderBy
        limit: c.limit, // for limit
      })));
      console.log('Last Doc:', lastDocRef.current ? { id: lastDocRef.current.id, date: lastDocRef.current.data().date } : null);

      let q = query(eventsRef, ...constraints);
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        let newEvents: Event[] = querySnapshot.docs.map((docSnap) => {
          const { id, ...data } = docSnap.data();
          return { id: docSnap.id, ...data } as Event;
        });        

        // Apply search filter in memory if search query exists
        if (searchQuery) {
          const searchLower = searchQuery.toLowerCase();
          newEvents = newEvents.filter(event => 
            event.home_team.full_name.toLowerCase().includes(searchLower) ||
            event.visitor_team.full_name.toLowerCase().includes(searchLower) ||
            event.home_team.city.toLowerCase().includes(searchLower) ||
            event.visitor_team.city.toLowerCase().includes(searchLower)
          );
        }

        setEvents(prev => {
          // Filter out events that already exist in the current state
          const newUniqueEvents = newEvents.filter(newEvent =>
            !prev.some(existingEvent => existingEvent.id === newEvent.id)
          );
          return [...prev, ...newUniqueEvents];
        });
        lastDocRef.current = querySnapshot.docs[querySnapshot.docs.length - 1];
        
        if (querySnapshot.size < 10) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setIsFetchingMore(false);
      setLoading(false);
    }
  };

  /**
   * Fetch initial 10 events on mount
   */
  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Set up an IntersectionObserver on a sentinel <div> to trigger fetch for next events.
   */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // If the sentinel is intersecting and we're not already fetching and there's more data
        if (entries[0].isIntersecting && !isFetchingMore && hasMore) {
          fetchEvents();
        }
      },
      {
        threshold: 1.0
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    // Cleanup
    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [loadMoreRef, hasMore, isFetchingMore]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-3xl font-bold mb-8">Available Events</h2>
      
      {/* Search and Filter Controls */}
      <div className="mb-6">
        <div className="flex">
          <input
            type="text"
            placeholder="Search teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-grow p-3 border border-gray-300 dark:border-gray-600 rounded-l-lg bg-transparent dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
          />
          <button
            onClick={() => setShowFilterModal(true)}
            className="p-3 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${filterDates[0] || filterDates[1] ? 'text-blue-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 14.414V19a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Events List */}
      {events.length === 0 && !loading && (
        <p className="text-gray-600 dark:text-gray-300">
          No upcoming events found.
        </p>
      )}
      <div className="space-y-4">
        {events.map((event) => (
          <div
            key={event.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors relative"
            onClick={() => setSelectedEvent(event)}
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium">
                  Basketball
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(event.status).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </span>
                  {event.trades && event.trades.length > 0 && (
                    <div className="relative group">
                      <span className="text-xl cursor-help">
                        🔥
                      </span>
                      <div className="absolute hidden group-hover:block right-0 top-full mt-2 px-4 py-2 bg-gray-900 text-white rounded-lg shadow-lg whitespace-nowrap z-10">
                        <span className="text-sm">
                          <span className="font-bold text-orange-400">{event.trades.length}</span> {event.trades.length === 1 ? 'user has' : 'users have'} bet on this game
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
                <div className="text-left p-4">
                  <div className="flex items-center gap-4">
                    <TeamLogo
                      abbreviation={event.home_team.abbreviation}
                      teamName={event.home_team.full_name}
                    />
                    <div>
                      <div className="font-semibold text-lg">
                        {event.home_team.full_name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {event.homeTeamCurrentOdds}% chance
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">VS</span>
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                </div>

                <div className="text-right p-4">
                  <div className="flex items-center justify-end gap-4">
                    <div>
                      <div className="font-semibold text-lg">
                        {event.visitor_team.full_name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {event.visitorTeamCurrentOdds}% chance
                      </div>
                    </div>
                    <TeamLogo
                      abbreviation={event.visitor_team.abbreviation}
                      teamName={event.visitor_team.full_name}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sentinel div for intersection observer */}
      {hasMore && (
        <div
          ref={loadMoreRef}
          className="flex items-center justify-center py-6 text-gray-500 dark:text-gray-400"
        >
          {isFetchingMore && <span>Loading more events...</span>}
        </div>
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

      {showFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black opacity-50" onClick={() => setShowFilterModal(false)}></div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg z-10 w-11/12 max-w-md">
            <h2 className="text-2xl font-bold mb-4">Filters</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date Range</label>
              <DateRangePicker
                startDate={filterDates[0]}
                endDate={filterDates[1]}
                onChange={setFilterDates}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => { setFilterDates([null, null]); setShowFilterModal(false); }}
              >
                Clear Filters
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                onClick={() => setShowFilterModal(false)}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
