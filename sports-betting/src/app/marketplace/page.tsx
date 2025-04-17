"use client";
import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Event {
  id: string;
  home_team?: { full_name?: string; abbreviation?: string };
  visitor_team?: { full_name?: string; abbreviation?: string };
  homeTeamCurrentOdds?: number;
  visitorTeamCurrentOdds?: number;
}

import { getAuth } from 'firebase/auth';

interface PendingBet {
  id: string;
  eventId: string;
  eventName?: string;
  selectedTeam: string;
  amount: number;
  currentStakeValue?: number;
  forSale?: boolean;
  salePrice?: number;
  userId: string;
}

export default function MarketplacePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingBets, setPendingBets] = useState<PendingBet[]>([]);
  const [forSaleBets, setForSaleBets] = useState<PendingBet[]>([]);
  const [sellLoading, setSellLoading] = useState<string | null>(null);
  const [buyLoading, setBuyLoading] = useState<string | null>(null);

  const auth = getAuth();
  const [user, setUser] = useState<ReturnType<typeof getAuth>["currentUser"] | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, [auth]);

  const functions = getFunctions();
  const sellBetFn = httpsCallable(functions, "sellBet");

  // Handler to put a bet up for sale
  const handleSell = async (bet: PendingBet) => {
    if (!user) return;
    setSellLoading(bet.id);
    try {
      await sellBetFn({ betId: bet.id, salePrice: bet.currentStakeValue ?? bet.amount });
    } catch (e: any) {
      alert(e.message || 'Failed to put bet up for sale.');
    }
    setSellLoading(null);
  };


  // Handler to buy a bet
  const buyBetFn = httpsCallable(functions, "buyBet");

  // Handler to buy a bet
  const handleBuy = async (bet: PendingBet) => {
    if (!user) return;
    setBuyLoading(bet.id);
    try {
      await buyBetFn({ betId: bet.id });
    } catch (e: any) {
      alert(e.message || 'Failed to buy bet.');
    }
    setBuyLoading(null);
  };


// Fetch events in real-time
useEffect(() => {
  const q = query(collection(db, 'events'));
  const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
    const eventList: Event[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setEvents(eventList);
    setLoading(false);
  }, (error) => {
    console.error('Error listening for events:', error);
    setLoading(false);
  });
  return () => unsubscribe();
}, []);

  // Fetch user's pending bets
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      query(collection(db, 'trades')),
      (snapshot: QuerySnapshot<DocumentData>) => {
        const pending = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((trade: any) =>
            trade.userId === user.uid &&
            trade.status === 'Pending' &&
            trade.eventId &&
            trade.selectedTeam &&
            typeof trade.amount === 'number' &&
            trade.userId
          )
          .map((trade: any) => ({
            id: trade.id,
            eventId: trade.eventId,
            eventName: trade.eventName,
            selectedTeam: trade.selectedTeam,
            amount: trade.amount,
            currentStakeValue: trade.currentStakeValue,
            forSale: trade.forSale,
            salePrice: trade.salePrice,
            userId: trade.userId,
          }));
        setPendingBets(pending);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Fetch all bets for sale
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'trades')),
      (snapshot: QuerySnapshot<DocumentData>) => {
        const forSale = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter((trade: any) =>
            trade.forSale === true &&
            trade.status === 'Pending' &&
            trade.eventId &&
            trade.selectedTeam &&
            typeof trade.amount === 'number' &&
            trade.userId
          )
          .map((trade: any) => ({
            id: trade.id,
            eventId: trade.eventId,
            eventName: trade.eventName,
            selectedTeam: trade.selectedTeam,
            amount: trade.amount,
            currentStakeValue: trade.currentStakeValue,
            forSale: trade.forSale,
            salePrice: trade.salePrice,
            userId: trade.userId,
          }));
        setForSaleBets(forSale);
      }
    );
    return () => unsubscribe();
  }, []);

  return (
    <main className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-4">Marketplace</h1>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sell Side */}
        <section className="w-full md:w-1/2 bg-white rounded-2xl shadow-lg p-6 border border-gray-200 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a5 5 0 00-10 0v2M5 12h14l-1.405 7.03A2 2 0 0115.638 21H8.362a2 2 0 01-1.957-1.97L5 12z" /></svg>
            <h2 className="text-xl font-bold tracking-tight">Sell</h2>
          </div>
          <p className="text-gray-500 mb-4">Your Held Pending Bets</p>
          <div className="flex-1 flex flex-col gap-2 items-center justify-center">
            {/* Display user's held pending bets with initial and current stake and Sell button */}
            {pendingBets.length === 0 ? (
  <span className="text-gray-400 italic">You have no held pending bets to sell.</span>
) : (
  <div className="space-y-6 w-full">
    {pendingBets.map((bet) => {
      // Try to match Trade History structure as closely as possible
      // Fallbacks for event/team info
      const event = events.find(e => e.id === bet.eventId);
      const teamName = bet.selectedTeam === 'home'
        ? event?.home_team?.full_name || 'Home'
        : event?.visitor_team?.full_name || 'Visitor';
      const opponentName = bet.selectedTeam === 'home'
        ? event?.visitor_team?.full_name || 'Visitor'
        : event?.home_team?.full_name || 'Home';
      const abbreviation = bet.selectedTeam === 'home'
        ? event?.home_team?.abbreviation || 'HOM'
        : event?.visitor_team?.abbreviation || 'VIS';
      // Status for pending bet is always 'Pending' unless forSale
      const status = bet.forSale ? 'For Sale' : 'Pending';
      return (
        <div
          key={bet.id}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:border-gray-300 dark:hover:border-gray-600 transition-all hover:shadow-md"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Team and Event Info */}
            <div className="flex-grow space-y-4">
              <div className="flex items-center gap-6">
                {/* Selected Team (Bet On) */}
                <div className="flex flex-col items-center">
                  <img
                    src={`/logos/${bet.selectedTeam === 'home' ? event?.home_team?.abbreviation || 'HOM' : event?.visitor_team?.abbreviation || 'VIS'}.png`}
                    alt={`${bet.selectedTeam === 'home' ? event?.home_team?.full_name : event?.visitor_team?.full_name} logo`}
                    width={40}
                    height={40}
                    className="rounded-full mb-1"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Bet On</span>
                  <span className="text-sm font-semibold">
                    {bet.selectedTeam === 'home' ? event?.home_team?.full_name : event?.visitor_team?.full_name}
                  </span>
                </div>
                <span className="mx-2 text-gray-400 font-bold text-lg">vs</span>
                {/* Opponent Team */}
                <div className="flex flex-col items-center">
                  <img
                    src={`/logos/${bet.selectedTeam === 'home' ? event?.visitor_team?.abbreviation || 'VIS' : event?.home_team?.abbreviation || 'HOM'}.png`}
                    alt={`${bet.selectedTeam === 'home' ? event?.visitor_team?.full_name : event?.home_team?.full_name} logo`}
                    width={40}
                    height={40}
                    className="rounded-full mb-1"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Opponent</span>
                  <span className="text-sm">
                    {bet.selectedTeam === 'home' ? event?.visitor_team?.full_name : event?.home_team?.full_name}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium inline-flex items-center gap-1.5 ${
                  status === 'Pending'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                    : status === 'For Sale'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {status === 'Pending' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {status === 'For Sale' && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {status}
                </span>
              </div>

              {/* Dates: Only show bet creation date (no event date on pending bet) */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Bet Placed</p>
                  <p className="mt-1 font-medium">{/* No timestamp available for bet? */}</p>
                </div>
              </div>
            </div>

            {/* Bet Details */}
            <div className="flex flex-col gap-3 min-w-[200px] bg-gray-50 dark:bg-gray-700/30 p-4 rounded-lg">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Bet Amount</p>
                <p className="text-lg font-semibold mt-1">${bet.amount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Current Stake Value</p>
                <p className="text-lg font-semibold text-green-600 dark:text-green-400 mt-1">
                  ${bet.currentStakeValue ? bet.currentStakeValue.toFixed(2) : bet.amount.toFixed(2)}
                </p>
              </div>
              <div>
                {!bet.forSale ? (
                  <button
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    onClick={() => handleSell(bet)}
                    disabled={!!sellLoading}
                  >
                    {sellLoading === bet.id ? 'Selling...' : 'Sell'}
                  </button>
                ) : (
                  <span className="px-4 py-2 bg-yellow-200 text-yellow-800 rounded font-semibold">For Sale</span>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    })}
  </div>
)}
          </div>
        </section>
        {/* Buy Side */}
        <section className="w-full md:w-1/2 bg-white rounded-2xl shadow-lg p-6 border border-gray-200 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0 0V4m0 10v4m8-8h-4m-4 0H4" /></svg>
            <h2 className="text-xl font-bold tracking-tight">Buy</h2>
          </div>
          <p className="text-gray-500 mb-4">Betting Positions for Sale</p>
          <div className="flex-1 flex flex-col gap-2 items-center justify-center">
            {/* Show all for-sale bets except for current user's */}
            {forSaleBets.length === 0 || (forSaleBets.filter(bet => bet.userId !== (user?.uid ?? ''))).length === 0 ? (
              <span className="text-gray-400 italic">No betting positions for sale at the moment.</span>
            ) : (
              forSaleBets.filter(bet => bet.userId !== (user?.uid ?? '')).map((bet) => (
                <div key={bet.id} className="w-full border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between bg-gray-50 mb-2">
                  <div>
                    <div className="font-semibold">{bet.eventName || bet.eventId}</div>
                    <div className="text-sm text-gray-500">Team: {bet.selectedTeam}</div>
                  </div>
                  <div className="flex flex-col md:flex-row md:gap-6 mt-2 md:mt-0 items-center">
                    <span className="text-sm text-gray-700">Stake for Sale: <span className="font-bold">${bet.salePrice ? bet.salePrice.toFixed(2) : bet.currentStakeValue ? bet.currentStakeValue.toFixed(2) : bet.amount.toFixed(2)}</span></span>
                    <button
                      className="ml-3 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                      onClick={() => handleBuy(bet)}
                      disabled={!!buyLoading}
                    >
                      {buyLoading === bet.id ? 'Buying...' : 'Buy'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

