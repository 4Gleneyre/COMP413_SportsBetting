import { useState, useEffect } from 'react';
import { Event } from '@/types/events';
import Image from 'next/image';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// TeamLogo component
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

// Props for the TradeConfirmationModal
export interface TradeConfirmationModalProps {
  betAmount: number;
  teamName: string;
  potentialPayout: number;
  event: Event;
  selectedTeam: 'home' | 'visitor';
  onClose: () => void;
}

export default function TradeConfirmationModal({ 
  betAmount, 
  teamName, 
  potentialPayout, 
  event, 
  selectedTeam, 
  onClose 
}: TradeConfirmationModalProps) {
  const [confetti, setConfetti] = useState(true);
  const [suggestedEvents, setSuggestedEvents] = useState<Event[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  
  // Function to check if date is valid
  const isValidDate = (date: any): boolean => {
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  };

  // Format date for display
  const formatDateTime = (date: Date) => {
    if (!isValidDate(date)) {
      return "Date unavailable";
    }
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  // Disable confetti after 5 seconds to avoid performance issues
  useEffect(() => {
    const timer = setTimeout(() => {
      setConfetti(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // Fetch suggested events based on same team or nearby dates
  useEffect(() => {
    const fetchSuggestedEvents = async () => {
      try {
        const eventsRef = collection(db, 'events');
        const currentDate = new Date();
        const oneWeekLater = new Date();
        oneWeekLater.setDate(currentDate.getDate() + 7);
        
        // Get date strings in YYYY-MM-DD format
        const startDateStr = currentDate.toISOString().split('T')[0];
        const endDateStr = oneWeekLater.toISOString().split('T')[0];
        
        // Query for events with the same team or in the next 7 days
        let constraints = [
          where('date', '>=', startDateStr),
          where('date', '<=', endDateStr),
          orderBy('date', 'asc'),
          limit(5)
        ];
        
        const q = query(eventsRef, ...constraints);
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          let events: Event[] = querySnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return { id: docSnap.id, ...data } as Event;
          });
          
          // Filter out the current event and prioritize events with the same team
          events = events.filter(e => e.id !== event.id && e.status && isValidDate(e.status))
            .sort((a, b) => {
              const aHasSameTeam = a.home_team.id === event.home_team.id || 
                                  a.home_team.id === event.visitor_team.id ||
                                  a.visitor_team.id === event.home_team.id || 
                                  a.visitor_team.id === event.visitor_team.id;
              
              const bHasSameTeam = b.home_team.id === event.home_team.id || 
                                  b.home_team.id === event.visitor_team.id ||
                                  b.visitor_team.id === event.home_team.id || 
                                  b.visitor_team.id === event.visitor_team.id;
              
              if (aHasSameTeam && !bHasSameTeam) return -1;
              if (!aHasSameTeam && bHasSameTeam) return 1;
              
              // If both or neither have same team, sort by date
              const aDate = new Date(a.status);
              const bDate = new Date(b.status);
              return aDate.getTime() - bDate.getTime();
            });
          
          setSuggestedEvents(events.slice(0, 3)); // Limit to 3 suggestions
        }
      } catch (error) {
        console.error('Error fetching suggested events:', error);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchSuggestedEvents();
  }, [event]);

  const goToProfile = () => {
    window.location.href = '/profile';
  };

  const selectSuggestedEvent = async (suggestedEvent: Event) => {
    onClose();
    
    // We can use the event directly since we have its full data
    // Update URL so other components can handle it
    window.location.href = `/?event=${suggestedEvent.id}`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      {confetti && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Fake confetti using CSS */}
          <div className="confetti-container">
            {Array.from({ length: 150 }).map((_, i) => (
              <div 
                key={i} 
                className="confetti" 
                style={{
                  left: `${Math.random() * 100}%`,
                  width: `${Math.random() * 10 + 5}px`,
                  height: `${Math.random() * 10 + 5}px`,
                  backgroundColor: `hsl(${Math.random() * 360}, 100%, 50%)`,
                  animationDuration: `${Math.random() * 3 + 2}s`,
                  animationDelay: `${Math.random() * 5}s`
                }}
              />
            ))}
          </div>
        </div>
      )}
      
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl max-w-2xl w-full mx-4 shadow-2xl transform transition-all animate-bounce-once max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold mb-2">Bet Placed Successfully!</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Your bet has been confirmed and added to your portfolio.
          </p>
        </div>
        
        {/* Event Details Section */}
        <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-lg w-full mb-6">
          <h3 className="text-lg font-semibold mb-4">Event Details</h3>
          
          {/* Teams Info - Full Width */}
          <div className="flex items-center justify-center gap-6 mb-6">
            <div className="text-center flex flex-col items-center">
              <div className="h-16 w-16 flex items-center justify-center bg-gray-100 dark:bg-gray-600 rounded-full mb-2">
                <TeamLogo
                  abbreviation={selectedTeam === 'home' ? event.home_team.abbreviation : event.visitor_team.abbreviation}
                  teamName={selectedTeam === 'home' ? event.home_team.full_name : event.visitor_team.full_name}
                />
              </div>
              <div className="font-semibold">{teamName}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Your pick</div>
            </div>
            
            <div className="flex flex-col items-center mx-4">
              <div className="text-xl font-bold mb-1">VS</div>
              <div className="w-px h-10 bg-gray-300 dark:bg-gray-600"></div>
            </div>
            
            <div className="text-center flex flex-col items-center">
              <div className="h-16 w-16 flex items-center justify-center bg-gray-100 dark:bg-gray-600 rounded-full mb-2">
                <TeamLogo
                  abbreviation={selectedTeam === 'home' ? event.visitor_team.abbreviation : event.home_team.abbreviation}
                  teamName={selectedTeam === 'home' ? event.visitor_team.full_name : event.home_team.full_name}
                />
              </div>
              <div className="font-semibold">
                {selectedTeam === 'home' ? event.visitor_team.full_name : event.home_team.full_name}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Opponent</div>
            </div>
          </div>
          
          {/* Bet Details - Now below the teams */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Date & Time</p>
              <p className="font-medium">{formatDateTime(new Date(event.status))}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Status</p>
              <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-400 rounded text-sm font-medium">
                Pending
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Your Stake</p>
              <p className="font-semibold">${betAmount.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Potential Payout</p>
              <p className="font-semibold text-green-600 dark:text-green-400">${potentialPayout.toFixed(2)}</p>
            </div>
          </div>
          
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            Once the event is completed, your bet will be settled automatically and winnings will be credited to your account.
          </div>
        </div>
        
        {/* Suggested Events Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Recommended Events</h3>
          {loadingSuggestions ? (
            <div className="flex justify-center my-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
            </div>
          ) : suggestedEvents.length > 0 ? (
            <div className="space-y-4">
              {suggestedEvents.map((suggestedEvent) => (
                <div 
                  key={suggestedEvent.id}
                  className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
                  onClick={() => selectSuggestedEvent(suggestedEvent)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-gray-50 dark:bg-gray-600/50 p-2 rounded-full">
                        <TeamLogo
                          abbreviation={suggestedEvent.home_team.abbreviation}
                          teamName={suggestedEvent.home_team.full_name}
                        />
                      </div>
                      <div>
                        <span className="font-medium block">{suggestedEvent.home_team.full_name}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{suggestedEvent.homeTeamCurrentOdds}% odds</span>
                      </div>
                    </div>
                    
                    <div className="flex-none text-center mx-2">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">vs</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="font-medium block">{suggestedEvent.visitor_team.full_name}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">{suggestedEvent.visitorTeamCurrentOdds}% odds</span>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-600/50 p-2 rounded-full">
                        <TeamLogo
                          abbreviation={suggestedEvent.visitor_team.abbreviation}
                          teamName={suggestedEvent.visitor_team.full_name}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 flex justify-between items-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDateTime(new Date(suggestedEvent.status))}
                    </span>
                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
                      Place bet →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-gray-500 dark:text-gray-400">No upcoming events found.</p>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg font-medium transition-colors"
            onClick={goToProfile}
          >
            View Your Portfolio
          </button>
          <button
            className="flex-1 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 px-4 py-3 rounded-lg font-medium transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
