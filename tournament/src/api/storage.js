import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadMatchScreenshot(tournamentId, matchId, playerSlot, file) {
  const path = `matchScreenshots/${tournamentId}/${matchId}/${playerSlot}_${Date.now()}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return path;
}

export function getScreenshotUrl(path) {
  if (!path) return Promise.resolve(null);
  return getDownloadURL(ref(storage, path));
}
