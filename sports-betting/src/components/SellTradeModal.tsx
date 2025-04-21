'use client';

import { useState } from 'react';
import Image from 'next/image';
import { TeamLogo } from '@/components/common/TeamLogo';
import { formatCurrency } from '@/utils/formatters';
import type { Trade } from '@/types/trade';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface SellTradeModalProps { 
  isOpen: boolean; 
  onClose: () => void; 
  trade: Trade;
  onConfirm: (soldValue: number) => Promise<void>;
}

export default function SellTradeModal({ 
  isOpen, 
  onClose, 
  trade,
  onConfirm
}: SellTradeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{ soldValue: number } | null>(null);

  const handleConfirm = async () => {
    setError('');
    setIsLoading(true);
    setSuccessData(null);

    try {
      const functions = getFunctions();
      const sellBetFunction = httpsCallable(functions, 'sellBet');
      
      // Call the Cloud Function
      const result = await sellBetFunction({ 
        tradeId: trade.id 
      });
      
      // Get the result data
      const data = result.data as { success: boolean; soldValue: number };
      
      if (data.success) {
        // Set success data first to show success screen
        setSuccessData({ soldValue: data.soldValue });
        // Call the parent's onConfirm to refresh data with the sold value
        await onConfirm(data.soldValue);
      } else {
        throw new Error('Failed to sell trade');
      }
    } catch (err) {
      console.error('Error while selling trade:', err);
      setError('Failed to sell trade. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
        {!successData ? (
          <>
            {/* Confirmation screen */}
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Confirm Trade Sale</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Are you sure you want to sell this trade?
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg mb-6">
              <div className="flex items-center gap-4 mb-4">
                {trade.event && (
                  <div className="bg-white dark:bg-gray-700 p-3 rounded-lg">
                    <TeamLogo
                      abbreviation={trade.selectedTeam === 'home' 
                        ? trade.event.home_team.abbreviation 
                        : trade.event.visitor_team.abbreviation}
                      teamName={trade.selectedTeam === 'home'
                        ? trade.event.home_team.full_name
                        : trade.event.visitor_team.full_name}
                      sport={trade.event?.sport}
                      teamId={trade.selectedTeam === 'home'
                        ? trade.event?.home_team?.id
                        : trade.event?.visitor_team?.id}
                    />
                  </div>
                )}
                <div>
                  <h4 className="font-medium">
                    {trade.event
                      ? (trade.selectedTeam === 'home'
                        ? trade.event.home_team.full_name
                        : trade.event.visitor_team.full_name)
                      : 'Unknown Team'}
                  </h4>
                  {trade.event && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      vs {trade.selectedTeam === 'home'
                        ? trade.event.visitor_team.full_name
                        : trade.event.home_team.full_name}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Original Amount</p>
                  <p className="font-medium">{formatCurrency(trade.amount)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Current Value</p>
                  <p className={`font-medium ${
                    (trade.currentValue || 0) > trade.amount 
                      ? 'text-green-600 dark:text-green-400' 
                      : (trade.currentValue || 0) < trade.amount 
                        ? 'text-red-600 dark:text-red-400' 
                        : ''
                  }`}>
                    {formatCurrency(trade.currentValue || trade.amount)}
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-sm mb-4">{error}</p>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Processing...' : 'Confirm Sale'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Success screen */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Trade Successfully Sold</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Your trade has been sold and the funds have been added to your wallet.
              </p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg mb-6">
              <div className="flex items-center gap-4 mb-4">
                {trade.event && (
                  <div className="bg-white dark:bg-gray-700 p-3 rounded-lg">
                    <TeamLogo
                      abbreviation={trade.selectedTeam === 'home' 
                        ? trade.event.home_team.abbreviation 
                        : trade.event.visitor_team.abbreviation}
                      teamName={trade.selectedTeam === 'home'
                        ? trade.event.home_team.full_name
                        : trade.event.visitor_team.full_name}
                      sport={trade.event?.sport}
                      teamId={trade.selectedTeam === 'home'
                        ? trade.event?.home_team?.id
                        : trade.event?.visitor_team?.id}
                    />
                  </div>
                )}
                <div>
                  <h4 className="font-medium">
                    {trade.event
                      ? (trade.selectedTeam === 'home'
                        ? trade.event.home_team.full_name
                        : trade.event.visitor_team.full_name)
                      : 'Unknown Team'}
                  </h4>
                  {trade.event && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      vs {trade.selectedTeam === 'home'
                        ? trade.event.visitor_team.full_name
                        : trade.event.home_team.full_name}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Original Amount</p>
                  <p className="font-medium">{formatCurrency(trade.amount)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Sold For</p>
                  <p className={`font-medium ${
                    successData && successData.soldValue > trade.amount 
                      ? 'text-green-600 dark:text-green-400' 
                      : successData && successData.soldValue < trade.amount 
                        ? 'text-red-600 dark:text-red-400' 
                        : ''
                  }`}>
                    {successData ? formatCurrency(successData.soldValue) : formatCurrency(trade.currentValue || trade.amount)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
