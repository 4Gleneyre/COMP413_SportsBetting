'use client';

import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import type { Event } from '@/types/events';
import type { Post } from '@/types/post';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { FaEdit, FaCheck, FaTimes } from 'react-icons/fa';
import EventSelector from './EventSelector';

// TaggedEventItem Component
function TaggedEventItem({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for real-time updates to this event
    const unsub = onSnapshot(doc(db, 'events', eventId), (eventDoc) => {
      if (eventDoc.exists()) {
        setEvent(eventDoc.data() as Event);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error listening for event:', error);
      setLoading(false);
    });
    return () => unsub();
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
      <div className="min-w-[300px] h-32 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse"></div>
    );
  }

  if (!event) {
    return null;
  }

  return (
    <div 
      className="flex-shrink-0 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md min-w-[300px] max-w-[400px] hover:border-blue-400 dark:hover:border-blue-500"
      onClick={handleEventClick}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-gray-50 dark:bg-gray-600/50 p-2 rounded-full">
              <TeamLogo
                abbreviation={event.home_team.abbreviation}
                teamName={event.home_team.full_name}
              />
            </div>
            <div>
              <span className="font-medium block">{event.home_team.full_name}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{event.homeTeamCurrentOdds || '--'}% odds</span>
            </div>
          </div>
          
          <div className="flex-none text-center mx-2">
            <span className="text-gray-500 dark:text-gray-400 font-medium">vs</span>
          </div>
          
          <div className="flex items-center gap-3">
            <div>
              <span className="font-medium block">{event.visitor_team.full_name}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{event.visitorTeamCurrentOdds || '--'}% odds</span>
            </div>
            <div className="bg-gray-50 dark:bg-gray-600/50 p-2 rounded-full">
              <TeamLogo
                abbreviation={event.visitor_team.abbreviation}
                teamName={event.visitor_team.full_name}
              />
            </div>
          </div>
        </div>
        
        <div className="mt-1 flex justify-between items-center">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(event.date).toLocaleDateString(undefined, { 
              weekday: 'short',
              month: 'short', 
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </span>
          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
            View event →
          </span>
        </div>
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
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content);
  const [taggedEvents, setTaggedEvents] = useState<string[]>(post.taggedEvents || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [availableEvents, setAvailableEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Check if current user is the author of the post
  const isPostAuthor = user?.uid === post.userId;

  // Update local state when post prop changes
  useEffect(() => {
    setEditedContent(post.content);
    setTaggedEvents(post.taggedEvents || []);
  }, [post]);

  // Load available events when editing mode is activated
  useEffect(() => {
    if (isEditing) {
      setLoadingEvents(true);
      // Fetch upcoming events for the event selector
      const eventsQuery = query(
        collection(db, "events"),
        where("status", ">=", new Date().toISOString()),
        orderBy("status", "asc"),
        limit(20)
      );
      
      const unsubscribe = onSnapshot(eventsQuery, (snapshot) => {
        const eventsList: Event[] = [];
        snapshot.forEach((doc) => {
          eventsList.push({ id: doc.id, ...doc.data() } as Event);
        });
        setAvailableEvents(eventsList);
        setLoadingEvents(false);
      }, (error) => {
        console.error("Error fetching events:", error);
        setLoadingEvents(false);
      });
      
      return () => unsubscribe();
    }
  }, [isEditing]);

  // Toggle event selection
  const toggleEventSelection = (eventId: string) => {
    setTaggedEvents(prev => {
      if (prev.includes(eventId)) {
        return prev.filter(id => id !== eventId);
      } else {
        return [...prev, eventId];
      }
    });
  };

  const handleEditSubmit = async () => {
    if (!editedContent.trim()) {
      setError('Post content cannot be empty');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const editPost = httpsCallable(functions, 'editPost');
      const result = await editPost({
        postId: post.id,
        content: editedContent,
        taggedEvents: taggedEvents
      });
      
      // Update the local state with the edited content and tagged events
      post.content = editedContent;
      post.taggedEvents = taggedEvents;
      post.updatedAt = Timestamp.now();
      
      setIsEditing(false);
    } catch (err: any) {
      console.error('Error editing post:', err);
      setError(err.message || 'Failed to edit post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(post.content);
    setTaggedEvents(post.taggedEvents || []);
    setError('');
  };

  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-md"
    >
      {/* Post Header with User Info & Edit Button */}
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
        <div className="flex-grow">
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
            {post.updatedAt && ' • Edited'}
          </p>
        </div>
        {isPostAuthor && !isEditing && (
          <button 
            onClick={() => setIsEditing(true)}
            className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Edit post"
          >
            <FaEdit size={18} />
          </button>
        )}
        {isEditing && (
          <div className="flex space-x-2">
            <button 
              onClick={handleEditSubmit}
              disabled={isSubmitting}
              className="text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              aria-label="Save edit"
            >
              <FaCheck size={18} />
            </button>
            <button 
              onClick={handleCancelEdit}
              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Cancel edit"
            >
              <FaTimes size={18} />
            </button>
          </div>
        )}
      </div>
      
      {/* Post Content */}
      {isEditing ? (
        <div className="mt-2 mb-4">
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white resize-y min-h-[120px]"
            placeholder="What's on your mind?"
            disabled={isSubmitting}
          />
          {error && <p className="text-red-500 mt-1 text-sm">{error}</p>}
          
          {/* Event Selector */}
          <div className="mt-4">
            <EventSelector
              events={availableEvents}
              selectedEventIds={taggedEvents}
              toggleEventSelection={toggleEventSelection}
              loading={loadingEvents}
            />
          </div>
        </div>
      ) : (
        <div className="text-gray-800 dark:text-gray-200 whitespace-pre-line">
          {post.content}
        </div>
      )}
      
      {/* Tagged Events */}
      {post.taggedEvents && post.taggedEvents.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">Tagged events:</p>
            {post.taggedEvents.length > 1 && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Scroll to see more →
              </p>
            )}
          </div>
          <div className="flex overflow-x-auto pb-2 -mx-2 px-2 gap-4 snap-x">
            {post.taggedEvents.map((eventId, index) => (
              <TaggedEventItem 
                key={eventId} 
                eventId={eventId} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
