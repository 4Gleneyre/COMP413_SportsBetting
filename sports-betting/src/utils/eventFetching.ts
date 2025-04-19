import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDoc,
  doc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Event } from '@/types/events';

/**
 * Interface for filter options when fetching events
 */
export interface EventFetchOptions {
  filterDates?: [Date | null, Date | null];
  searchQuery?: string;
  pageSize?: number;
  lastDoc?: any;
}

/**
 * Fetch events from Firestore with filtering and pagination
 */
export const fetchEvents = async (options: EventFetchOptions = {}) => {
  const {
    filterDates = [null, null],
    pageSize = 10,
    lastDoc = null
  } = options;

  try {
    const eventsRef = collection(db, 'events');
    let constraints: any[] = [
      orderBy('date', 'asc'),
      orderBy('__name__', 'asc'),
      limit(pageSize)
    ];
    
    // Add date filter if a date range is selected
    if (filterDates[0]) {
      const startDateStr = filterDates[0].toISOString().split('T')[0]; // Format: YYYY-MM-DD
      constraints.push(where('date', '>=', startDateStr));
      if (filterDates[1]) {
        const endDateStr = filterDates[1].toISOString().split('T')[0]; // Format: YYYY-MM-DD
        constraints.push(where('date', '<=', endDateStr));
      }
    } else {
      // Default to only showing events from today and later
      const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
      constraints.push(where('date', '>=', today));
    }

    // Add pagination if there's a last document
    if (lastDoc) {
      constraints.push(startAfter(lastDoc.data().date, lastDoc.id));
    }

    // Create and execute query
    let q = query(eventsRef, ...constraints);
    const querySnapshot = await getDocs(q);
    
    // Process results
    if (!querySnapshot.empty) {
      const newEvents: Event[] = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Event;
        return {
          ...data,
          id: docSnap.id,
        };
      });

      // Return both events and the last document for pagination
      return {
        events: newEvents,
        lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1],
        hasMore: querySnapshot.docs.length === pageSize
      };
    } else {
      return {
        events: [],
        lastDoc: null,
        hasMore: false
      };
    }
  } catch (error) {
    console.error('Error fetching events:', error);
    return {
      events: [],
      lastDoc: null,
      hasMore: false,
      error
    };
  }
};

/**
 * Fetch a single event by ID from Firestore
 */
export const fetchEventById = async (eventId: string | number | null) => {
  if (eventId === null || eventId === undefined) {
    console.error('No event ID provided');
    return null;
  }
  
  // Always convert to string for Firestore
  const docId = String(eventId);
  
  try {
    const eventDoc = await getDoc(doc(db, 'events', docId));
    if (eventDoc.exists()) {
      const eventData = eventDoc.data() as Event;
      return {
        ...eventData,
        id: eventDoc.id
      };
    } else {
      console.error('Event document does not exist');
      return null;
    }
  } catch (error) {
    console.error('Error fetching event by ID:', error);
    return null;
  }
};

/**
 * Format date for display
 */
export const formatEventDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};