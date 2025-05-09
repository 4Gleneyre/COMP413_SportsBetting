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
  getDoc,
  setDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Event } from '@/types/events';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import DateRangePicker from '@/components/DateRangePicker';
import GameInfoModal from '@/components/GameInfoModal';
import BettingModal from '@/components/BettingModal';
import OddsHistoryChart from '@/components/OddsHistoryChart';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// Import the shared event fetching utility
import { fetchEvents, fetchEventById, formatEventDate } from '@/utils/eventFetching';

// Import the TeamLogo component from the main page
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

// Fix formatEventDate to handle various date formats
function safeFormatEventDate(dateValue: string | Date | undefined | null): string {
  if (!dateValue) return 'TBD';
  
  // If it's already a string, use it directly
  try {
    const dateString = typeof dateValue === 'string' 
      ? dateValue 
      : dateValue instanceof Date 
        ? dateValue.toISOString() 
        : 'TBD';
    return formatEventDate(dateString);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'TBD';
  }
}

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' | 'draw' } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDates, setFilterDates] = useState<[Date | null, Date | null]>([null, null]);
  const [sportFilter, setSportFilter] = useState<'soccer' | 'basketball' | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const { user } = useAuth();

  // Add debug logging for filterDates
  useEffect(() => {
    console.log('filterDates changed:', filterDates);
  }, [filterDates]);

  // Add debug logging for sport filter
  useEffect(() => {
    console.log('sportFilter changed:', sportFilter);
  }, [sportFilter]);

  // For Firestore pagination
  const lastDocRef = useRef<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Function to check if date is valid
  const isValidDate = (date: any): boolean => {
    if (!date) return false;
    
    // If it's a string date format
    if (typeof date === 'string') {
      const d = new Date(date);
      return d instanceof Date && !isNaN(d.getTime());
    }
    
    // If it's already a Date object
    if (date instanceof Date) {
      return !isNaN(date.getTime());
    }
    
    return false;
  };

  /**
   * Fetch event by ID from Firestore - now using shared utility
   */
  const handleFetchEventById = async (eventId: string | number | null) => {
    if (eventId === null || eventId === undefined) {
      console.error('No event ID provided');
      return;
    }
    
    try {
      const eventData = await fetchEventById(eventId);
      if (eventData) {
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
      handleFetchEventById(eventId);
      
      // Clean up the URL without reloading the page
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
    
    // Listen for custom event when event is selected from TradeConfirmationModal
    const handleEventSelected = (e: CustomEvent) => {
      if (e.detail && typeof e.detail === 'object' && 'eventId' in e.detail) {
        const { eventId } = e.detail;
        // eventId can be string or number, fetchEventById will handle it
        handleFetchEventById(eventId);
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

  // Reset pagination when filters change
  useEffect(() => {
    console.log('Filter dates changed - Resetting pagination');
    console.log('Previous lastDoc:', lastDocRef.current ? { id: lastDocRef.current.id, date: lastDocRef.current.data().date } : null);
    setEvents([]);
    setHasMore(true);
    lastDocRef.current = null;
    loadEvents();
  }, [searchQuery, filterDates, sportFilter]);

  /**
   * Fetch the next batch of events (10 at a time) using shared utility
   */
  const loadEvents = async () => {
    console.log('loadEvents called - current lastDoc:', lastDocRef.current ? { id: lastDocRef.current.id, date: lastDocRef.current.data().date } : null);
    
    if (!hasMore) {
      return;
    }

    setIsFetchingMore(true);

    try {
      // Convert filterDates to the format expected by fetchEvents
      const result = await fetchEvents({
        filterDates: filterDates,
        sportFilter: sportFilter,
        searchQuery: searchQuery,
        pageSize: 10,
        lastDoc: lastDocRef.current
      });

      const { events: newEvents, lastDoc, hasMore: moreResults } = result;

      // Update state with new events
      setEvents(prev => [...prev, ...newEvents]);
      lastDocRef.current = lastDoc; // Store lastDoc
      setHasMore(moreResults);
      setLoading(false);
      
    } catch (error) {
      console.error('Error loading events:', error);
      setLoading(false);
    } finally {
      setIsFetchingMore(false);
    }
  };

  // For infinite scroll functionality
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isFetchingMore) {
          loadEvents();
        }
      },
      { threshold: 0.5 }
    );

    const currentLoadMoreRef = loadMoreRef.current;
    if (currentLoadMoreRef) {
      observer.observe(currentLoadMoreRef);
    }

    return () => {
      if (currentLoadMoreRef) {
        observer.unobserve(currentLoadMoreRef);
      }
    };
  }, [hasMore, isFetchingMore]);

  // Initial fetch on component mount
  useEffect(() => {
    loadEvents();
  }, []);

  // Debug events data
  useEffect(() => {
    console.log('Events loaded:', events.length);
    if (events.length > 0) {
      const soccerEvents = events.filter(e => e.sport === 'soccer');
      console.log('Soccer events:', soccerEvents.length);
      if (soccerEvents.length > 0) {
        console.log('First soccer event:', soccerEvents[0]);
      }
    }
  }, [events]);

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

  // Filter events with valid dates - different handling for soccer vs basketball
  const validEvents = events.filter(event => {
    // Soccer events use 'datetime' or 'date' fields
    if (event.sport === 'soccer') {
      return isValidDate(event.datetime) || isValidDate(event.date);
    }
    
    // Basketball events use 'status' field
    return isValidDate(event.status);
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-3xl font-bold mb-8">Events</h2>
      
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 14.414V19a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Events List */}
      {validEvents.length === 0 && !loading && (
        <p className="text-gray-600 dark:text-gray-300">
          No upcoming events found.
        </p>
      )}
      <div className="space-y-4">
        {validEvents.map((event) => (
          <div
            key={event.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors relative"
            onClick={() => setSelectedEvent(event)}
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium">
                  {event.sport === 'soccer' ? 'Soccer' : 'Basketball'}
                </span>
                <div className="flex items-center gap-2">
                  {event.trades && (
                    <div className="flex items-center">
                      <span className="text-sm font-bold text-red-500">{event.trades.length}</span>
                      <span className="ml-1">
                        🔥
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
                <div className="text-left p-4">
                  <div className="flex items-center gap-4">
                    <TeamLogo
                      abbreviation={event.home_team.abbreviation || ''}
                      teamName={event.home_team.full_name || event.home_team.name || ''}
                      sport={event.sport}
                      teamId={event.home_team.id}
                    />
                    <div>
                      <div className="font-semibold text-lg">
                        {event.home_team.full_name || event.home_team.name || 'Home Team'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {event.homeTeamCurrentOdds || '0'}% chance
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center">
                  {event.sport === 'soccer' && event.drawOdds && (
                    <div className="text-sm bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400 px-2 py-1 rounded mb-1">
                      Draw: {event.drawOdds}%
                    </div>
                  )}
                  {event.sport === 'soccer' && event.competition && (
                    <div className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-3 py-1 rounded-full mb-2">
                      {event.competition.name}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">VS</div>
                </div>

                <div className="text-right p-4">
                  <div className="flex items-center justify-end gap-4">
                    <div>
                      <div className="font-semibold text-lg">
                        {event.visitor_team.full_name || event.visitor_team.name || 'Away Team'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {event.visitorTeamCurrentOdds || '0'}% chance
                      </div>
                    </div>
                    <TeamLogo
                      abbreviation={event.visitor_team.abbreviation || ''}
                      teamName={event.visitor_team.full_name || event.visitor_team.name || ''}
                      sport={event.sport}
                      teamId={event.visitor_team.id}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700 text-center text-xs mt-auto">
              <span className="text-gray-500 dark:text-gray-400">
                {event.sport === 'soccer' 
                  ? safeFormatEventDate(event.datetime || event.date) 
                  : safeFormatEventDate(event.status)}
              </span>
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
          onSelectTeam={(team: 'home' | 'visitor' | 'draw') => {
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
            
            {/* Date Range Filter */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date Range</label>
              <DateRangePicker
                startDate={filterDates[0]}
                endDate={filterDates[1]}
                onChange={setFilterDates}
              />
            </div>
            
            {/* Sport Filter */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sport</label>
              <div className="flex space-x-3">
                <button
                  onClick={() => setSportFilter(null)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    sportFilter === null
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setSportFilter('soccer')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    sportFilter === 'soccer'
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Soccer
                </button>
                <button
                  onClick={() => setSportFilter('basketball')}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    sportFilter === 'basketball'
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Basketball
                </button>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => { 
                  setFilterDates([null, null]);
                  setSportFilter(null);
                  setShowFilterModal(false);
                }}
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