'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import type { Event } from '@/types/events';
import { Timestamp } from 'firebase/firestore';

// Interfaces
interface Post {
  id: string;
  content: string;
  createdAt: Timestamp;
  userId: string;
  username: string;
  userPhotoURL?: string;
  taggedEvents?: string[]; // Array of event IDs that are tagged in this post
}

// TaggedEventItem Component
function TaggedEventItem({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchEvent() {
      try {
        const eventDoc = await getDoc(doc(db, 'events', eventId));
        if (eventDoc.exists()) {
          setEvent(eventDoc.data() as Event);
        }
      } catch (error) {
        console.error('Error fetching event:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [eventId]);

  const handleEventClick = () => {
    if (event) {
      // Update the URL with the event ID parameter without redirecting
      const url = new URL(window.location.href);
      url.searchParams.set('event', String(event.id));
      window.history.pushState({}, '', url);
      
      // Dispatch a custom event to notify that the URL has been updated with a new event ID
      window.dispatchEvent(new CustomEvent('eventSelected', { 
        detail: { eventId: String(event.id) } 
      }));
    }
  };

  if (loading) {
    return (
      <div className="h-12 bg-gray-100 dark:bg-gray-700 rounded-md animate-pulse"></div>
    );
  }

  if (!event) {
    return null;
  }

  return (
    <div 
      className="bg-gray-50 dark:bg-gray-800 rounded-md p-2 border border-gray-200 dark:border-gray-700 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors cursor-pointer"
      onClick={handleEventClick}
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <TeamLogo 
            abbreviation={event.home_team.abbreviation}
            teamName={event.home_team.full_name}
          />
        </div>
        <span className="text-xs font-medium">{event.home_team.full_name} vs {event.visitor_team.full_name}</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </div>
    </div>
  );
}

// TeamLogo Component
function TeamLogo({ abbreviation, teamName }: { abbreviation: string; teamName: string }) {
  const [imageExists, setImageExists] = useState(true);

  useEffect(() => {
    fetch(`/logos/${abbreviation}.png`)
      .then(res => {
        if (!res.ok) {
          setImageExists(false);
        }
      })
      .catch(() => setImageExists(false));
  }, [abbreviation]);

  if (!imageExists) {
    return null;
  }

  return (
    <Image
      src={`/logos/${abbreviation}.png`}
      alt={`${teamName} logo`}
      width={32}
      height={32}
      className="rounded-full"
    />
  );
}

// Main PostItem Component
export default function PostItem({ post }: { post: Post }) {
  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-md"
    >
      {/* Post Header with User Info */}
      <div className="flex items-center mb-3">
        {post.userPhotoURL ? (
          <Image
            src={post.userPhotoURL}
            alt={post.username}
            width={40}
            height={40}
            className="rounded-full mr-3"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 mr-3 flex items-center justify-center text-gray-600 dark:text-gray-300 font-semibold">
            {post.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-medium">{post.username}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {(() => {
              // Helper function to format date consistently
              const formatDate = (date: Date) => {
                return date.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                });
              };
              
              try {
                // Handle different timestamp formats
                if (typeof post.createdAt === 'string') {
                  return formatDate(new Date(post.createdAt));
                } else if (post.createdAt && typeof post.createdAt.toDate === 'function') {
                  // Firebase Timestamp object
                  return formatDate(post.createdAt.toDate());
                } else if (post.createdAt instanceof Date) {
                  return formatDate(post.createdAt);
                } else {
                  // Fallback for any other format - try to convert to Date
                  const timestamp = post.createdAt as any;
                  if (timestamp && timestamp.seconds) {
                    // Handle Firestore Timestamp format {seconds: number, nanoseconds: number}
                    return formatDate(new Date(timestamp.seconds * 1000));
                  }
                  return "Unknown date";
                }
              } catch (error) {
                console.error("Error formatting date:", error);
                return "Date error";
              }
            })()}
          </p>
        </div>
      </div>
      {/* Post Content */}
      <div className="text-gray-800 dark:text-gray-200 whitespace-pre-line">
        {post.content}
      </div>
      
      {/* Tagged Events */}
      {post.taggedEvents && post.taggedEvents.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Tagged events:</p>
          <div className="space-y-2">
            {post.taggedEvents.map(eventId => (
              <TaggedEventItem key={eventId} eventId={eventId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Export the Post interface for use in other components
export type { Post };
