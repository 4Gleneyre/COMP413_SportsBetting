import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import type { Event } from '@/types/events';
import DateRangePicker from '@/components/DateRangePicker';
import { formatEventDate, fetchEvents } from '@/utils/eventFetching';

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
      width={36}
      height={36}
      className="rounded-full"
      onError={() => setImageExists(false)}
    />
  ) : (
    // Fallback if image doesn't exist
    <div className="w-9 h-9 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs font-medium">
      {abbreviation?.substring(0, 2) || "?"}
    </div>
  );
}

interface EventSelectorProps {
  selectedEventIds: string[];
  toggleEventSelection: (eventId: string) => void;
}

export default function EventSelector({ 
  selectedEventIds, 
  toggleEventSelection
}: EventSelectorProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDates, setFilterDates] = useState<[Date | null, Date | null]>([null, null]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  
  // For pagination
  const lastDocRef = useRef<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Fetch events when filters change
  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      try {
        const result = await fetchEvents({
          filterDates,
          pageSize: 20 // Fetch more events initially to reduce additional calls
        });
        
        setEvents(result.events);
        lastDocRef.current = result.lastDoc;
        setHasMore(result.hasMore);
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadEvents();
  }, [filterDates]);
  
  // Load more events when user scrolls to the bottom
  const loadMoreEvents = async () => {
    if (!hasMore || isFetchingMore) return;
    
    setIsFetchingMore(true);
    try {
      const result = await fetchEvents({
        filterDates,
        lastDoc: lastDocRef.current,
        pageSize: 10
      });
      
      setEvents(prev => [...prev, ...result.events]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Error loading more events:', error);
    } finally {
      setIsFetchingMore(false);
    }
  };

  // Handle scrolling to bottom of event list to load more
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5 && hasMore && !isFetchingMore) {
      loadMoreEvents();
    }
  };

  // Filter events based on search query
  useEffect(() => {
    let filtered = [...events];
    
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(event => 
        event.home_team.full_name.toLowerCase().includes(searchLower) ||
        event.visitor_team.full_name.toLowerCase().includes(searchLower) ||
        event.home_team.city?.toLowerCase().includes(searchLower) ||
        event.visitor_team.city?.toLowerCase().includes(searchLower)
      );
    }
    
    setFilteredEvents(filtered);
  }, [events, searchQuery]);

  function safeFormatEventDate(dateValue: string | undefined | null): string {
    if (!dateValue) return 'TBD';
    
    try {
      return formatEventDate(dateValue);
    } catch (error) {
      console.error('Error formatting date:', error, dateValue);
      return 'TBD';
    }
  }

  if (loading) {
    return (
      <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 animate-pulse">
        <p className="text-sm font-medium mb-2">Loading events...</p>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-gray-200 dark:bg-gray-700 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">No upcoming events found.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <p className="text-sm font-medium mb-3">Tag events in your post (select one or more):</p>
      
      <div className="mb-4">
        <div className="flex">
          <input
            type="text"
            placeholder="Search teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-l-lg bg-transparent dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none text-sm"
          />
          <button
            onClick={() => setShowFilterModal(prev => !prev)}
            className="p-2 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 ${filterDates[0] || filterDates[1] ? 'text-blue-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 14.414V19a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
          </button>
        </div>
      </div>
      
      {showFilterModal && (
        <div className="mb-4">
          <DateRangePicker
            startDate={filterDates[0]}
            endDate={filterDates[1]}
            onChange={setFilterDates}
          />
        </div>
      )}
      
      {(filterDates[0] || filterDates[1]) && (
        <div className="flex gap-2 mb-3">
          {filterDates[0] && (
            <div className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-full px-3 py-1 text-xs flex items-center">
              <span>From: {filterDates[0].toLocaleDateString()}</span>
              <button 
                className="ml-1 text-blue-500 hover:text-blue-700"
                onClick={() => setFilterDates([null, filterDates[1]])}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
          {filterDates[1] && (
            <div className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 rounded-full px-3 py-1 text-xs flex items-center">
              <span>To: {filterDates[1].toLocaleDateString()}</span>
              <button 
                className="ml-1 text-blue-500 hover:text-blue-700"
                onClick={() => setFilterDates([filterDates[0], null])}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          )}
          {(filterDates[0] || filterDates[1]) && (
            <button 
              className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-3 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => setFilterDates([null, null])}
            >
              Clear all
            </button>
          )}
        </div>
      )}
      
      {filteredEvents.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 my-4">No events match your search criteria.</p>
      )}
      
      <div className="max-h-60 overflow-y-auto space-y-3" onScroll={handleScroll}>
        {filteredEvents.map(event => (
          <div
            key={event.id}
            onClick={() => toggleEventSelection(event.id)}
            className={`rounded-xl shadow-sm border overflow-hidden cursor-pointer transition-colors ${
              selectedEventIds.includes(event.id)
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
          >
            <div className="p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium">
                  {event.sport === 'soccer' ? 'Soccer' : 'Basketball'}
                </span>
                <div className="w-5 h-5 flex items-center justify-center">
                  {selectedEventIds.includes(event.id) ? (
                    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                <div className="text-left">
                  <div className="flex items-center gap-3">
                    <TeamLogo
                      abbreviation={event.home_team.abbreviation}
                      teamName={event.home_team.full_name}
                      sport={event.sport}
                      teamId={event.home_team.id}
                    />
                    <div>
                      <div className="font-semibold">
                        {event.home_team.full_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {event.homeTeamCurrentOdds || "50"}% chance
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">VS</div>
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-3">
                    <div>
                      <div className="font-semibold">
                        {event.visitor_team.full_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {event.visitorTeamCurrentOdds || "50"}% chance
                      </div>
                    </div>
                    <TeamLogo
                      abbreviation={event.visitor_team.abbreviation}
                      teamName={event.visitor_team.full_name}
                      sport={event.sport}
                      teamId={event.visitor_team.id}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-2 bg-gray-50 dark:bg-gray-700 text-center text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                {event.sport === 'soccer' 
                  ? safeFormatEventDate(event.datetime || event.date) 
                  : safeFormatEventDate(event.status)}
              </span>
            </div>
          </div>
        ))}
        
        {/* Loading more indicator */}
        {isFetchingMore && (
          <div className="py-2 text-center">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent"></div>
            <span className="ml-2 text-xs text-gray-500">Loading more...</span>
          </div>
        )}
      </div>
    </div>
  );
}
