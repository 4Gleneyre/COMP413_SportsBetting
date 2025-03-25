'use client';

import { useState, useEffect } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend,
  TimeScale
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Register the components we need from Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface OddsRecord {
  timestamp: Date;
  homeTeamOdds: number;
  visitorTeamOdds: number;
}

interface OddsHistoryChartProps {
  eventId: string;
  homeTeamName: string;
  visitorTeamName: string;
}

export default function OddsHistoryChart({ 
  eventId, 
  homeTeamName, 
  visitorTeamName 
}: OddsHistoryChartProps) {
  const [oddsHistory, setOddsHistory] = useState<OddsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOddsHistory() {
      try {
        setLoading(true);
        
        // Query the oddsHistory subcollection for this event
        const oddsHistoryRef = collection(db, 'events', eventId, 'oddsHistory');
        const oddsQuery = query(oddsHistoryRef, orderBy('timestamp', 'asc'));
        const querySnapshot = await getDocs(oddsQuery);
        
        const records: OddsRecord[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          records.push({
            timestamp: data.timestamp.toDate(), // Convert Firestore timestamp to Date
            homeTeamOdds: data.homeTeamOdds,
            visitorTeamOdds: data.visitorTeamOdds
          });
        });
        
        setOddsHistory(records);
      } catch (err) {
        console.error('Error fetching odds history:', err);
        setError('Failed to load odds history');
      } finally {
        setLoading(false);
      }
    }

    if (eventId) {
      fetchOddsHistory();
    }
  }, [eventId]);

  // If we're still loading or there's an error, show a placeholder
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-pulse">Loading odds history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64 text-red-500">
        {error}
      </div>
    );
  }

  // If no odds history data is available
  if (oddsHistory.length === 0) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        No odds history available
      </div>
    );
  }

  // Format data for Chart.js
  const chartData = {
    labels: oddsHistory.map(record => {
      const date = new Date(record.timestamp);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }),
    datasets: [
      {
        label: homeTeamName,
        data: oddsHistory.map(record => record.homeTeamOdds),
        borderColor: 'rgba(59, 130, 246, 1)', // Blue
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        fill: false,
        tension: 0.3
      },
      {
        label: visitorTeamName,
        data: oddsHistory.map(record => record.visitorTeamOdds),
        borderColor: 'rgba(239, 68, 68, 1)', // Red
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        fill: false,
        tension: 0.3
      }
    ]
  };

  // Configure chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Odds History',
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y}% chance`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        min: 0,
        max: 100,
        title: {
          display: true,
          text: 'Win Probability (%)'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Date & Time'
        }
      }
    }
  };

  return (
    <div className="w-full h-64 mt-6">
      <Line data={chartData} options={chartOptions} />
    </div>
  );
} 