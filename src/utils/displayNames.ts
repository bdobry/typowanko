const TEAM_NAMES_PL: Record<string, string> = {
  Mexico: 'Meksyk',
  'South Africa': 'RPA',
  'South Korea': 'Korea Południowa',
  'Czech Republic': 'Czechy',
  Canada: 'Kanada',
  'Bosnia & Herzegovina': 'Bośnia i Hercegowina',
  Qatar: 'Katar',
  Switzerland: 'Szwajcaria',
  Brazil: 'Brazylia',
  Morocco: 'Maroko',
  Haiti: 'Haiti',
  Scotland: 'Szkocja',
  USA: 'Stany Zjednoczone',
  Paraguay: 'Paragwaj',
  Australia: 'Australia',
  Turkey: 'Turcja',
  Germany: 'Niemcy',
  Curaçao: 'Curaçao',
  'Ivory Coast': 'Wybrzeże Kości Słoniowej',
  Ecuador: 'Ekwador',
  Netherlands: 'Holandia',
  Japan: 'Japonia',
  Sweden: 'Szwecja',
  Tunisia: 'Tunezja',
  Belgium: 'Belgia',
  Egypt: 'Egipt',
  Iran: 'Iran',
  'New Zealand': 'Nowa Zelandia',
  Spain: 'Hiszpania',
  'Cape Verde': 'Republika Zielonego Przylądka',
  'Saudi Arabia': 'Arabia Saudyjska',
  Uruguay: 'Urugwaj',
  France: 'Francja',
  Senegal: 'Senegal',
  Iraq: 'Irak',
  Norway: 'Norwegia',
  Argentina: 'Argentyna',
  Algeria: 'Algieria',
  Austria: 'Austria',
  Jordan: 'Jordania',
  Portugal: 'Portugalia',
  'DR Congo': 'DR Konga',
  Uzbekistan: 'Uzbekistan',
  Colombia: 'Kolumbia',
  England: 'Anglia',
  Croatia: 'Chorwacja',
  Ghana: 'Ghana',
  Panama: 'Panama',
};

const TEAM_NAMES_LOOKUP = new Map<string, string>([
  ...Object.keys(TEAM_NAMES_PL).map((name) => [normalizeName(name), name] as const),
  ...Object.entries(TEAM_NAMES_PL).map(([storedName, displayName]) => [
    normalizeName(displayName),
    storedName,
  ] as const),
]);

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase('pl-PL');
}

export function displayTeamName(name: string) {
  return TEAM_NAMES_PL[name] ?? name;
}

export function toStoredTeamName(name: string) {
  const trimmed = name.trim();
  return TEAM_NAMES_LOOKUP.get(normalizeName(trimmed)) ?? trimmed;
}

export function displayStageName(name: string) {
  const groupMatch = name.match(/^Group ([A-L])$/);
  if (groupMatch) return `Grupa ${groupMatch[1]}`;

  const matchdayMatch = name.match(/^Matchday (\d+)$/);
  if (matchdayMatch) return `Kolejka ${matchdayMatch[1]}`;

  switch (name) {
    case 'Round of 32':
      return '1/16 finału';
    case 'Round of 16':
      return '1/8 finału';
    case 'Quarter-final':
      return 'Ćwierćfinał';
    case 'Semi-final':
      return 'Półfinał';
    case 'Third place':
      return 'Mecz o 3. miejsce';
    case 'Final':
      return 'Finał';
    default:
      return name;
  }
}
