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
    searchQuery = '',
    pageSize = 10,
    lastDoc = null
  } = options;

  try {
    const eventsRef = collection(db, 'events');
    let constraints: any[] = [];
    
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

    // If search query is provided, fetch a larger batch to search within
    const batchSize = searchQuery.trim() !== '' ? 500 : pageSize;
    
    constraints.push(
      orderBy('date', 'asc'),
      orderBy('__name__', 'asc'),
      limit(batchSize)
    );
    
    // Add pagination if there's a last document and no search query
    // (search resets pagination)
    if (lastDoc && searchQuery.trim() === '') {
      constraints.push(startAfter(lastDoc.data().date, lastDoc.id));
    }

    // Create and execute query
    let q = query(eventsRef, ...constraints);
    const querySnapshot = await getDocs(q);
    
    // Process results
    if (!querySnapshot.empty) {
      let newEvents: Event[] = querySnapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Event;
        return {
          ...data,
          id: docSnap.id,
        };
      });

      // Store the last document for pagination (before filtering)
      const lastDocument = querySnapshot.docs[querySnapshot.docs.length - 1];
      
      // Apply search filter if provided
      if (searchQuery.trim() !== '') {
        console.log(`Filtering ${newEvents.length} events by search query: "${searchQuery}"`);
        const searchLower = searchQuery.toLowerCase();
        newEvents = newEvents.filter(event => {
          const homeTeamName = (event.home_team?.full_name || event.home_team?.name || '').toLowerCase();
          const visitorTeamName = (event.visitor_team?.full_name || event.visitor_team?.name || '').toLowerCase();
          const homeTeamAbbr = (event.home_team?.abbreviation || '').toLowerCase();
          const visitorTeamAbbr = (event.visitor_team?.abbreviation || '').toLowerCase();
          
          return homeTeamName.includes(searchLower) || 
                 visitorTeamName.includes(searchLower) ||
                 homeTeamAbbr.includes(searchLower) ||
                 visitorTeamAbbr.includes(searchLower);
        });
        
        // Limit to pageSize after filtering
        newEvents = newEvents.slice(0, pageSize);
      }

      // Return events and pagination info
      return {
        events: newEvents,
        lastDoc: searchQuery.trim() !== '' ? null : lastDocument, // Don't use lastDoc with search
        hasMore: searchQuery.trim() !== '' 
          ? newEvents.length === pageSize  // For search, we estimate hasMore
          : querySnapshot.docs.length === batchSize // For regular queries, use batch size
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