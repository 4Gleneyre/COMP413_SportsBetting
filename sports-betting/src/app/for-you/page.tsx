'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Event } from '@/types/events';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import GameInfoModal from '@/components/GameInfoModal';
import BettingModal from '@/components/BettingModal';

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

export default function ForYou() {
  const [topEvents, setTopEvents] = useState<Event[]>([]);
  const [loadingTopEvents, setLoadingTopEvents] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' } | null>(null);
  const { user } = useAuth();

  // Function to check if date is valid
  const isValidDate = (date: any): boolean => {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  };

  /**
   * Fetch top 5 events with most bets
   */
  const fetchTopEvents = async () => {
    try {
      const eventsRef = collection(db, 'events');
      const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      // Get events from current date onwards
      const q = query(
        eventsRef,
        where('date', '>=', currentDate),
        orderBy('date', 'asc'),
        // We need to fetch more than 5 to sort by trades count
        limit(20)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        // Convert to Event objects
        let allEvents: Event[] = querySnapshot.docs.map((docSnap) => {
          const { id, ...data } = docSnap.data();
          return { id: docSnap.id, ...data } as Event;
        });
        
        // Filter out events with invalid dates
        allEvents = allEvents.filter(event => event.status && isValidDate(event.status));
        
        // Sort by number of trades (bets) and then by date
        allEvents.sort((a, b) => {
          // First sort by number of trades (most to least)
          const aTradesCount = a.trades?.length || 0;
          const bTradesCount = b.trades?.length || 0;
          
          if (bTradesCount !== aTradesCount) {
            return bTradesCount - aTradesCount;
          }
          
          // If number of trades is the same, sort by date (soonest first)
          const aDate = new Date(a.status);
          const bDate = new Date(b.status);
          return aDate.getTime() - bDate.getTime();
        });
        
        // Take top 5
        setTopEvents(allEvents.slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching top events:', error);
    } finally {
      setLoadingTopEvents(false);
    }
  };

  // Fetch top events on component mount
  useEffect(() => {
    fetchTopEvents();
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-3xl font-bold mb-8">For You Feed</h2>
      
      {/* Trending Events Panel */}
      <div className="mb-10 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4">
          <div className="flex items-center">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Trending Events 🔥</h3>
          </div>
        </div>
        
        {loadingTopEvents ? (
          <div className="p-4">
            <div className="animate-pulse flex space-x-4 overflow-x-auto pb-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex-shrink-0 w-64 h-80 bg-gray-200 dark:bg-gray-700 rounded-lg" />
              ))}
            </div>
          </div>
        ) : topEvents.length > 0 ? (
          <div className="p-4">
            <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
              {topEvents.map((event, index) => {
                // Define medal styles based on position
                let medalStyle = "";
                if (index === 0) {
                  medalStyle = ""; // Could add gold effect if desired
                } else if (index === 1) {
                  medalStyle = ""; // Could add silver effect if desired
                } else if (index === 2) {
                  medalStyle = ""; // Could add bronze effect if desired
                }
                
                return (
                  <div
                    key={event.id}
                    className={`flex-shrink-0 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors relative ${medalStyle} flex flex-col h-96`}
                    onClick={() => setSelectedEvent(event)}
                  >
                    {/* Ranking Badge */}
                    <div className="absolute top-0 left-0 w-8 h-8 bg-red-600 flex items-center justify-center text-white font-bold rounded-br-lg z-10">
                      #{index + 1}
                    </div>
                    
                    {/* Header with fire emoji */}
                    <div className="p-3 pt-4">
                      <div className="flex items-center justify-end">
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
                    
                    {/* Teams Section */}
                    <div className="p-4">
                      {/* Home Team */}
                      <div className="mb-4">
                        <div className="flex items-center justify-center mb-2">
                          <TeamLogo
                            abbreviation={event.home_team.abbreviation}
                            teamName={event.home_team.full_name}
                          />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold">
                            {event.home_team.full_name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {event.homeTeamCurrentOdds}% chance
                          </div>
                        </div>
                      </div>
                      
                      {/* VS Divider */}
                      <div className="flex items-center justify-center my-4">
                        <div className="px-4 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-500 dark:text-gray-400">
                          VS
                        </div>
                      </div>
                      
                      {/* Visitor Team */}
                      <div className="mt-4">
                        <div className="flex items-center justify-center mb-2">
                          <TeamLogo
                            abbreviation={event.visitor_team.abbreviation}
                            teamName={event.visitor_team.full_name}
                          />
                        </div>
                        <div className="text-center">
                          <div className="font-semibold">
                            {event.visitor_team.full_name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {event.visitorTeamCurrentOdds}% chance
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Footer with date and time */}
                    <div className="mt-auto p-3 bg-gray-50 dark:bg-gray-700 text-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isValidDate(event.status) ? new Date(event.status).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        }) : 'Date unavailable'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-gray-600 dark:text-gray-300 text-center p-8 border-t border-gray-200 dark:border-gray-700">
            No trending events available
          </div>
        )}
      </div>

      {/* Additional content can be added here */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden p-6 mb-6">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Personalized Recommendations</h3>
        <p className="text-gray-600 dark:text-gray-300">
          {user ? 
            "Based on your previous bets, we'll show personalized event recommendations here soon." :
            "Sign in to see personalized event recommendations."}
        </p>
      </div>
      
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
