import React from 'react';
import Image from 'next/image';
import type { Event } from '@/types/events';

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
      day: 'numeric'
    });
  };

  return (
    <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <p className="text-sm font-medium mb-2">Tag events in your post (select one or more):</p>
      <div className="max-h-60 overflow-y-auto space-y-2">
        {events.map(event => (
          <div
            key={event.id}
            onClick={() => toggleEventSelection(event.id)}
            className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${
              selectedEventIds.includes(event.id)
                ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
            }`}
          >
            <div className="flex-1 flex items-center">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
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
                
                <div className="ml-2">
                  <p className="text-sm font-medium">{event.home_team.full_name} vs {event.visitor_team.full_name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{formatEventDate(event.date)}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
