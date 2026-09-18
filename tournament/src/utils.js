// Pure helpers with no storage dependency, shared between App.js and the api/ modules.

export function generateSeededBracket(players, playerStats) {
  const sorted = [...players].sort((a, b) => {
    const aStats = playerStats[a] || { bestBuilderBaseTrophies: 0 };
    const bStats = playerStats[b] || { bestBuilderBaseTrophies: 0 };
    return bStats.bestBuilderBaseTrophies - aStats.bestBuilderBaseTrophies;
  });

  const seeded = [];
  const top = [];
  const bottom = [];

  sorted.forEach((player, index) => {
    if (index % 2 === 0) {
      top.push(player);
    } else {
      bottom.unshift(player);
    }
  });

  seeded.push(...top, ...bottom);

  const pairs = [];
  for (let i = 0; i < seeded.length; i += 2) {
    if (i + 1 < seeded.length) {
      pairs.push([seeded[i], seeded[i + 1]]);
    } else {
      pairs.push([seeded[i], 'BYE']);
    }
  }

  return pairs;
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Standard bracket seed order (e.g. size 8 -> [1,8,4,5,2,7,3,6]), so that
// when byes are needed they land on the strongest seeds and are spread
// across different first-round matches - never facing each other.
function standardSeedOrder(size) {
  if (size === 1) return [1];
  const prev = standardSeedOrder(size / 2);
  const out = [];
  prev.forEach((s) => {
    out.push(s);
    out.push(size + 1 - s);
  });
  return out;
}

// Seeds round 1 of the winners bracket for a double-elimination tournament.
// Unlike generateSeededBracket (which just byes off one odd leftover), this
// pads all the way up to a power of two so the bracket has a fixed, known
// number of winners-bracket rounds - the losers-bracket routing depends on
// that being fixed and known in advance.
export function seedDoubleEliminationBracket(players, playerStats) {
  const bracketSize = nextPowerOfTwo(players.length);
  const sorted = [...players].sort((a, b) => {
    const aStats = playerStats[a] || { bestBuilderBaseTrophies: 0 };
    const bStats = playerStats[b] || { bestBuilderBaseTrophies: 0 };
    return bStats.bestBuilderBaseTrophies - aStats.bestBuilderBaseTrophies;
  });

  const seedOrder = standardSeedOrder(bracketSize);
  const slots = seedOrder.map((seed) => sorted[seed - 1] || 'BYE');

  const pairs = [];
  for (let i = 0; i < slots.length; i += 2) {
    pairs.push([slots[i], slots[i + 1]]);
  }

  return { pairs, bracketSize };
}

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Every round is pinned to a fixed 24h-spaced "day" counted from the
// tournament's start, so a round decided early still can't be played early -
// everyone advances at the same pace.
export function getRoundUnlockTime(tournament, round) {
  if (!tournament?.startedAt) return null;
  return tournament.startedAt + (round - 1) * ONE_DAY_MS;
}

// Rounds are paced one per day, so this doubles as "how many days will this
// tournament take" - purely a function of player count and format, since
// bracket size is always chosen automatically to fit however many sign up.
export function estimateTournamentDays(playerCount, format) {
  if (!playerCount || playerCount < 2) return 0;
  const k = Math.ceil(Math.log2(playerCount));
  if (format === 'double_elimination') {
    const totalLbRounds = Math.max(2 * (k - 1), 1);
    return totalLbRounds + 2; // grand final + a possible bracket-reset decider
  }
  return k;
}

// A player is eliminated once their loss count reaches the format's
// threshold - 1 loss ends you in single elimination, 2 in double elimination
// (a losers-bracket drop from the winners bracket is only your first loss,
// so this single counter naturally handles winners-bracket losses, losers-
// bracket losses, and even a grand-final bracket reset without needing to
// special-case which bracket a loss happened in).
export function getPlayersRemaining(tournament, matches) {
  const lossThreshold = tournament?.format === 'double_elimination' ? 2 : 1;
  const lossCounts = {};

  for (const m of matches) {
    if (m.status !== 'completed' || !m.winner) continue;
    if (m.player1 === 'BYE' || m.player2 === 'BYE') continue;
    const loser = m.winner === m.player1 ? m.player2 : m.player1;
    if (!loser) continue;
    lossCounts[loser] = (lossCounts[loser] || 0) + 1;
  }

  return (tournament?.players || []).filter((p) => (lossCounts[p] || 0) < lossThreshold);
}

export function formatCountdown(ms) {
  if (ms <= 0) return null;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

export function getTimeRemaining(startTime) {
  if (!startTime) return null;
  const now = new Date().getTime();
  const elapsed = now - startTime;
  const TIMEOUT_MS = 16 * 60 * 60 * 1000;
  const remaining = TIMEOUT_MS - elapsed;

  if (remaining <= 0) return 'EXPIRED';

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  return `${hours}h ${minutes}m`;
}

export function getTimeRemainingDisplay(startTime) {
  const remaining = getTimeRemaining(startTime);
  if (!remaining) return null;
  if (remaining === 'EXPIRED') return { text: 'TIMEOUT', color: 'text-white font-bold' };

  const hours = parseInt(remaining);
  if (hours <= 2) return { text: remaining, color: 'text-white font-bold' };
  if (hours <= 8) return { text: remaining, color: 'text-white' };
  return { text: remaining, color: 'text-neutral-400' };
}

// Clash of Clans location ids for the countries a player can pick as their
// "local ranking" home country - the player API has no country field of its
// own, so this has to be self-reported. Pulled from the real /locations
// endpoint (continent-level entries and two mislabeled continent duplicates
// excluded, since the per-country rankings endpoint 404s for those).
export const COUNTRIES = [
  { id: 32000009, name: 'Albania' },
  { id: 32000010, name: 'Algeria' },
  { id: 32000011, name: 'American Samoa' },
  { id: 32000012, name: 'Andorra' },
  { id: 32000013, name: 'Angola' },
  { id: 32000014, name: 'Anguilla' },
  { id: 32000015, name: 'Antarctica' },
  { id: 32000016, name: 'Antigua and Barbuda' },
  { id: 32000017, name: 'Argentina' },
  { id: 32000018, name: 'Armenia' },
  { id: 32000019, name: 'Aruba' },
  { id: 32000020, name: 'Ascension Island' },
  { id: 32000021, name: 'Australia' },
  { id: 32000022, name: 'Austria' },
  { id: 32000023, name: 'Azerbaijan' },
  { id: 32000024, name: 'Bahamas' },
  { id: 32000025, name: 'Bahrain' },
  { id: 32000026, name: 'Bangladesh' },
  { id: 32000027, name: 'Barbados' },
  { id: 32000028, name: 'Belarus' },
  { id: 32000029, name: 'Belgium' },
  { id: 32000030, name: 'Belize' },
  { id: 32000031, name: 'Benin' },
  { id: 32000032, name: 'Bermuda' },
  { id: 32000033, name: 'Bhutan' },
  { id: 32000034, name: 'Bolivia' },
  { id: 32000035, name: 'Bosnia and Herzegovina' },
  { id: 32000036, name: 'Botswana' },
  { id: 32000037, name: 'Bouvet Island' },
  { id: 32000038, name: 'Brazil' },
  { id: 32000039, name: 'British Indian Ocean Territory' },
  { id: 32000040, name: 'British Virgin Islands' },
  { id: 32000041, name: 'Brunei' },
  { id: 32000042, name: 'Bulgaria' },
  { id: 32000043, name: 'Burkina Faso' },
  { id: 32000044, name: 'Burundi' },
  { id: 32000045, name: 'Cambodia' },
  { id: 32000046, name: 'Cameroon' },
  { id: 32000047, name: 'Canada' },
  { id: 32000048, name: 'Canary Islands' },
  { id: 32000049, name: 'Cape Verde' },
  { id: 32000050, name: 'Caribbean Netherlands' },
  { id: 32000051, name: 'Cayman Islands' },
  { id: 32000052, name: 'Central African Republic' },
  { id: 32000053, name: 'Ceuta and Melilla' },
  { id: 32000054, name: 'Chad' },
  { id: 32000055, name: 'Chile' },
  { id: 32000056, name: 'China' },
  { id: 32000057, name: 'Christmas Island' },
  { id: 32000058, name: 'Cocos (Keeling) Islands' },
  { id: 32000059, name: 'Colombia' },
  { id: 32000060, name: 'Comoros' },
  { id: 32000061, name: 'Congo (DRC)' },
  { id: 32000062, name: 'Congo (Republic)' },
  { id: 32000063, name: 'Cook Islands' },
  { id: 32000064, name: 'Costa Rica' },
  { id: 32000066, name: 'Croatia' },
  { id: 32000067, name: 'Cuba' },
  { id: 32000068, name: 'Curaçao' },
  { id: 32000069, name: 'Cyprus' },
  { id: 32000070, name: 'Czech Republic' },
  { id: 32000065, name: 'Côte d’Ivoire' },
  { id: 32000071, name: 'Denmark' },
  { id: 32000072, name: 'Diego Garcia' },
  { id: 32000073, name: 'Djibouti' },
  { id: 32000074, name: 'Dominica' },
  { id: 32000075, name: 'Dominican Republic' },
  { id: 32000076, name: 'Ecuador' },
  { id: 32000077, name: 'Egypt' },
  { id: 32000078, name: 'El Salvador' },
  { id: 32000079, name: 'Equatorial Guinea' },
  { id: 32000080, name: 'Eritrea' },
  { id: 32000081, name: 'Estonia' },
  { id: 32000082, name: 'Ethiopia' },
  { id: 32000083, name: 'Falkland Islands' },
  { id: 32000084, name: 'Faroe Islands' },
  { id: 32000085, name: 'Fiji' },
  { id: 32000086, name: 'Finland' },
  { id: 32000087, name: 'France' },
  { id: 32000088, name: 'French Guiana' },
  { id: 32000089, name: 'French Polynesia' },
  { id: 32000090, name: 'French Southern Territories' },
  { id: 32000091, name: 'Gabon' },
  { id: 32000092, name: 'Gambia' },
  { id: 32000093, name: 'Georgia' },
  { id: 32000094, name: 'Germany' },
  { id: 32000095, name: 'Ghana' },
  { id: 32000096, name: 'Gibraltar' },
  { id: 32000097, name: 'Greece' },
  { id: 32000098, name: 'Greenland' },
  { id: 32000099, name: 'Grenada' },
  { id: 32000100, name: 'Guadeloupe' },
  { id: 32000101, name: 'Guam' },
  { id: 32000102, name: 'Guatemala' },
  { id: 32000103, name: 'Guernsey' },
  { id: 32000104, name: 'Guinea' },
  { id: 32000105, name: 'Guinea-Bissau' },
  { id: 32000106, name: 'Guyana' },
  { id: 32000107, name: 'Haiti' },
  { id: 32000108, name: 'Heard & McDonald Islands' },
  { id: 32000109, name: 'Honduras' },
  { id: 32000110, name: 'Hong Kong' },
  { id: 32000111, name: 'Hungary' },
  { id: 32000112, name: 'Iceland' },
  { id: 32000113, name: 'India' },
  { id: 32000114, name: 'Indonesia' },
  { id: 32000115, name: 'Iran' },
  { id: 32000116, name: 'Iraq' },
  { id: 32000117, name: 'Ireland' },
  { id: 32000118, name: 'Isle of Man' },
  { id: 32000119, name: 'Israel' },
  { id: 32000120, name: 'Italy' },
  { id: 32000121, name: 'Jamaica' },
  { id: 32000122, name: 'Japan' },
  { id: 32000123, name: 'Jersey' },
  { id: 32000124, name: 'Jordan' },
  { id: 32000125, name: 'Kazakhstan' },
  { id: 32000126, name: 'Kenya' },
  { id: 32000127, name: 'Kiribati' },
  { id: 32000128, name: 'Kosovo' },
  { id: 32000129, name: 'Kuwait' },
  { id: 32000130, name: 'Kyrgyzstan' },
  { id: 32000131, name: 'Laos' },
  { id: 32000132, name: 'Latvia' },
  { id: 32000133, name: 'Lebanon' },
  { id: 32000134, name: 'Lesotho' },
  { id: 32000135, name: 'Liberia' },
  { id: 32000136, name: 'Libya' },
  { id: 32000137, name: 'Liechtenstein' },
  { id: 32000138, name: 'Lithuania' },
  { id: 32000139, name: 'Luxembourg' },
  { id: 32000140, name: 'Macau' },
  { id: 32000142, name: 'Madagascar' },
  { id: 32000143, name: 'Malawi' },
  { id: 32000144, name: 'Malaysia' },
  { id: 32000145, name: 'Maldives' },
  { id: 32000146, name: 'Mali' },
  { id: 32000147, name: 'Malta' },
  { id: 32000148, name: 'Marshall Islands' },
  { id: 32000149, name: 'Martinique' },
  { id: 32000150, name: 'Mauritania' },
  { id: 32000151, name: 'Mauritius' },
  { id: 32000152, name: 'Mayotte' },
  { id: 32000153, name: 'Mexico' },
  { id: 32000154, name: 'Micronesia' },
  { id: 32000155, name: 'Moldova' },
  { id: 32000156, name: 'Monaco' },
  { id: 32000157, name: 'Mongolia' },
  { id: 32000158, name: 'Montenegro' },
  { id: 32000159, name: 'Montserrat' },
  { id: 32000160, name: 'Morocco' },
  { id: 32000161, name: 'Mozambique' },
  { id: 32000162, name: 'Myanmar (Burma)' },
  { id: 32000163, name: 'Namibia' },
  { id: 32000164, name: 'Nauru' },
  { id: 32000165, name: 'Nepal' },
  { id: 32000166, name: 'Netherlands' },
  { id: 32000167, name: 'New Caledonia' },
  { id: 32000168, name: 'New Zealand' },
  { id: 32000169, name: 'Nicaragua' },
  { id: 32000170, name: 'Niger' },
  { id: 32000171, name: 'Nigeria' },
  { id: 32000172, name: 'Niue' },
  { id: 32000173, name: 'Norfolk Island' },
  { id: 32000174, name: 'North Korea' },
  { id: 32000141, name: 'North Macedonia' },
  { id: 32000175, name: 'Northern Mariana Islands' },
  { id: 32000176, name: 'Norway' },
  { id: 32000177, name: 'Oman' },
  { id: 32000178, name: 'Pakistan' },
  { id: 32000179, name: 'Palau' },
  { id: 32000180, name: 'Palestine' },
  { id: 32000181, name: 'Panama' },
  { id: 32000182, name: 'Papua New Guinea' },
  { id: 32000183, name: 'Paraguay' },
  { id: 32000184, name: 'Peru' },
  { id: 32000185, name: 'Philippines' },
  { id: 32000186, name: 'Pitcairn Islands' },
  { id: 32000187, name: 'Poland' },
  { id: 32000188, name: 'Portugal' },
  { id: 32000189, name: 'Puerto Rico' },
  { id: 32000190, name: 'Qatar' },
  { id: 32000192, name: 'Romania' },
  { id: 32000193, name: 'Russia' },
  { id: 32000194, name: 'Rwanda' },
  { id: 32000191, name: 'Réunion' },
  { id: 32000195, name: 'Saint Barthélemy' },
  { id: 32000196, name: 'Saint Helena' },
  { id: 32000197, name: 'Saint Kitts and Nevis' },
  { id: 32000198, name: 'Saint Lucia' },
  { id: 32000199, name: 'Saint Martin' },
  { id: 32000200, name: 'Saint Pierre and Miquelon' },
  { id: 32000201, name: 'Samoa' },
  { id: 32000202, name: 'San Marino' },
  { id: 32000204, name: 'Saudi Arabia' },
  { id: 32000205, name: 'Senegal' },
  { id: 32000206, name: 'Serbia' },
  { id: 32000207, name: 'Seychelles' },
  { id: 32000208, name: 'Sierra Leone' },
  { id: 32000209, name: 'Singapore' },
  { id: 32000210, name: 'Sint Maarten' },
  { id: 32000211, name: 'Slovakia' },
  { id: 32000212, name: 'Slovenia' },
  { id: 32000213, name: 'Solomon Islands' },
  { id: 32000214, name: 'Somalia' },
  { id: 32000215, name: 'South Africa' },
  { id: 32000216, name: 'South Korea' },
  { id: 32000217, name: 'South Sudan' },
  { id: 32000218, name: 'Spain' },
  { id: 32000219, name: 'Sri Lanka' },
  { id: 32000220, name: 'St. Vincent & Grenadines' },
  { id: 32000221, name: 'Sudan' },
  { id: 32000222, name: 'Suriname' },
  { id: 32000223, name: 'Svalbard and Jan Mayen' },
  { id: 32000224, name: 'Swaziland' },
  { id: 32000225, name: 'Sweden' },
  { id: 32000226, name: 'Switzerland' },
  { id: 32000227, name: 'Syria' },
  { id: 32000203, name: 'São Tomé and Príncipe' },
  { id: 32000228, name: 'Taiwan' },
  { id: 32000229, name: 'Tajikistan' },
  { id: 32000230, name: 'Tanzania' },
  { id: 32000231, name: 'Thailand' },
  { id: 32000232, name: 'Timor-Leste' },
  { id: 32000233, name: 'Togo' },
  { id: 32000234, name: 'Tokelau' },
  { id: 32000235, name: 'Tonga' },
  { id: 32000236, name: 'Trinidad and Tobago' },
  { id: 32000237, name: 'Tristan da Cunha' },
  { id: 32000238, name: 'Tunisia' },
  { id: 32000240, name: 'Turkmenistan' },
  { id: 32000241, name: 'Turks and Caicos Islands' },
  { id: 32000242, name: 'Tuvalu' },
  { id: 32000239, name: 'Türkiye' },
  { id: 32000243, name: 'U.S. Outlying Islands' },
  { id: 32000244, name: 'U.S. Virgin Islands' },
  { id: 32000245, name: 'Uganda' },
  { id: 32000246, name: 'Ukraine' },
  { id: 32000247, name: 'United Arab Emirates' },
  { id: 32000248, name: 'United Kingdom' },
  { id: 32000249, name: 'United States' },
  { id: 32000250, name: 'Uruguay' },
  { id: 32000251, name: 'Uzbekistan' },
  { id: 32000252, name: 'Vanuatu' },
  { id: 32000253, name: 'Vatican City' },
  { id: 32000254, name: 'Venezuela' },
  { id: 32000255, name: 'Vietnam' },
  { id: 32000256, name: 'Wallis and Futuna' },
  { id: 32000257, name: 'Western Sahara' },
  { id: 32000258, name: 'Yemen' },
  { id: 32000259, name: 'Zambia' },
  { id: 32000260, name: 'Zimbabwe' },
  { id: 32000008, name: 'Åland Islands' },
];
