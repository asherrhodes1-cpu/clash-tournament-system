import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const fetchClashPlayerCallable = httpsCallable(functions, 'fetchClashPlayer');
const fetchLocalRankingCallable = httpsCallable(functions, 'fetchLocalRanking');
const verifyClashAccountCallable = httpsCallable(functions, 'verifyClashAccount');

export async function fetchClashPlayerData(playerTag) {
  try {
    const { data } = await fetchClashPlayerCallable({ playerTag });
    if (!data.found) return null;
    const { found, ...stats } = data;
    return stats;
  } catch (err) {
    console.error('Error fetching player data:', err);
    return null;
  }
}

export async function fetchLocalRanking(playerTag, locationId) {
  try {
    const { data } = await fetchLocalRankingCallable({ playerTag, locationId });
    if (!data.found) return null;
    return { rank: data.rank, checkedTop: data.checkedTop };
  } catch (err) {
    console.error('Error fetching local ranking:', err);
    return null;
  }
}

export async function verifyClashAccount({ clashTag, apiToken }) {
  const { data } = await verifyClashAccountCallable({ clashTag, apiToken });
  return data;
}
