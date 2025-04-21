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
import TeamLogo from '@/components/TeamLogo';

export default function ForYou() {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' | 'draw' } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);

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
      <h2 className="text-3xl font-bold mb-8">For You</h2>

      {/* Posts Section */}
      <div className="mt-10">
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
