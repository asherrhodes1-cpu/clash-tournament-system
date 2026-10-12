import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { overlayStates, soundLibrary, soundMatch } from '../overlays/overlayState';

// live/overlays holds the match the stream overlays are showing. Like the
// rest of `live`, anyone can read it (the overlays run in OBS without an
// account) and only staff can write it.
//
// `match` is the match on screen as staff entered it and `library` the
// players and matches they have prepared. Beside them, under each overlay
// page's name, are the settings that page takes, which is what the pages
// under public/overlays read.
const overlaysRef = doc(db, 'live', 'overlays');

// Calls back with what is saved - { match, library } - put right if anything
// is missing, and again whenever anyone changes it.
export function subscribeToOverlays(onChange, onError) {
  return onSnapshot(overlaysRef, (snapshot) => {
    const saved = snapshot.data();
    onChange({ match: soundMatch(saved?.match), library: soundLibrary(saved?.library) });
  }, onError);
}

// Saves the match on screen and the prepared players and matches together,
// with each overlay page's settings worked out from the match.
export function saveOverlays({ match, library }) {
  const sound = soundMatch(match);
  return setDoc(overlaysRef, { match: sound, library: soundLibrary(library), ...overlayStates(sound) });
}
