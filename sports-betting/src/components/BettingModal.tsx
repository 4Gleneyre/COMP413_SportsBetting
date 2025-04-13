import { useState, useEffect } from 'react';
import { Event } from '@/types/events';
import { db, functions } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from "firebase/functions";
import { useAuth } from '@/contexts/AuthContext';
import TradeConfirmationModal from './TradeConfirmationModal';

// Props for the BettingModal component
export interface BettingModalProps {
  event: Event;
  selectedTeam: 'home' | 'visitor';
  onClose: () => void;
}

export default function BettingModal({ event, selectedTeam, onClose }: BettingModalProps) {
  const [betAmount, setBetAmount] = useState<string>('');
  const [showAuthAlert, setShowAuthAlert] = useState(false);
  const [showBalanceAlert, setShowBalanceAlert] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const placeBetFunction = httpsCallable(functions, "placeBet");
  const { user } = useAuth();
  const teamName =
    selectedTeam === 'home'
      ? event.home_team.full_name
      : event.visitor_team.full_name;
  const selectedOdds = selectedTeam === 'home' 
    ? event.homeTeamCurrentOdds 
    : event.visitorTeamCurrentOdds;
  const numericAmount = Number(betAmount);
  const potentialPayout = numericAmount * (100 / selectedOdds);

  // Fetch user's balance when modal opens
  useEffect(() => {
    const fetchUserBalance = async () => {
      if (!user) return;
      
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserBalance(userData.walletBalance || 0);
        }
      } catch (error) {
        console.error('Error fetching user balance:', error);
      }
    };
    
    fetchUserBalance();
  }, [user]);

  const handlePlaceBet = async () => {
    if (!user) {
      setShowAuthAlert(true);
      return;
    }
    
    if (userBalance !== null && numericAmount > userBalance) {
      setShowBalanceAlert(true);
      return;
    }
    
    try {
      setIsPlacingBet(true);
      
      const result = await placeBetFunction({
        eventId: event.id,
        selectedTeam,
        betAmount: numericAmount
      });
      
      // Show confirmation
      setShowConfirmation(true);
      
    } catch (error) {
      console.error('Error placing bet:', error);
    } finally {
      setIsPlacingBet(false);
    }
  };

  return (
    <>
      {showConfirmation ? (
        <TradeConfirmationModal
          betAmount={numericAmount}
          teamName={teamName}
          potentialPayout={potentialPayout}
          event={event}
          selectedTeam={selectedTeam}
          onClose={onClose}
        />
      ) : (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Place a Bet</h2>
              <button 
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                disabled={isPlacingBet}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-6">
              <div className="flex items-center justify-center mb-4">
                <div className="text-center">
                  <div className="font-semibold text-lg mb-1">
                    {teamName}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {selectedOdds}% chance
                  </div>
                </div>
              </div>
              
              {showAuthAlert && (
                <div className="p-3 mb-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                  You need to sign in to place bets.
                </div>
              )}
              
              {showBalanceAlert && (
                <div className="p-3 mb-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
                  Insufficient balance. Your current balance is ${userBalance?.toFixed(2) || '0.00'}.
                </div>
              )}
              
              {user && (
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">
                  Your balance: ${userBalance?.toFixed(2) || '...'} 
                </div>
              )}
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bet Amount</label>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => {
                    setBetAmount(e.target.value);
                    setShowBalanceAlert(false);
                  }}
                  placeholder="Enter amount"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent dark:text-white focus:border-blue-500 dark:focus:border-blue-400 focus:ring-1 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
                  disabled={isPlacingBet}
                />
              </div>
              
              {numericAmount > 0 && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Amount:</span>
                    <span className="font-medium">${numericAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-300">Odds:</span>
                    <span className="font-medium">{selectedOdds}%</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-blue-100 dark:border-blue-800">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Potential Payout:</span>
                    <span className="font-bold text-green-600 dark:text-green-400">${potentialPayout.toFixed(2)}</span>
                  </div>
                </div>
              )}
              
              <div className="flex justify-between gap-3">
                <button
                  onClick={handlePlaceBet}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      )}
    </>
  );
}
