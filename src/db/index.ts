import Dexie, { type EntityTable } from 'dexie';

export interface Player {
  id: string;
  name: string;
  createdAt: number;
  lastOnlineAt?: number;
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
  updatedAt?: number;
  updatedBy?: 'host' | 'player';
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

export const HOST_DB_NAME = 'typowanko';

export class TypowankoDb extends Dexie {
  players!: EntityTable<Player, 'id'>;
  fixtures!: EntityTable<Fixture, 'id'>;
  odds!: EntityTable<Odd, 'id'>;
  bets!: EntityTable<Bet, 'id'>;
  scores!: EntityTable<ScoreEntry & { id?: number }, 'id'>;
  matchOdds!: EntityTable<MatchOdd, 'id'>;

  constructor(name = HOST_DB_NAME) {
    super(name);
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
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        const fixtures = tx.table('fixtures');
        const usaParaguay = await fixtures.get('D1');
        if (
          usaParaguay?.homeTeam === 'USA' &&
          usaParaguay?.awayTeam === 'Paraguay' &&
          usaParaguay.date === '2026-06-12' &&
          usaParaguay.utcTime === '01:00'
        ) {
          await fixtures.update('D1', { date: '2026-06-13' });
        }
      });
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        const fixtures = tx.table('fixtures');
        const capeVerdeSaudiArabia = await fixtures.get('H5');
        if (
          capeVerdeSaudiArabia?.homeTeam === 'Cape Verde' &&
          capeVerdeSaudiArabia?.awayTeam === 'Saudi Arabia' &&
          capeVerdeSaudiArabia.date === '2026-06-26' &&
          capeVerdeSaudiArabia.utcTime === '00:00'
        ) {
          await fixtures.update('H5', { date: '2026-06-27' });
        }
      });
  }
}

export let db = new TypowankoDb();

export function setActiveDatabase(name: string) {
  if (db.name === name) return db;
  db = new TypowankoDb(name);
  return db;
}

export function setHostDatabase() {
  return setActiveDatabase(HOST_DB_NAME);
}

export function getViewerDatabaseName(leagueId: string) {
  return `${HOST_DB_NAME}-view-${leagueId}`;
}
