// Types for football-data.org API
export interface SoccerTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
  address?: string;
  website?: string;
  founded?: number;
  clubColors?: string;
  venue?: string;
  coach?: Coach;
}

export interface Coach {
  id: number;
  name: string;
  dateOfBirth?: string;
  nationality?: string;
}

export interface Competition {
  id: number;
  name: string;
  code: string;
  type: string;
  emblem: string;
}

export interface Score {
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  duration?: string;
  fullTime?: {
    home?: number | null;
    away?: number | null;
  };
  halfTime?: {
    home?: number | null;
    away?: number | null;
  };
}

export interface SoccerMatch {
  id: number;
  competition: Competition;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  group?: string;
  homeTeam: SoccerTeam;
  awayTeam: SoccerTeam;
  score: Score;
  odds?: {
    homeWin?: number;
    draw?: number;
    awayWin?: number;
  };
}

// Extended Event type to work with our existing Event interface
export interface SoccerEvent {
  id: string;
  date: string;
  home_team: {
    id: number;
    full_name: string;
    abbreviation: string;
    city?: string;
    logo?: string;
  };
  visitor_team: {
    id: number;
    full_name: string;
    abbreviation: string;
    city?: string;
    logo?: string;
  };
  home_team_score: number;
  visitor_team_score: number;
  period: number;
  status: string;
  time: string | null;
  updatedAt: Date;
  homeTeamCurrentOdds: number;
  visitorTeamCurrentOdds: number;
  drawOdds?: number; // Soccer has draw possibility
  datetime: string;
  trades?: string[];
  sport: 'soccer'; // Identifier for soccer events
  competition?: {
    id: number;
    name: string;
    logo?: string;
  };
} 