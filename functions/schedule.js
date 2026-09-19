const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// A day is never shorter than this, so a tournament that starts at 11:30am
// doesn't get a day 1 that ends half an hour later.
const MIN_DAY_MS = 12 * 60 * 60 * 1000;
// Days end at 11:00 AM Central (= 12:00 PM Eastern), in a timezone that
// follows daylight saving. To change when days end, change these two.
const DAY_ENDS_TIME_ZONE = 'America/Chicago';
const DAY_ENDS_HOUR = 11;

// Offset of the day-end timezone from UTC at a given instant, in ms.
function zoneOffsetMs(utcMs) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: DAY_ENDS_TIME_ZONE, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, Number(p.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(utcMs / 1000) * 1000;
}

// The first day-end (11:00 AM Central) at or after the given instant.
function dayEndOnOrAfter(ms) {
  const localDate = new Date(ms + zoneOffsetMs(ms)); // its UTC fields read as Central wall-clock
  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const wallClockEnd = Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate() + dayOffset, DAY_ENDS_HOUR);
    // The offset can differ between the guess and the real instant (daylight
    // saving changes), so settle it with a second pass.
    let candidate = wallClockEnd - zoneOffsetMs(wallClockEnd);
    candidate = wallClockEnd - zoneOffsetMs(candidate);
    if (candidate >= ms) return candidate;
  }
  throw new Error('unreachable: no day-end within three days');
}

// When the day that opened at `openedAt` ends (and the next one opens): the
// first day-end at least MIN_DAY_MS later. For a day that itself opened at a
// day-end that's the next one - 24 hours, or 23/25 across a clock change.
function dayEndsAt(openedAt) {
  return dayEndOnOrAfter(openedAt + MIN_DAY_MS);
}

// When the next round should open. Days end at 11:00 AM Central, so a round
// that finishes early waits for that boundary (players see a countdown). A round
// that overran its own day's end just opens the next one right away; days then
// re-align from the following one, since each chains off the last.
function nextRoundUnlockAt(matches, now = Date.now()) {
  const latest = Math.max(0, ...matches.map((m) => m.unlockAt || 0));
  // Matches from before unlockAt existed have no anchor to chain from.
  if (!latest) return dayEndsAt(now);
  return Math.max(now, dayEndsAt(latest));
}

module.exports = { nextRoundUnlockAt, dayEndsAt, dayEndOnOrAfter, ONE_DAY_MS, MIN_DAY_MS };
