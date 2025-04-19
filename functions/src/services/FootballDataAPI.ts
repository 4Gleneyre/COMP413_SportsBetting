import axios from 'axios';

export class FootballDataAPI {
  private baseUrl = 'https://api.football-data.org/v4';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, params: any = {}) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          'X-Auth-Token': this.apiKey
        },
        params
      });
      return response.data;
    } catch (error) {
      console.error('Football Data API Error:', error);
      throw error;
    }
  }

  /**
   * Get matches for a specific competition
   * @param competitionCode - The code for the competition (e.g., 'PL' for Premier League)
   * @param options - Additional options like dateFrom, dateTo, status
   */
  async getMatchesByCompetition(competitionCode: string, options: any = {}) {
    return this.request(`/competitions/${competitionCode}/matches`, options);
  }

  /**
   * Get matches for a date range
   * @param options - Options like dateFrom, dateTo, status
   */
  async getMatches(options: any = {}) {
    return this.request('/matches', options);
  }

  /**
   * Get a specific match by ID
   * @param matchId - The ID of the match
   */
  async getMatch(matchId: number) {
    return this.request(`/matches/${matchId}`);
  }

  /**
   * Get information about a specific team
   * @param teamId - The ID of the team
   */
  async getTeam(teamId: number) {
    return this.request(`/teams/${teamId}`);
  }

  /**
   * Get a list of all available competitions
   */
  async getCompetitions() {
    return this.request('/competitions');
  }
} 