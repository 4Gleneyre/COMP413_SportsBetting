export interface Team {
  id: number | string;
  abbreviation: string;
  city?: string;
  conference?: string;
  division?: string;
  full_name: string;
  name?: string;
  logo?: string; // Added for soccer teams
}

export interface Event {
  id: string;
  date: string;
  home_team: Team;
  visitor_team: Team;
  home_team_score: number;
  visitor_team_score: number;
  period: number;
  postseason: boolean;
  season: number;
  status: string;
  time: string | null;
  updatedAt: Date;
  homeTeamCurrentOdds: number;
  visitorTeamCurrentOdds: number;
  drawOdds?: number; // For soccer matches
  datetime: string;
  trades?: string[];  // Array of trade IDs
  sport?: 'basketball' | 'soccer'; // Sport identifier
  competition?: { // For soccer matches
    id: number;
    name: string;
    logo?: string;
  };
} 