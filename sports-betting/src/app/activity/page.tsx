'use client';

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { Timestamp } from "firebase/firestore";

// Define a type for serialized Firestore timestamp
interface SerializedTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

interface Trade {
  id: string;
  amount: number;
  expectedPayout: number;
  selectedTeam: 'home' | 'visitor';
  status: string;
  createdAt: SerializedTimestamp;
  event?: {
    home_team: {
      full_name: string;
    };
    visitor_team: {
      full_name: string;
    };
  };
}

const PAGE_SIZE = 15;

export default function ActivityPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastCreatedAtRef = useRef<number | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const lastTradeElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loadingMore) return;
    
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMoreTrades();
      }
    });

    if (node) {
      observerRef.current.observe(node);
    }
  }, [loadingMore, hasMore]);

  const getLatestActivity = httpsCallable(functions, 'getLatestActivity');

  const loadTrades = async (isInitial = false) => {
    try {
      const response = await getLatestActivity({
        pageSize: PAGE_SIZE,
        lastCreatedAt: isInitial ? null : lastCreatedAtRef.current
      });
      
      const result = response.data as { trades: Trade[] };
      const newTrades = result.trades;

      if (newTrades.length < PAGE_SIZE) {
        setHasMore(false);
      }

      if (newTrades.length > 0) {
        // Safely handle serialized timestamp with validation
        const lastTrade = newTrades[newTrades.length - 1];
        if (lastTrade.createdAt && 
            typeof lastTrade.createdAt._seconds === 'number' && 
            !isNaN(lastTrade.createdAt._seconds) &&
            isFinite(lastTrade.createdAt._seconds)) {
          lastCreatedAtRef.current = lastTrade.createdAt._seconds * 1000;
        } else {
          console.warn('Invalid timestamp found in last trade:', lastTrade);
          if (process.env.NODE_ENV !== 'test') {
                        console.warn('Invalid timestamp found in last trade:', lastTrade);
                      }
          // Fallback to current time if the timestamp is invalid
          lastCreatedAtRef.current = Date.now();
        }
      }

      if (isInitial) {
        setTrades(newTrades);
      } else {
        setTrades(prev => [...prev, ...newTrades]);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreTrades = () => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      loadTrades();
    }
  };

  useEffect(() => {
    setLoading(true);
    loadTrades(true);
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <h2 className="text-2xl font-bold mb-8">Activity Feed</h2>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-bold mb-8">Activity Feed</h2>
      
      {trades.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          No betting activity yet. Be the first to place a bet!
        </p>
      ) : (
        <div className="space-y-4">
          {trades.map((trade, index) => {            
            // Validate timestamp to avoid errors with invalid dates
            const hasValidTimestamp = trade.createdAt && 
              typeof trade.createdAt._seconds === 'number' && 
              !isNaN(trade.createdAt._seconds) &&
              isFinite(trade.createdAt._seconds);
            
            const timestamp = hasValidTimestamp ? trade.createdAt._seconds * 1000 : null;
            const formattedDate = timestamp ? new Date(timestamp) : null;
            
            // Safely log date info without causing errors
            console.log('Trade created at debug:', {
              tradeId: trade.id,
              rawCreatedAt: trade.createdAt,
              hasValidTimestamp,
              timestamp,
              formattedDate: formattedDate ? formattedDate.toString() : 'Invalid date'
            }
          );
            
            return (
              <div
                data-testid="trade-card"
                key={trade.id}
                ref={index === trades.length - 1 ? lastTradeElementRef : null}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border ${
                  trade.status === 'Pending' 
                    ? 'border-yellow-400 dark:border-yellow-500 animate-glow-border' 
                    : 'border-gray-200 dark:border-gray-700'
                } p-4`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold">
                      {trade.selectedTeam === 'home'
                        ? trade.event?.home_team.full_name
                        : trade.event?.visitor_team.full_name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      vs {trade.selectedTeam === 'home'
                        ? trade.event?.visitor_team.full_name
                        : trade.event?.home_team.full_name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {formattedDate 
                        ? formattedDate.toLocaleDateString(undefined, {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : 'Date unavailable'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${
                      trade.status === 'Pending'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                        : trade.status === 'Won'
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                    }`}>
                      {trade.status}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    Bet Amount: ${trade.amount}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    Potential Payout: ${trade.expectedPayout.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })}
          {loadingMore && (
            <div className="animate-pulse space-y-4">
              {[1, 2].map((i) => (
                <div key={`loading-${i}`} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 