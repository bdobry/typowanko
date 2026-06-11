import Dexie, { type EntityTable } from 'dexie';

export interface Player {
  id: string;
  name: string;
  createdAt: number;
}

export type FixtureStatus = 'upcoming' | 'locked';

export interface Fixture {
  id: string;
  round: string;
  group?: string;
  homeTeam: string;
  awayTeam: string;
  date: string; // ISO date string
  utcTime?: string;
  venue?: string;
  status: FixtureStatus;
  homeScore?: number;
  awayScore?: number;
  num?: number; // match number for knockout
}

export interface Odd {
  id?: number;
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  odd: number;
  provider?: string; // e.g., 'api-football'
  bookmakerId?: number;
  bookmakerName?: string; // e.g., 'Bet365'
  market?: string; // e.g., 'correct_score'
  fetchedAt?: number; // timestamp
  manuallyEdited?: boolean; // flag to prevent overwriting manually edited odds
  locked?: boolean; // flag to prevent any modification
}

export interface Bet {
  id?: number;
  playerId: string;
  fixtureId: string;
  homeScore: number;
  awayScore: number;
}

export interface MatchOdd {
  id?: number;
  fixtureId: string;
  homeOdd: number; // "1" – home win
  drawOdd: number; // "X" – draw
  awayOdd: number; // "2" – away win
  bookmakerId?: number;
  bookmakerName?: string;
  fetchedAt?: number;
  manuallyEdited?: boolean;
  locked?: boolean;
}

export interface ScoreEntry {
  playerId: string;
  fixtureId: string;
  points: number;
  betHomeScore: number;
  betAwayScore: number;
  resultHomeScore: number;
  resultAwayScore: number;
  odd: number;
  pointType?: 'exact' | 'outcome'; // how points were awarded
}

class TypowankoDb extends Dexie {
  players!: EntityTable<Player, 'id'>;
  fixtures!: EntityTable<Fixture, 'id'>;
  odds!: EntityTable<Odd, 'id'>;
  bets!: EntityTable<Bet, 'id'>;
  scores!: EntityTable<ScoreEntry & { id?: number }, 'id'>;
  matchOdds!: EntityTable<MatchOdd, 'id'>;

  constructor() {
    super('typowanko');
    this.version(1).stores({
      players: 'id, name',
      fixtures: 'id, date, group, status, round',
      odds: '++id, fixtureId, [fixtureId+homeScore+awayScore]',
      bets: '++id, [playerId+fixtureId], fixtureId, playerId',
      scores: '++id, [playerId+fixtureId], fixtureId, playerId',
    });
    this.version(2).stores({
      matchOdds: '++id, fixtureId',
    });
  }
}

export const db = new TypowankoDb();
