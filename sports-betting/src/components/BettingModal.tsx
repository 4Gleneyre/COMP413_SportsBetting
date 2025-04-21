import { useState, useEffect } from 'react';
import { Event } from '@/types/events';
import { db, functions } from '@/lib/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from "firebase/functions";
import { useAuth } from '@/contexts/AuthContext';
import TradeConfirmationModal from './TradeConfirmationModal';

// Props for the BettingModal component
export interface BettingModalProps {
  event: Event;
  selectedTeam: 'home' | 'visitor' | 'draw';
  onClose: () => void;
}

export default function BettingModal({ event, selectedTeam, onClose }: BettingModalProps) {
  const [eventOdds, setEventOdds] = useState<any>(null);
  const [betAmount, setBetAmount] = useState<string>('');
  const [showAuthAlert, setShowAuthAlert] = useState(false);
  const [showBalanceAlert, setShowBalanceAlert] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const placeBetFunction = httpsCallable(functions, "placeBet");
  const { user } = useAuth();
  
  const isSoccer = event.sport === 'soccer';
  
  // Get appropriate team name based on selection
  const teamName = selectedTeam === 'home'
      ? event.home_team.full_name
    : selectedTeam === 'visitor'
      ? event.visitor_team.full_name
      : 'Draw'; // For soccer draw option

  // Get appropriate odds based on selection
  const selectedOdds = selectedTeam === 'home' 
    ? event.homeTeamCurrentOdds 
    : selectedTeam === 'visitor'
      ? event.visitorTeamCurrentOdds
      : event.drawOdds || 20; // Default draw odds if not set
  
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

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'events', event.id), (eventDoc) => {
      if (eventDoc.exists()) {
        setEventOdds(eventDoc.data() as Event);
      }
    }, (error) => {
      console.error('Error listening for event odds:', error);
    });
    return () => unsub();
  }, [event.id]);

  const placeBet = async () => {
    if (!user) {
      setShowAuthAlert(true);
      return;
    }

    if (!betAmount || numericAmount <= 0) return;
    
    if (userBalance !== null && numericAmount > userBalance) {
      setShowBalanceAlert(true);
      return;
    }

    setIsPlacingBet(true);
    
    try {
      await placeBetFunction({
        eventId: event.id,
        selectedTeam: selectedTeam,
        betAmount: numericAmount,
        odds: selectedOdds
      });
      
      setShowConfirmation(true);
      setBetAmount('');
    } catch (error) {
      console.error('Error placing bet:', error);
    } finally {
      setIsPlacingBet(false);
    }
  };

  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4 shadow-xl">
          <div className="text-center mb-4">
            <div className="h-16 w-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">Bet Placed Successfully!</h3>
            <p className="text-gray-600 dark:text-gray-300">
              Your bet on {teamName} has been placed.
            </p>
          </div>
          
          <button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4 shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Place a Bet</h2>
              <button 
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              </div>
              
              {showAuthAlert && (
          <div className="p-3 mb-4 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 rounded-lg">
            Please sign in to place a bet.
                </div>
              )}
              
              {showBalanceAlert && (
          <div className="p-3 mb-4 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded-lg">
            Insufficient balance. You have ${userBalance?.toFixed(2)} available.
                </div>
              )}
              
        <div className="mb-6">
          <p className="text-center text-lg font-semibold">
            {event.home_team.full_name} vs {event.visitor_team.full_name}
          </p>
          <div className="mt-2 text-center text-blue-600 dark:text-blue-400 font-medium">
            <span className={`px-2 py-1 rounded ${selectedTeam === 'home' ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}>
              {event.home_team.full_name}: {event.homeTeamCurrentOdds || 50}%
            </span>
            {' vs '}
            <span className={`px-2 py-1 rounded ${selectedTeam === 'visitor' ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}>
              {event.visitor_team.full_name}: {event.visitorTeamCurrentOdds || 50}%
            </span>
            {isSoccer && (
              <>
                {' | '}
                <span className={`px-2 py-1 rounded ${selectedTeam === 'draw' ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}>
                  Draw: {event.drawOdds || 20}%
                </span>
              </>
            )}
          </div>
        </div>

        <div className="p-4 mb-4 border border-blue-300 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/10">
          <h3 className="text-md font-semibold mb-2">Your Selection</h3>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-lg font-bold">{teamName}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Odds: {selectedOdds}%</p>
            </div>
            <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
              <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
                </div>
              
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
              
        {userBalance !== null && (
          <div className="mb-4 text-sm text-right text-gray-600 dark:text-gray-400">
            Available Balance: ${userBalance.toFixed(2)}
          </div>
        )}
        
        <div className="mt-6">
                <button
            onClick={placeBet}
            disabled={!betAmount || numericAmount <= 0 || isPlacingBet}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
          >
            {isPlacingBet ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : "Place Bet"}
                </button>
              </div>
            </div>
          </div>
  );
}
