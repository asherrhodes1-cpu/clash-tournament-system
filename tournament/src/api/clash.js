import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const fetchClashPlayerCallable = httpsCallable(functions, 'fetchClashPlayer');
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

export async function verifyClashAccount({ clashTag, apiToken }) {
  const { data } = await verifyClashAccountCallable({ clashTag, apiToken });
  return data;
}
