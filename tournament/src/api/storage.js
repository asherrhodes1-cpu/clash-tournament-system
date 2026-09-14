import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadMatchScreenshots(tournamentId, matchId, playerSlot, files) {
  const paths = [];
  for (let i = 0; i < files.length; i++) {
    const path = `matchScreenshots/${tournamentId}/${matchId}/${playerSlot}_${Date.now()}_${i}`;
    await uploadBytes(ref(storage, path), files[i]);
    paths.push(path);
  }
  return paths;
}

export function getScreenshotUrl(path) {
  if (!path) return Promise.resolve(null);
  return getDownloadURL(ref(storage, path));
}

export async function uploadProfilePicture(uid, file) {
  const path = `profilePictures/${uid}/avatar_${Date.now()}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return path;
}

export function getProfilePictureUrl(path) {
  if (!path) return Promise.resolve(null);
  return getDownloadURL(ref(storage, path));
}

export async function uploadTournamentBanner(tournamentId, file) {
  const path = `tournamentBanners/${tournamentId}/banner_${Date.now()}`;
  await uploadBytes(ref(storage, path), file);
  return path;
}

export function getTournamentBannerUrl(path) {
  if (!path) return Promise.resolve(null);
  return getDownloadURL(ref(storage, path));
}
