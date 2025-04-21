'use client';

import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import Image from 'next/image';
import type { Event } from '@/types/events';
import type { Post } from '@/types/post';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { FaEdit, FaCheck, FaTimes, FaTrash } from 'react-icons/fa';
import EventSelector from './EventSelector';
import { useRouter } from 'next/navigation';

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
export default function PostItem({ post, onPostDeleted }: { post: Post; onPostDeleted?: (postId: string) => void }) {
  const { user } = useAuth();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(post.content);
  const [taggedEvents, setTaggedEvents] = useState<string[]>(post.taggedEvents || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [availableEvents, setAvailableEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>(post.mediaUrl || '');
  const [mediaType, setMediaType] = useState<'image' | 'video' | undefined>(post.mediaType);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [keepExistingMedia, setKeepExistingMedia] = useState(!!post.mediaUrl);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if current user is the author of the post
  const isPostAuthor = user?.uid === post.userId;

  // Update local state when post prop changes
  useEffect(() => {
    setEditedContent(post.content);
    setTaggedEvents(post.taggedEvents || []);
    setMediaPreview(post.mediaUrl || '');
    setMediaType(post.mediaType);
    setKeepExistingMedia(!!post.mediaUrl);
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

  // Handle file selection for media upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const fileType = file.type.split('/')[0];
    if (fileType !== 'image' && fileType !== 'video') {
      setError('Only image and video files are allowed.');
      return;
    }

    // Set the selected file
    setMediaFile(file);
    
    // Create a preview URL
    const objectUrl = URL.createObjectURL(file);
    setMediaPreview(objectUrl);
    
    // Set the media type
    setMediaType(fileType as 'image' | 'video');
    
    // We're replacing the existing media
    setKeepExistingMedia(false);
    
    // Reset upload progress
    setUploadProgress(0);
  };

  // Function to remove selected/existing media
  const handleRemoveMedia = () => {
    setKeepExistingMedia(false);
    setMediaFile(null);
    setMediaPreview('');
    setMediaType(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleEditSubmit = async () => {
    if (!editedContent.trim()) {
      setError('Post content cannot be empty');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      let mediaUrl = post.mediaUrl || '';
      let mediaTypeValue = post.mediaType;
      
      // If there's a new media file selected, upload it
      if (mediaFile) {
        const fileExtension = mediaFile.name.split('.').pop()?.toLowerCase() || '';
        const fileName = `post_media/${post.userId}/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
        const storageRef = ref(storage, fileName);
        
        // Upload the file
        const uploadTask = uploadBytesResumable(storageRef, mediaFile);
        
        // Wait for upload to complete
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              // Track upload progress
              const progress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              setUploadProgress(progress);
            },
            (error) => {
              console.error('Error uploading file:', error);
              reject(error);
            },
            async () => {
              // Get the download URL
              mediaUrl = await getDownloadURL(uploadTask.snapshot.ref);
              
              // Determine media type based on file extension
              if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
                mediaTypeValue = 'image';
              } else if (['mp4', 'webm', 'ogg', 'mov'].includes(fileExtension)) {
                mediaTypeValue = 'video';
              }
              
              resolve();
            }
          );
        });
      } else if (!keepExistingMedia && post.mediaUrl) {
        // If we're removing the existing media, attempt to delete it from storage
        try {
          // Extract the path from the URL
          const urlObj = new URL(post.mediaUrl);
          const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(?:\?|$)/);
          
          if (pathMatch && pathMatch[1]) {
            const decodedPath = decodeURIComponent(pathMatch[1]);
            const storageRef = ref(storage, decodedPath);
            await deleteObject(storageRef);
            console.log('Deleted existing media file');
          }
        } catch (err) {
          console.error('Error deleting existing media:', err);
          // Continue with the edit even if deletion fails
        }
        
        // Clear the media URL and type
        mediaUrl = '';
        mediaTypeValue = undefined;
      }
      
      const editPost = httpsCallable(functions, 'editPost');
      const result = await editPost({
        postId: post.id,
        content: editedContent,
        taggedEvents: taggedEvents,
        mediaUrl,
        mediaType: mediaTypeValue
      });
      
      // Update the local state with the edited content, tagged events, and media
      post.content = editedContent;
      post.taggedEvents = taggedEvents;
      post.updatedAt = Timestamp.now();
      post.mediaUrl = mediaUrl;
      post.mediaType = mediaTypeValue;
      
      // Reset state
      setIsEditing(false);
      setMediaFile(null);
      setUploadProgress(0);
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
    setMediaFile(null);
    setMediaPreview(post.mediaUrl || '');
    setMediaType(post.mediaType);
    setKeepExistingMedia(!!post.mediaUrl);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle post deletion
  const handleDeletePost = async () => {
    if (!isPostAuthor || !post.id) return;
    
    setIsDeleting(true);
    
    try {
      // If the post has media, attempt to delete it from storage
      if (post.mediaUrl) {
        try {
          // Extract the path from the URL
          const urlObj = new URL(post.mediaUrl);
          const pathMatch = urlObj.pathname.match(/\/o\/(.+?)(?:\?|$)/);
          
          if (pathMatch && pathMatch[1]) {
            const decodedPath = decodeURIComponent(pathMatch[1]);
            const storageRef = ref(storage, decodedPath);
            await deleteObject(storageRef);
            console.log('Deleted media file');
          }
        } catch (err) {
          console.error('Error deleting media:', err);
          // Continue with the delete even if media deletion fails
        }
      }
      
      // Call the cloud function to delete the post
      const deletePost = httpsCallable(functions, 'deletePost');
      await deletePost({ postId: post.id });
      
      // If onPostDeleted callback is provided, call it
      if (onPostDeleted) {
        onPostDeleted(post.id);
      }
      
      console.log('Post deleted successfully');
    } catch (err: any) {
      console.error('Error deleting post:', err);
      alert(err.message || 'Failed to delete post');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Cancel delete confirmation
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  // Handle navigating to user profile
  const handleUserProfileClick = (userId: string, username: string) => {
    router.push(`/profile?userId=${userId}&username=${encodeURIComponent(username)}`);
  };

  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-md"
    >
      {/* Post Header with User Info & Edit/Delete Buttons */}
      <div className="flex items-center mb-3">
        <div 
          onClick={() => handleUserProfileClick(post.userId, post.username)}
          className="flex items-center cursor-pointer hover:opacity-80 transition-opacity"
        >
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
            <p className="font-medium text-blue-600 dark:text-blue-400 hover:underline">{post.username}</p>
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
        </div>
        {isPostAuthor && !isEditing && !showDeleteConfirm && (
          <div className="flex space-x-2">
            <button 
              onClick={() => setIsEditing(true)}
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Edit post"
            >
              <FaEdit size={18} />
            </button>
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Delete post"
            >
              <FaTrash size={18} />
            </button>
          </div>
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
        {showDeleteConfirm && (
          <div className="flex space-x-2">
            <button 
              onClick={handleDeletePost}
              disabled={isDeleting}
              className="text-green-500 hover:text-green-600 dark:text-green-400 dark:hover:text-green-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              aria-label="Confirm delete"
            >
              <FaCheck size={18} />
            </button>
            <button 
              onClick={cancelDelete}
              className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Cancel delete"
            >
              <FaTimes size={18} />
            </button>
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Message */}
      {showDeleteConfirm && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          <p>Are you sure you want to delete this post? This action cannot be undone.</p>
        </div>
      )}
      
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
          
          {/* Media Preview in edit mode */}
          {mediaPreview && (
            <div className="relative mt-3 mb-3 border rounded-lg overflow-hidden">
              {mediaType === 'image' ? (
                <img 
                  src={mediaPreview} 
                  alt="Post image" 
                  className="w-full max-h-80 object-contain"
                />
              ) : mediaType === 'video' ? (
                <video 
                  src={mediaPreview} 
                  controls 
                  className="w-full max-h-80"
                />
              ) : null}
              
              {/* Upload progress indicator */}
              {isSubmitting && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="absolute bottom-0 left-0 right-0 bg-gray-200 h-1">
                  <div 
                    className="bg-blue-500 h-1" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              )}
              
              {/* Remove button */}
              <button
                type="button"
                onClick={handleRemoveMedia}
                className="absolute top-2 right-2 bg-gray-900/70 text-white rounded-full p-1 hover:bg-gray-900"
                aria-label="Remove media"
              >
                <FaTrash size={16} />
              </button>
            </div>
          )}
          
          {/* Media controls */}
          <div className="flex justify-between mt-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center px-3 py-1.5 text-sm rounded-lg border bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {mediaPreview ? 'Change Media' : 'Add Media'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,video/*"
              className="hidden"
            />
          </div>
          
          {/* Event Selector */}
          <div className="mt-4">
            <EventSelector
              selectedEventIds={taggedEvents}
              toggleEventSelection={toggleEventSelection}
            />
          </div>
        </div>
      ) : (
        <div>
          <div className="text-gray-800 dark:text-gray-200 whitespace-pre-line">
            {post.content}
          </div>
          
          {/* Display media in view mode */}
          {post.mediaUrl && (
            <div className="mt-3 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              {post.mediaType === 'image' ? (
                <img 
                  src={post.mediaUrl} 
                  alt="Post image" 
                  className="w-full max-h-96 object-contain"
                />
              ) : post.mediaType === 'video' ? (
                <video 
                  src={post.mediaUrl} 
                  controls 
                  className="w-full max-h-96"
                />
              ) : null}
            </div>
          )}
        </div>
      )}
      
      {/* Tagged Events */}
      {post.taggedEvents && post.taggedEvents.length > 0 && !isEditing && (
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
