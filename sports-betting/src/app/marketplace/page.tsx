"use client";
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, orderBy, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Event {
  id: string;
  home_team?: { full_name?: string };
  visitor_team?: { full_name?: string };
  homeTeamCurrentOdds?: number;
  visitorTeamCurrentOdds?: number;
}

export default function MarketplacePage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time Firestore listener for events
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
          <div className="flex-1 flex items-center justify-center">
            {/* TODO: Replace this with user's held pending bets */}
            <span className="text-gray-400 italic">You have no held pending bets to sell.</span>
          </div>
        </section>
        {/* Buy Side */}
        <section className="w-full md:w-1/2 bg-white rounded-2xl shadow-lg p-6 border border-gray-200 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0 0V4m0 10v4m8-8h-4m-4 0H4" /></svg>
            <h2 className="text-xl font-bold tracking-tight">Buy</h2>
          </div>
          <p className="text-gray-500 mb-4">Betting Positions for Sale</p>
          <div className="flex-1 flex items-center justify-center">
            {/* TODO: Replace this with actual betting positions for sale when available */}
            <span className="text-gray-400 italic">No betting positions for sale at the moment.</span>
          </div>
        </section>
      </div>
    </main>
  );
}

