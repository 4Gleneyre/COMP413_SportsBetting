const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

// Get the API key from environment variables
const apiKey = process.env.FOOTBALL_DATA_API_KEY;

if (!apiKey) {
  console.error('FOOTBALL_DATA_API_KEY is not set in .env file');
  process.exit(1);
}

async function fetchCompetitions() {
  try {
    console.log('Fetching competitions...');
    const response = await axios.get('https://api.football-data.org/v4/competitions', {
      headers: {
        'X-Auth-Token': apiKey
      }
    });
    
    console.log(`Found ${response.data.count} competitions`);
    console.log('Available competitions:');
    response.data.competitions.forEach(comp => {
      console.log(`- ${comp.name} (${comp.code}): ${comp.area.name}`);
    });
    
    return response.data.competitions;
  } catch (error) {
    console.error('Error fetching competitions:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchUpcomingMatches(competitionCode) {
  try {
    // Get today's date and date 7 days from now
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextWeekStr = nextWeek.toISOString().split('T')[0];
    
    console.log(`Fetching matches for ${competitionCode} from ${todayStr} to ${nextWeekStr}...`);
    
    const response = await axios.get(
      `https://api.football-data.org/v4/competitions/${competitionCode}/matches`,
      {
        headers: {
          'X-Auth-Token': apiKey
        },
        params: {
          dateFrom: todayStr,
          dateTo: nextWeekStr
        }
      }
    );
    
    console.log(`Found ${response.data.count} matches`);
    
    // Display match details
    response.data.matches.forEach(match => {
      console.log(`
        Match: ${match.homeTeam.name} vs ${match.awayTeam.name}
        Date: ${new Date(match.utcDate).toLocaleString()}
        Competition: ${match.competition.name}
        Status: ${match.status}
      `);
    });
    
    return response.data.matches;
  } catch (error) {
    console.error('Error fetching matches:', error.response?.data || error.message);
    throw error;
  }
}

async function runTests() {
  try {
    // Step 1: Fetch all competitions
    const competitions = await fetchCompetitions();
    
    // Step 2: Fetch upcoming matches for Premier League
    if (competitions.some(comp => comp.code === 'PL')) {
      await fetchUpcomingMatches('PL');
    } else {
      console.log('Premier League not found in available competitions');
    }
    
    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the tests
runTests(); 