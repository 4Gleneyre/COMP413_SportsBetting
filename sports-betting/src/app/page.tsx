'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

// Sample data - in real app this would come from Firestore
const sportsEvents = [
  {
    id: 1,
    sport: 'Basketball',
    team1: 'Los Angeles Lakers',
    team2: 'Golden State Warriors',
    date: '2024-02-01T20:00:00',
    odds: { team1: 2.0, team2: 2.0 }
  },
  {
    id: 2,
    sport: 'Football',
    team1: 'Kansas City Chiefs',
    team2: 'San Francisco 49ers',
    date: '2024-02-11T18:30:00',
    odds: { team1: 2.0, team2: 2.0 }
  },
  {
    id: 3,
    sport: 'Baseball',
    team1: 'New York Yankees',
    team2: 'Boston Red Sox',
    date: '2024-02-15T19:00:00',
    odds: { team1: 2.0, team2: 2.0 }
  }
];

interface BettingModalProps {
  event: any;
  selectedTeam: 'team1' | 'team2';
  onClose: () => void;
}

function BettingModal({ event, selectedTeam, onClose }: BettingModalProps) {
  const [betAmount, setBetAmount] = useState<string>('');
  const teamName = selectedTeam === 'team1' ? event.team1 : event.team2;
  const numericAmount = Number(betAmount);

  const handleBet = () => {
    // In real app, this would interact with Firestore
    alert(`Bet placed: $${betAmount} on ${teamName}`);
    onClose();
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
              className="w-full p-3 border rounded-lg bg-transparent"
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
          <div className="flex gap-3">
            <button
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleBet}
              disabled={numericAmount <= 0}
            >
              Place Bet
            </button>
            <button
              className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [selectedBet, setSelectedBet] = useState<{ event: any; team: 'team1' | 'team2' } | null>(null);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-3xl font-bold mb-8">Available Events</h2>
      <div className="space-y-4">
        {sportsEvents.map((event) => (
          <div
            key={event.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium">
                  {event.sport}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(event.date).toLocaleDateString(undefined, {
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
                  onClick={() => setSelectedBet({ event, team: 'team1' })}
                  className="text-left p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="font-semibold text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {event.team1}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    50% chance
                  </div>
                </button>

                <div className="flex flex-col items-center gap-2">
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">VS</span>
                  <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
                </div>

                <button
                  onClick={() => setSelectedBet({ event, team: 'team2' })}
                  className="text-right p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="font-semibold text-lg group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {event.team2}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    50% chance
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
