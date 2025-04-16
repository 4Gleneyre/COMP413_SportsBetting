import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import type { Event } from '@/types/events';
import DateRangePicker from '@/components/DateRangePicker';

// Add TeamLogo component from events page
function TeamLogo({ abbreviation, teamName }: { abbreviation: string; teamName: string }) {
  const [imageExists, setImageExists] = React.useState(true);

  return imageExists ? (
    <Image
      src={`/logos/${abbreviation}.png`}
      alt={`${teamName} logo`}
      width={36}
      height={36}
      className="rounded-full"
      onError={() => setImageExists(false)}
    />
  ) : null;
}

interface EventSelectorProps {
  events: Event[];
  selectedEventIds: string[];
  toggleEventSelection: (eventId: string) => void;
  loading: boolean;
}

export default function EventSelector({ 
  events, 
  selectedEventIds, 
  toggleEventSelection,
  loading 
}: EventSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDates, setFilterDates] = useState<[Date | null, Date | null]>([null, null]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>(events);

  // Filter events based on search query and date range
  useEffect(() => {
    let filtered = [...events];
    
    // Apply search filter if search query exists
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filtered = filtered.filter(event => 
        event.home_team.full_name.toLowerCase().includes(searchLower) ||
        event.visitor_team.full_name.toLowerCase().includes(searchLower) ||
        event.home_team.city?.toLowerCase().includes(searchLower) ||
        event.visitor_team.city?.toLowerCase().includes(searchLower)
      );
    }
    
    // Apply date filter if a date range is selected
    if (filterDates[0]) {
      const startDate = filterDates[0];
      filtered = filtered.filter(event => {
        const eventDate = new Date(event.status);
        return eventDate >= startDate;
      });
      
      if (filterDates[1]) {
        const endDate = filterDates[1];
        filtered = filtered.filter(event => {
          const eventDate = new Date(event.status);
          return eventDate <= endDate;
        });
      }
    }
    
    setFilteredEvents(filtered);
  }, [events, searchQuery, filterDates]);

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

  // Format date for display
  const formatEventDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <p className="text-sm font-medium mb-3">Tag events in your post (select one or more):</p>
      
      {/* Search and Filter Controls */}
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
      
      {/* Date Range Picker */}
      {showFilterModal && (
        <div className="mb-4">
          <DateRangePicker
            startDate={filterDates[0]}
            endDate={filterDates[1]}
            onChange={setFilterDates}
          />
        </div>
      )}
      
      {/* Filter chips */}
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
      
      {/* No results message */}
      {filteredEvents.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 my-4">No events match your search criteria.</p>
      )}
      
      {/* Events List */}
      <div className="max-h-60 overflow-y-auto space-y-3">
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
              {/* Selection indicator */}
              <div className="flex justify-between items-center mb-2">
                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full text-xs font-medium">
                  Basketball
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
              
              {/* Teams information with logos and win percentages */}
              <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                {/* Home team */}
                <div className="text-left">
                  <div className="flex items-center gap-3">
                    <TeamLogo
                      abbreviation={event.home_team.abbreviation}
                      teamName={event.home_team.full_name}
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

                {/* VS indicator */}
                <div className="flex flex-col items-center justify-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">VS</div>
                </div>

                {/* Visitor team */}
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
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Date/time footer */}
            <div className="p-2 bg-gray-50 dark:bg-gray-700 text-center text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                {formatEventDate(event.status)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
