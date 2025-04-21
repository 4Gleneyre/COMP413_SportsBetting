import { Timestamp } from 'firebase/firestore';

/**
 * Interface representing a user post in the system
 */
export interface Post {
  id: string;
  content: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp | string | null; 
  userId: string;
  username: string;
  userPhotoURL?: string;
  mediaUrl?: string; // URL to the uploaded image or video
  mediaType?: 'image' | 'video'; // Type of media
  taggedEvents?: string[]; // Array of event IDs that are tagged in this post
}
