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

// Import the TeamLogo component from the main page
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

export default function Events() {
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

  // Function to check if date is valid
  const isValidDate = (date: any): boolean => {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  };

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
   * Fetch initial events on mount
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

  // Filter events with valid dates
  const validEvents = events.filter(event => event.status && isValidDate(event.status));

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
                  Basketball
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

                <div className="flex flex-col items-center justify-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">VS</div>
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
            
            {/* Footer */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700 text-center text-xs mt-auto">
              <span className="text-gray-500 dark:text-gray-400">
                {new Date(event.status).toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
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
          onSelectTeam={(team: 'home' | 'visitor') => {
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