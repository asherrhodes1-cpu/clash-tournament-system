// Decides which attack reminders a match is due right now. Pure - takes the
// match and the clock, returns what to send - so the timing rules can be
// tested without Firebase or Discord. index.js does the actual sending and
// records each reminder on the match (`remindersSent`) so it goes out once.
const { dayEndsAt } = require('./schedule');

const HOUR_MS = 60 * 60 * 1000;

// Must match TIMEOUT_MS in index.js: the point after which a match is
// resolved against whoever didn't act.
const TIMEOUT_MS = 16 * HOUR_MS;
const DEADLINE_WARNING_MS = 4 * HOUR_MS;
// Once one player has readied up, the other has until their day ends to do the
// same - but never less than this after their opponent readied, so someone
// who readies up right at the end of the day (or after it, in a match that
// overran) can't have their opponent forfeited a moment later.
const READY_UP_MIN_WINDOW_MS = 6 * HOUR_MS;
const NUDGE_AFTER_UNLOCK_MS = 12 * HOUR_MS;
// The scheduler runs every 5 minutes, so a real unlock is noticed within one
// tick. The window only exists so a tournament that was already running when
// reminders shipped doesn't get a burst of "your match just unlocked" pings
// for rounds that unlocked days ago.
const UNLOCK_WINDOW_MS = 2 * HOUR_MS;

const IN_PLAY = ['scheduled', 'active', 'waiting_for_opponent'];

// When a player who hasn't readied up forfeits to an opponent who has: the end
// of the match's day (the same boundary the "next day unlocks in" countdown
// counts down to), or READY_UP_MIN_WINDOW_MS after the opponent readied,
// whichever is later. Matches from before days were tracked fall back to the
// older flat TIMEOUT_MS from when the opponent readied up.
function readyUpDeadline(match, readyTime) {
  if (!match.unlockAt) return readyTime + TIMEOUT_MS;
  return Math.max(dayEndsAt(match.unlockAt), readyTime + READY_UP_MIN_WINDOW_MS);
}

// Discord renders these in each reader's own timezone, so no formatting here.
function discordTime(ms, style = 'R') {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

// Returns [{ key, recipients: [username], text, linkLabel }] - `key` is what
// gets marked in `remindersSent`, `text` is sent as-is to each recipient and
// `linkLabel` is the prompt on the link back to the site.
function dueReminders(m, now) {
  if (!m.player1 || !m.player2 || m.player1 === 'BYE' || m.player2 === 'BYE') return [];
  const sent = m.remindersSent || {};
  const players = [
    { name: m.player1, opponent: m.player2, ready: !!m.player1Ready, voted: !!m.winner1Vote },
    { name: m.player2, opponent: m.player1, ready: !!m.player2Ready, voted: !!m.winner2Vote },
  ];
  const due = [];

  if (m.status === 'pending') {
    if (m.unlockAt != null && now < m.unlockAt) return [];

    const notReady = players.filter((p) => !p.ready);
    const readyPlayer = players.find((p) => p.ready);

    if (m.unlockAt != null && !sent.unlock && now - m.unlockAt < UNLOCK_WINDOW_MS && notReady.length) {
      due.push({
        key: 'unlock',
        linkLabel: 'Open Builder League to ready up',
        recipients: notReady.map((p) => p.name),
        text: `🔓 Your match is live: **${m.player1}** vs **${m.player2}**. Ready up in the app and get your attack in!`,
      });
    }

    const sinceUnlock = now - m.unlockAt;
    if (
      m.unlockAt != null && !sent.nudge && !readyPlayer && notReady.length &&
      sinceUnlock >= NUDGE_AFTER_UNLOCK_MS && sinceUnlock < 2 * NUDGE_AFTER_UNLOCK_MS
    ) {
      due.push({
        key: 'nudge',
        linkLabel: 'Open Builder League to ready up',
        recipients: notReady.map((p) => p.name),
        text: `⏳ Half your day is gone and neither of you has readied up for **${m.player1}** vs **${m.player2}**. Don't miss your attack!`,
      });
    }

    // Exactly one side ready: the other has until the day ends (see
    // readyUpDeadline) before forfeiting (see handleTimeouts).
    if (readyPlayer && notReady.length === 1) {
      const readyTime = readyPlayer.name === m.player1 ? m.player1ReadyTime : m.player2ReadyTime;
      const deadline = readyTime && readyUpDeadline(m, readyTime);
      if (deadline && !sent.deadline_ready && now >= deadline - DEADLINE_WARNING_MS && now < deadline) {
        due.push({
          key: 'deadline_ready',
          linkLabel: 'Open Builder League to ready up',
          recipients: [notReady[0].name],
          text: `⏰ **${readyPlayer.name}** is ready and waiting. Ready up in the app before ${discordTime(deadline)} or you forfeit the match.`,
        });
      }
    }
    return due;
  }

  // Both readied up: whoever hasn't reported by the deadline gets settled
  // against (opponent wins if only they reported, staff review if neither).
  if (IN_PLAY.includes(m.status) && m.scheduledStartTime) {
    const deadline = m.scheduledStartTime + TIMEOUT_MS;
    const unreported = players.filter((p) => !p.voted);
    if (!sent.deadline_report && unreported.length && now >= deadline - DEADLINE_WARNING_MS && now < deadline) {
      due.push({
        key: 'deadline_report',
        linkLabel: 'Open Builder League to report your result',
        recipients: unreported.map((p) => p.name),
        text: `⏰ Report your result for **${m.player1}** vs **${m.player2}** before ${discordTime(deadline)}, or the match gets settled without you.`,
      });
    }
  }
  return due;
}

module.exports = { dueReminders, discordTime, readyUpDeadline, TIMEOUT_MS, READY_UP_MIN_WINDOW_MS };
