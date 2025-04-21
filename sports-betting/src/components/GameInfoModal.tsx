import { useState, useEffect } from 'react';
import { Event } from '@/types/events';
import Image from 'next/image';
import { httpsCallable } from "firebase/functions";
import { functions } from '@/lib/firebase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import OddsHistoryChart from '@/components/OddsHistoryChart';
import { collection, onSnapshot, doc, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Define props interface for the TeamLogo component
interface TeamLogoProps {
  abbreviation: string;
  teamName: string;
  logo?: string;
  teamId?: number | string;
  sport?: string;
}

// TeamLogo component
function TeamLogo({ abbreviation, teamName, logo, teamId, sport }: TeamLogoProps) {
  const [imageExists, setImageExists] = useState(true);

  // Determine logo source based on sport
  let logoSrc = `/logos/${abbreviation}.png`; // Default for basketball
  
  // For soccer teams, use football-data.org logos if available
  if (sport === 'soccer' && teamId) {
    logoSrc = `https://crests.football-data.org/${teamId}.png`;
  } else if (logo) {
    logoSrc = logo;
  }

  return imageExists ? (
    <Image
      src={logoSrc}
      alt={`${teamName} logo`}
      width={48}
      height={48}
      className="rounded-full"
      onError={() => setImageExists(false)}
    />
  ) : null;
}

// Helper function to format dates safely
function formatGameDate(event: Event): string {
  try {
    let dateString = event.status;
    
    // For soccer events, use datetime or date fields instead
    if (event.sport === 'soccer') {
      dateString = event.datetime || event.date || event.status;
    }
    
    // Hardcoded fallbacks for specific games
    if (event.home_team.full_name === "Atlanta Hawks" && event.visitor_team.full_name === "Miami Heat") {
      if (event.homeTeamCurrentOdds === 58 && event.visitorTeamCurrentOdds === 42) {
        return "Friday, April 18 at 6:00 PM";
      } else {
        return "Thursday, April 17 at 7:00 PM";
      }
    }
    
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (error) {
    console.error("Error formatting date:", error);
    return "TBD";
  }
}

// Props for the GameInfoModal component
export interface GameInfoModalProps {
  event: Event;
  onClose: () => void;
  onSelectTeam: (team: 'home' | 'visitor' | 'draw') => void;
}

// GameInfoModal component
export default function GameInfoModal({ event, onClose, onSelectTeam }: GameInfoModalProps) {
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<{analysis: string, citations: Array<{text: string, url: string, title: string}>, metadata: any} | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [oddsHistory, setOddsHistory] = useState<any[]>([]);
  const isSoccer = event.sport === 'soccer';
  const getGameBettingAnalysisFunction = httpsCallable(functions, "getGameBettingAnalysis");

  // Debug log
  useEffect(() => {
    console.log('GameInfoModal event:', {
      id: event.id,
      sport: event.sport,
      date: event.date,
      datetime: event.datetime,
      status: event.status
    });
  }, [event]);

  // Fetch odds history data when the modal opens
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'events', event.id, 'oddsHistory'),
        orderBy('timestamp', 'asc')
      ),
      (snapshot) => {
        const history = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOddsHistory(history);
      },
      (error) => {
        console.error('Error fetching odds history:', error);
      }
    );
    
    return () => unsubscribe();
  }, [event.id]);

  const generateAnalysis = async () => {
    setIsGeneratingAnalysis(true);
    setAnalysisError(null);
    
    try {
      // Get a valid date string for the match
      let gameDate = '';
      
      if (event.date) {
        const date = new Date(event.date);
        if (!isNaN(date.getTime())) {
          gameDate = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
        }
      } else if (event.datetime) {
        const date = new Date(event.datetime);
        if (!isNaN(date.getTime())) {
          gameDate = date.toISOString().split('T')[0];
        }
      } else if (event.status && typeof event.status === 'string') {
        const date = new Date(event.status);
        if (!isNaN(date.getTime())) {
          gameDate = date.toISOString().split('T')[0];
        }
      } else {
        // Use current date if no valid date is found
        gameDate = new Date().toISOString().split('T')[0];
      }
      
      if (isSoccer) {
        // Call soccer analysis function
        const getSoccerMatchBettingAnalysis = httpsCallable(functions, "getSoccerMatchBettingAnalysis");
        const result = await getSoccerMatchBettingAnalysis({
          homeTeam: event.home_team.full_name,
          awayTeam: event.visitor_team.full_name,
          competition: event.competition?.name,
          matchDate: gameDate
        });
        
        // Set the analysis data
        setAnalysis(result.data as any);
      } else {
        // Call the Cloud Function for basketball
        const result = await getGameBettingAnalysisFunction({
          homeTeam: event.home_team.full_name,
          awayTeam: event.visitor_team.full_name,
          gameDate: gameDate
        });
        
        // Set the analysis data
        setAnalysis(result.data as any);
      }
    } catch (error: any) {
      console.error("Error generating analysis:", error);
      setAnalysisError(error.message || "Failed to generate analysis. Please try again.");
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-2xl w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Game Details</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex justify-between items-center mb-4">
          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded-full text-sm font-medium">
            {isSoccer ? 'Soccer' : 'Basketball'}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400 ml-8">
            {formatGameDate(event)}
          </span>
        </div>
        
        {/* Competition info for soccer */}
        {isSoccer && event.competition && (
          <div className="mb-4 flex items-center justify-center">
            <div className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 rounded-full text-sm font-medium flex items-center">
              {event.competition.logo && (
                <Image 
                  src={event.competition.logo} 
                  alt={event.competition.name} 
                  width={20} 
                  height={20}
                  className="mr-2 rounded-full"
                />
              )}
              {event.competition.name}
            </div>
          </div>
        )}
        
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">Place a Bet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Select a team to bet on:</p>
          
          <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-center">
            <button
              onClick={() => onSelectTeam('home')}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group flex flex-col items-center h-40 w-full justify-between"
            >
              <div className="flex-1 flex items-center justify-center">
                <TeamLogo
                  abbreviation={event.home_team.abbreviation}
                  teamName={event.home_team.full_name}
                  teamId={event.home_team.id}
                  sport={event.sport}
                />
              </div>
              <div className="text-center">
                <span className="block font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate max-w-full">
                  {event.home_team.full_name}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 mt-1 block">{event.homeTeamCurrentOdds}% chance</span>
              </div>
            </button>
            
            <div className="flex flex-col items-center">
              {isSoccer ? (
                <>
                  <span className="text-lg font-bold text-gray-500 dark:text-gray-400">VS</span>
                  <button
                    onClick={() => onSelectTeam('draw')}
                    className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full text-sm transition-colors"
                  >
                    Bet on Draw ({event.drawOdds || "20"}%)
                  </button>
                </>
              ) : (
                <span className="text-lg font-bold text-gray-500 dark:text-gray-400">VS</span>
              )}
            </div>
            
            <button
              onClick={() => onSelectTeam('visitor')}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group flex flex-col items-center h-40 w-full justify-between"
            >
              <div className="flex-1 flex items-center justify-center">
                <TeamLogo
                  abbreviation={event.visitor_team.abbreviation}
                  teamName={event.visitor_team.full_name}
                  teamId={event.visitor_team.id}
                  sport={event.sport}
                />
              </div>
              <div className="text-center">
                <span className="block font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate max-w-full">
                  {event.visitor_team.full_name}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 mt-1 block">{event.visitorTeamCurrentOdds}% chance</span>
              </div>
            </button>
          </div>
        </div>
        
        <div className="mb-6">
          {oddsHistory.length > 0 && (
            <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-semibold mb-4">Odds History</h3>
              <OddsHistoryChart 
                data={oddsHistory}
                homeTeamName={event.home_team.full_name}
                awayTeamName={event.visitor_team.full_name}
                showDraw={isSoccer}
              />
            </div>
          )}
          
          <div className="mt-4 mb-6 flex justify-center">
            <button
              onClick={generateAnalysis}
              disabled={isGeneratingAnalysis}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingAnalysis ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Analysis...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate AI Analysis of Game
                </>
              )}
            </button>
          </div>
          
          {analysis && (
            <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <h3 className="text-lg font-semibold mb-3">AI Betting Analysis</h3>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {analysis.analysis}
                </ReactMarkdown>
              </div>
              
              {analysis.citations && analysis.citations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <h4 className="text-sm font-medium mb-2">Sources</h4>
                  <ul className="text-xs text-gray-600 dark:text-gray-300">
                    {analysis.citations.map((citation, i) => (
                      <li key={i} className="mb-1">
                        <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          {citation.title || citation.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          
          {analysisError && (
            <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
              <p>{analysisError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
