export interface Team {
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
  full_name: string;
  id: number;
  name: string;
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
  datetime: string;
} 