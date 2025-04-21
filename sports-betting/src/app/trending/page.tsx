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
import TeamLogo from '@/components/TeamLogo';
import GameInfoModal from '@/components/GameInfoModal';
import BettingModal from '@/components/BettingModal';

export default function TrendingPage() {
  const [topEvents, setTopEvents] = useState<Event[]>([]);
  const [loadingTopEvents, setLoadingTopEvents] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' | 'draw' } | null>(null);

  const isValidDate = (date: any): boolean => {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  };

  const fetchTopEvents = async () => {
    try {
      const eventsRef = collection(db, 'events');
      const currentDate = new Date().toISOString().split('T')[0];
      const q = query(
        eventsRef,
        where('date', '>=', currentDate),
        orderBy('date', 'asc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        let allEvents: Event[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Event));
        allEvents = allEvents.filter(e => e.status && isValidDate(e.status));
        allEvents.sort((a, b) => {
          const aCount = a.trades?.length || 0;
          const bCount = b.trades?.length || 0;
          if (bCount !== aCount) return bCount - aCount;
          return new Date(a.status).getTime() - new Date(b.status).getTime();
        });
        setTopEvents(allEvents.slice(0, 5));
      }
    } catch (err) {
      console.error('Error fetching top events:', err);
    } finally {
      setLoadingTopEvents(false);
    }
  };

  useEffect(() => { fetchTopEvents(); }, []);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Trending Events </h3>
      <div className="mb-10 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loadingTopEvents ? (
          <div className="p-4">
            <div className="animate-pulse flex space-x-4 overflow-x-auto pb-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div
                  key={i}
                  className="flex-shrink-0 w-64 h-80 bg-gray-200 dark:bg-gray-700 rounded-lg"
                />
              ))}
            </div>
          </div>
        ) : topEvents.length > 0 ? (
          <div className="p-4">
            <div className="flex space-x-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
              {topEvents.map((event, idx) => {
                let medalStyle = '';
                if (idx === 0) medalStyle = '';
                else if (idx === 1) medalStyle = '';
                else if (idx === 2) medalStyle = '';
                return (
                  <div
                    key={event.id}
                    className={`flex-shrink-0 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors relative ${medalStyle} flex flex-col h-96`}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="absolute top-0 left-0 w-8 h-8 bg-red-600 flex items-center justify-center text-white font-bold rounded-br-lg z-10">#{idx+1}</div>
                    <div className="p-3 pt-4 flex justify-end">
                      {event.trades && (
                        <div className="flex items-center">
                          <span className="text-sm font-bold text-red-500">{event.trades.length}</span>
                          <span className="ml-1">🔥</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="mb-4 flex flex-col items-center">
                        <TeamLogo abbreviation={event.home_team?.abbreviation} teamName={event.home_team?.full_name} />
                        <div className="text-center">
                          <div className="font-semibold">{event.home_team?.full_name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{event.homeTeamCurrentOdds}% chance</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-center my-4">
                        <div className="px-4 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-500 dark:text-gray-400">VS</div>
                      </div>
                      <div className="mt-4 flex flex-col items-center">
                        <TeamLogo abbreviation={event.visitor_team?.abbreviation} teamName={event.visitor_team?.full_name} />
                        <div className="text-center">
                          <div className="font-semibold">{event.visitor_team?.full_name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{event.visitorTeamCurrentOdds}% chance</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto p-3 bg-gray-50 dark:bg-gray-700 text-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        {isValidDate(event.status)
                          ? new Date(event.status).toLocaleDateString(undefined, {
                              weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                            })
                          : 'Date unavailable'}
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
      {selectedBet && (
        <BettingModal event={selectedBet.event} selectedTeam={selectedBet.team} onClose={() => setSelectedBet(null)} />
      )}
    </div>
  );
}
