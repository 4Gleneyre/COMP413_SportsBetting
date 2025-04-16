import { Timestamp } from 'firebase/firestore';

/**
 * Interface representing a user post in the system
 */
export interface Post {
  id: string;
  content: string;
  createdAt: Timestamp;
  userId: string;
  username: string;
  userPhotoURL?: string;
  taggedEvents?: string[]; // Array of event IDs that are tagged in this post
}
