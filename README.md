# COMP413_SportsBetting

## Features

### NBA Betting Analysis Function

The project includes a Firebase Cloud Function that provides detailed sports betting analysis for NBA games using OpenAI's web search capabilities. This function:

- Takes two NBA teams and a game date as input
- Returns a comprehensive betting analysis with current stats, odds, and expert opinions
- Uses OpenAI's advanced web search to find the most up-to-date information
- Includes citations to sources for all information

### Soccer Match Betting Integration

We've integrated football-data.org API for soccer match betting:

- Fetches upcoming soccer matches from major leagues (Premier League, La Liga, Bundesliga, etc.)
- Updates match results and settles bets automatically
- Supports three-way betting (home win, away win, draw)
- Includes AI-generated odds prediction using Google's Gemini
- Provides detailed betting analysis for soccer matches

#### Usage

### NBA Betting Analysis
```javascript
// Example client-side code to call the betting analysis function
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();
const getGameBettingAnalysis = httpsCallable(functions, 'getGameBettingAnalysis');

// Call the function with team names and game date
getGameBettingAnalysis({
  homeTeam: "Los Angeles Lakers",
  awayTeam: "Boston Celtics",
  gameDate: "2025-02-15" // YYYY-MM-DD format
})
.then((result) => {
  // Access the analysis data
  const { analysis, citations, metadata } = result.data;
  console.log(analysis); // The betting analysis text
  console.log(citations); // Array of citation objects with URLs
})
.catch((error) => {
  console.error("Error getting game analysis:", error);
});
```

### Soccer Match Analysis
```javascript
// Example client-side code to call the soccer betting analysis function
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();
const getSoccerMatchBettingAnalysis = httpsCallable(functions, 'getSoccerMatchBettingAnalysis');

// Call the function with team names and match date
getSoccerMatchBettingAnalysis({
  homeTeam: "Manchester United",
  awayTeam: "Liverpool",
  competition: "Premier League",
  matchDate: "2025-02-15" // YYYY-MM-DD format
})
.then((result) => {
  // Access the analysis data
  const { analysis, citations, metadata } = result.data;
  console.log(analysis); // The betting analysis text
  console.log(citations); // Array of citation objects with URLs
})
.catch((error) => {
  console.error("Error getting match analysis:", error);
});
```

### Response Format

Both functions return data in the following format:

```javascript
{
  analysis: "Detailed betting analysis text...",
  citations: [
    {
      text: "cited text portion",
      url: "https://source.com/article",
      title: "Source Title"
    },
    // Additional citations...
  ],
  metadata: {
    // NBA game
    homeTeam: "Los Angeles Lakers",
    awayTeam: "Boston Celtics",
    gameDate: "2025-02-15",
    
    // OR Soccer match
    homeTeam: "Manchester United",
    awayTeam: "Liverpool",
    competition: "Premier League", 
    matchDate: "2025-02-15",
    
    generatedAt: Timestamp
  }
}
```

## Development Setup

### Environment Configuration

The functions require API keys for various services. To set up:

1. Copy `functions/.env.example` to `functions/.env`
2. Add your OpenAI API key to the `.env` file
3. Add your Gemini API key (for odds prediction)
4. Add your football-data.org API key

### Required Permissions

This function requires authentication to use. Users must be signed in to your Firebase app to call this function.
