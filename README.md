# COMP413_SportsBetting

## Features

### NBA Betting Analysis Function

The project includes a Firebase Cloud Function that provides detailed sports betting analysis for NBA games using OpenAI's web search capabilities. This function:

- Takes two NBA teams and a game date as input
- Returns a comprehensive betting analysis with current stats, odds, and expert opinions
- Uses OpenAI's advanced web search to find the most up-to-date information
- Includes citations to sources for all information

#### Usage

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

#### Response Format

The function returns data in the following format:

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
    homeTeam: "Los Angeles Lakers",
    awayTeam: "Boston Celtics",
    gameDate: "2025-02-15",
    generatedAt: Timestamp
  }
}
```

## Development Setup

### Environment Configuration

The function requires an OpenAI API key with web search capabilities. To set up:

1. Copy `functions/.env.example` to `functions/.env`
2. Add your OpenAI API key to the `.env` file
3. For deployment, set the secret in Firebase:
   ```
   firebase functions:secrets:set OPENAI_API_KEY
   ```

### Required Permissions

This function requires authentication to use. Users must be signed in to your Firebase app to call this function.
