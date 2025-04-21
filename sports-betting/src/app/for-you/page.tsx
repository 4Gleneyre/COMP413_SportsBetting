'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Event } from '@/types/events';
import type { Post } from '@/types/post';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import GameInfoModal from '@/components/GameInfoModal';
import BettingModal from '@/components/BettingModal';
import PostItem from '@/components/PostItem';

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
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' | 'draw' } | null>(null);
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

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

  /**
   * Fetch latest posts from Firestore
   */
  const fetchLatestPosts = async () => {
    try {
      setLoadingPosts(true);
      const postsRef = collection(db, 'posts');
      const q = query(
        postsRef,
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      
      const postsData: Post[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
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
      
      setPosts(postsData);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Fetch top events on component mount
  useEffect(() => {
    fetchTopEvents();
    fetchLatestPosts();
    
    // Check URL for event parameter on page load
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('event');
    
    if (eventId) {
      fetchEventById(eventId);
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

      {/* Posts Section */}
      <div className="mt-10">
        <div className="flex items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Posts</h3>
        </div>
        
        {loadingPosts ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
                <div className="flex items-center mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-700 mr-3" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-1/4 mb-2" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/3" />
                  </div>
                </div>
                <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-md" />
              </div>
            ))}
          </div>
        ) : posts.length > 0 ? (
          <div className="space-y-6">
            {posts.map((post) => (
              <PostItem
                key={post.id}
                post={post}
                onPostDeleted={(postId) => setPosts(prev => prev.filter(p => p.id !== postId))}
              />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              No posts available yet. Check back later!
            </p>
          </div>
        )}
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
