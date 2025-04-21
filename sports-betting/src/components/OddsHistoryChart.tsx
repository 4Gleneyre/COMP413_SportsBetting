'use client';

import { useEffect, useState } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface OddsRecord {
  timestamp: any;
  homeTeamOdds: number;
  visitorTeamOdds: number;
  drawOdds?: number;
}

interface OddsHistoryChartProps {
  data?: OddsRecord[];
  eventId?: string;
  homeTeamName: string;
  awayTeamName: string;
  showDraw?: boolean;
}

export default function OddsHistoryChart({ 
  data, 
  eventId, 
  homeTeamName, 
  awayTeamName,
  showDraw = false
}: OddsHistoryChartProps) {
  const [oddsHistory, setOddsHistory] = useState<OddsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch odds history from Firestore if data is not provided directly
  useEffect(() => {
    if (data) {
      setOddsHistory(data);
      setLoading(false);
      return;
    }

    if (!eventId) {
      setError('No event ID or data provided');
      setLoading(false);
      return;
    }

    const fetchOddsHistory = async () => {
      try {
        const oddsQuery = query(
          collection(db, 'events', eventId, 'oddsHistory'),
          orderBy('timestamp', 'asc')
        );
        
        const snapshot = await getDocs(oddsQuery);
        const records = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : data.timestamp,
            homeTeamOdds: data.homeTeamOdds,
            visitorTeamOdds: data.visitorTeamOdds || data.awayTeamOdds,
            drawOdds: data.drawOdds
          };
        });
        
        setOddsHistory(records);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching odds history:', err);
        setError('Failed to load odds history');
        setLoading(false);
      }
    };

    fetchOddsHistory();
  }, [eventId, data]);

  // If we're still loading or there's an error, show a placeholder
  if (loading) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="text-gray-500 dark:text-gray-400">Loading odds history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  if (oddsHistory.length === 0) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg">
        <div className="text-gray-500 dark:text-gray-400">No odds history available</div>
      </div>
    );
  }

  // Format data for Chart.js
  const chartData = {
    labels: oddsHistory.map(record => {
      // Convert Firestore Timestamp to JavaScript Date properly
      let dateObj;
      
      if (record.timestamp && typeof record.timestamp.toDate === 'function') {
        // If it's a Firestore Timestamp object, use its toDate() method
        dateObj = record.timestamp.toDate();
      } else if (record.timestamp instanceof Date) {
        // If it's already a Date object, use it directly
        dateObj = record.timestamp;
      } else {
        // Fallback for other formats
        dateObj = new Date(record.timestamp);
      }
      
      // Format the date if it's valid, otherwise show 'Invalid Date'
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        console.error('Invalid timestamp:', record.timestamp);
        return 'Invalid Date';
      }
    }),
    datasets: [
      {
        label: `${homeTeamName} (Home)`,
        data: oddsHistory.map(record => record.homeTeamOdds),
        borderColor: 'rgba(59, 130, 246, 1)', // Blue
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        fill: false,
        tension: 0.3,
        pointRadius: 0 // Remove dots
      },
      {
        label: `${awayTeamName} (Away)`,
        data: oddsHistory.map(record => record.visitorTeamOdds),
        borderColor: 'rgba(239, 68, 68, 1)', // Red
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        fill: false,
        tension: 0.3,
        pointRadius: 0 // Remove dots
      },
      // Add draw dataset if showDraw is true and we have data
      ...(showDraw ? [{
        label: 'Draw',
        data: oddsHistory.map(record => record.drawOdds || 0),
        borderColor: 'rgba(234, 179, 8, 1)', // Yellow
        backgroundColor: 'rgba(234, 179, 8, 0.2)',
        fill: false,
        tension: 0.3,
        pointRadius: 0 // Remove dots
      }] : [])
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Win Probability (%)'
        }
      }
    },
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          boxWidth: 6
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
          }
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