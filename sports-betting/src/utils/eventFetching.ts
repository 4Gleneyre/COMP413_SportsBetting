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
  sportFilter?: 'soccer' | 'basketball' | null;
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
    sportFilter = null,
    searchQuery = '',
    pageSize = 10,
    lastDoc = null
  } = options;

  console.log('[fetchEvents] Options:', options); // Log incoming options

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

    // Add sport filter if selected
    if (sportFilter) {
      console.log(`[fetchEvents] Applying sport filter: ${sportFilter}`);
  if (sportFilter === 'soccer') {
    // only soccer
    constraints.push(where('sport', '==', 'soccer'));
  }
    }

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
    console.log('[fetchEvents] Query constraints:', constraints); // Log the final constraints
    let q = query(eventsRef, ...constraints);
    const querySnapshot = await getDocs(q);
    console.log(`[fetchEvents] Query returned ${querySnapshot.docs.length} documents.`); // Log number of docs returned
    
    // Process results
    if (!querySnapshot.empty) {
      let newEvents: Event[] = querySnapshot.docs.map((docSnap, index) => {
        const data = docSnap.data() as Event;
        console.log(`[fetchEvents] Doc ${index} sport:`, data.sport); // Log sport field of each doc
        return {
          ...data,
          id: docSnap.id,
          // Set default sport to 'basketball' if not specified
          sport: data.sport || 'basketball'
        };
      });

      if (sportFilter === 'basketball') {
        newEvents = newEvents.filter(ev => ev.sport !== 'soccer');
        console.log(
          `[fetchEvents] ${newEvents.length} events remaining after basketball filter.`
        );
      }

      // Store the last document for pagination (before filtering)
      const lastDocument = querySnapshot.docs[querySnapshot.docs.length - 1];
      
      // No need for additional sport filtering for basketball since Firestore query handles it
        
      // Apply search filter if provided
      if (searchQuery.trim() !== '') {
        console.log(`[fetchEvents] Filtering ${newEvents.length} events by search query: "${searchQuery}"`);
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
        console.log(`[fetchEvents] ${newEvents.length} events remaining after search filter.`); // Log count after search
        
        // Limit to pageSize after filtering
        newEvents = newEvents.slice(0, pageSize);
      }

      console.log(`[fetchEvents] Returning ${newEvents.length} events.`); // Log final count
      // Return events and pagination info
      return {
        events: newEvents,
        lastDoc: querySnapshot.docs[querySnapshot.docs.length - 1],
        hasMore: querySnapshot.docs.length === pageSize
      };
    } else {
      console.log('[fetchEvents] No documents returned, returning empty.'); // Log empty result
      return {
        events: [],
        lastDoc: null,
        hasMore: false
      };
    }
  } catch (error) {
    console.error('[fetchEvents] Error fetching events:', error); // Log errors
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