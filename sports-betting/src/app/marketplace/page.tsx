"use client";
import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, QuerySnapshot, DocumentData, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface Event {
  id: string;
  home_team?: { full_name?: string };
  visitor_team?: { full_name?: string };
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

  // Fetch user's pending bets using their trade IDs (like ProfilePage) for faster load
  useEffect(() => {
    const fetchPendingBets = async () => {
      if (!user) return;
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          console.log('User document not found in Firestore');
          return;
        }
        const userData = userDoc.data() as { trades?: string[] };
        const userTrades = userData.trades || [];
        const pending: PendingBet[] = [];
        for (const tradeId of userTrades) {
          const tradeDoc = await getDoc(doc(db, 'trades', tradeId));
          if (!tradeDoc.exists()) continue;
          const tradeData: any = tradeDoc.data();
          if (tradeData.status !== 'Pending') continue;
          pending.push({
            id: tradeDoc.id,
            eventId: tradeData.eventId,
            eventName: tradeData.eventName,
            selectedTeam: tradeData.selectedTeam,
            amount: tradeData.amount,
            currentStakeValue: tradeData.currentStakeValue,
            forSale: tradeData.forSale,
            salePrice: tradeData.salePrice,
            userId: tradeData.userId,
          });
        }
        setPendingBets(pending);
      } catch (error) {
        console.error('Error fetching pending bets:', error);
      }
    };
    fetchPendingBets();
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
              pendingBets.map((bet) => (
                <div key={bet.id} className="w-full border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between bg-gray-50 mb-2">
                  <div>
                    <div className="font-semibold">{bet.eventName || bet.eventId}</div>
                    <div className="text-sm text-gray-500">Team: {bet.selectedTeam}</div>
                  </div>
                  <div className="flex flex-col md:flex-row md:gap-6 mt-2 md:mt-0 items-center">
                    <span className="text-sm text-gray-700">Initial Stake: <span className="font-bold">${bet.amount.toFixed(2)}</span></span>
                    <span className="text-sm text-gray-700">Current Stake: <span className="font-bold">${bet.currentStakeValue ? bet.currentStakeValue.toFixed(2) : bet.amount.toFixed(2)}</span></span>
                    {bet.forSale ? (
                      <span className="ml-3 px-2 py-1 text-xs bg-green-100 text-green-600 rounded">For Sale</span>
                    ) : (
                      <button
                        className="ml-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                        onClick={() => handleSell(bet)}
                        disabled={!!sellLoading}
                      >
                        {sellLoading === bet.id ? 'Selling...' : 'Sell'}
                      </button>
                    )}
                  </div>
                </div>
              ))
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
