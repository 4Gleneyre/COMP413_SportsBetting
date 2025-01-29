'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, Timestamp, addDoc, updateDoc, doc, arrayUnion, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Event } from '@/types/events';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

interface BettingModalProps {
  event: Event;
  selectedTeam: 'home' | 'visitor';
  onClose: () => void;
}

function BettingModal({ event, selectedTeam, onClose }: BettingModalProps) {
  const [betAmount, setBetAmount] = useState<string>('');
  const [showAuthAlert, setShowAuthAlert] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const { user } = useAuth();
  const teamName = selectedTeam === 'home' ? event.home_team.full_name : event.visitor_team.full_name;
  const numericAmount = Number(betAmount);

  const handleBet = async () => {
    if (!user) {
      setShowAuthAlert(true);
      setTimeout(() => {
        setShowAuthAlert(false);
      }, 3000);
      return;
    }

    try {
      setIsPlacingBet(true);

      // Create the trade document
      const tradeRef = await addDoc(collection(db, 'trades'), {
        userId: user.uid,
        eventId: event.id,
        amount: numericAmount,
        selectedTeam,
        createdAt: Timestamp.now(),
        status: 'pending' // Could be used later for trade status tracking
      });

      // Update the event document with the trade reference
      await updateDoc(doc(db, 'events', event.id), {
        trades: arrayUnion(tradeRef.id)
      });

      // Check if user document exists, if not create it
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        // Create new user document with initial trades array
        await setDoc(userDocRef, {
          email: user.email,
          displayName: user.displayName,
          createdAt: Timestamp.now(),
          trades: [tradeRef.id]
        });
      } else {
        // Update existing user document
        await updateDoc(userDocRef, {
          trades: arrayUnion(tradeRef.id)
        });
      }

      alert(`Bet placed successfully: $${betAmount} on ${teamName}`);
      onClose();
    } catch (error) {
      console.error('Error placing bet:', error);
      alert('Failed to place bet. Please try again.');
    } finally {
      setIsPlacingBet(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4 shadow-xl">
        <h2 className="text-2xl font-bold mb-6">Place Your Bet</h2>
        <div className="space-y-6">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Selected Team</p>
            <p className="text-lg font-semibold">{teamName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Bet Amount</p>
            <input
              type="number"
              min="0"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-full p-3 border rounded-lg bg-transparent text-white border-gray-600 focus:border-white focus:ring-1 focus:ring-white outline-none"
              placeholder="Enter amount"
            />
          </div>
          {numericAmount > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
              <p className="text-sm text-green-600 dark:text-green-400">
                Potential Payout: ${(numericAmount * 2).toFixed(2)}
              </p>
            </div>
          )}
          {showAuthAlert && (
            <div className="bg-red-500/10 dark:bg-red-500/20 border border-red-200/20 px-4 py-3 rounded-md text-sm text-red-600 dark:text-red-300">
              You must be logged in to place a bet
            </div>
          )}
          <div className="flex gap-3">
            <button
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleBet}
              disabled={numericAmount <= 0 || isPlacingBet}
            >
              {isPlacingBet ? 'Placing Bet...' : 'Place Bet'}
            </button>
            <button
              className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={onClose}
              disabled={isPlacingBet}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamLogo({ abbreviation, teamName }: { abbreviation: string; teamName: string }) {
  const [imageExists, setImageExists] = useState(true);

  useEffect(() => {
    // Check if image exists
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
      width={48}
      height={48}
      className="rounded-full"
    />
  );
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBet, setSelectedBet] = useState<{ event: Event; team: 'home' | 'visitor' } | null>(null);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const eventsRef = collection(db, 'events');
        // Get events that haven't happened yet
        const q = query(
          eventsRef,
          where('status', '>', new Date().toISOString())
        );
        const querySnapshot = await getDocs(q);
        const eventsData: Event[] = [];
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          eventsData.push({
            id: doc.id,
            date: data.date,
            home_team: data.home_team,
            visitor_team: data.visitor_team,
            home_team_score: data.home_team_score,
            visitor_team_score: data.visitor_team_score,
            period: data.period,
            postseason: data.postseason,
            season: data.season,
            status: data.status,
            time: data.time,
            updatedAt: data.updatedAt?.toDate() || new Date(),
          } as Event);
        });

        // Sort by date
        eventsData.sort((a, b) => new Date(a.status).getTime() - new Date(b.status).getTime());
        setEvents(eventsData);
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchEvents();
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-3xl font-bold mb-8">Available Events</h2>
      <div className="space-y-4">
        {events.map((event) => (
          <div
            key={event.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium">
                  Basketball
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(event.status).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              
              <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
                <button
                  onClick={() => setSelectedBet({ event, team: 'home' })}
                  className="text-left p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <TeamLogo 
                      abbreviation={event.home_team.abbreviation}
                      teamName={event.home_team.full_name}
                    />
                    <div>
                      <div className="font-semibold text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {event.home_team.full_name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        50% chance
                      </div>
                    </div>
                  </div>
                </button>

                <div className="flex flex-col items-center gap-2">
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">VS</span>
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                </div>

                <button
                  onClick={() => setSelectedBet({ event, team: 'visitor' })}
                  className="text-right p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="flex items-center justify-end gap-4">
                    <div>
                      <div className="font-semibold text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {event.visitor_team.full_name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        50% chance
                      </div>
                    </div>
                    <TeamLogo 
                      abbreviation={event.visitor_team.abbreviation}
                      teamName={event.visitor_team.full_name}
                    />
                  </div>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

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
