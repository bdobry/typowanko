import { toStoredTeamName } from './displayNames';

const TEAM_NAME_ALIASES: Record<string, string> = {
  'bosnia and herzegovina': 'bosnia and herzegovina',
  'bosnia herzegovina': 'bosnia and herzegovina',
  'cabo verde': 'cape verde',
  'cape verde': 'cape verde',
  'cape verde islands': 'cape verde',
  'congo dr': 'dr congo',
  'cote d ivoire': 'ivory coast',
  'curacao': 'curacao',
  'democratic republic of congo': 'dr congo',
  'dr congo': 'dr congo',
  'ir iran': 'iran',
  'ivory coast': 'ivory coast',
  'korea republic': 'south korea',
  'new zealand': 'new zealand',
  'republic of ireland': 'ireland',
  'republic of korea': 'south korea',
  'turkey': 'turkey',
  'turkiye': 'turkey',
  'united states of america': 'usa',
  'united states': 'usa',
  'usa': 'usa',
};

export function normalizeTeamName(name: string): string {
  const normalized = toStoredTeamName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return TEAM_NAME_ALIASES[normalized] ?? normalized;
}

export function teamsMatch(apiName: string, fixtureName: string): boolean {
  const apiTeam = normalizeTeamName(apiName);
  const fixtureTeam = normalizeTeamName(fixtureName);
  return apiTeam === fixtureTeam || apiTeam.includes(fixtureTeam) || fixtureTeam.includes(apiTeam);
}
