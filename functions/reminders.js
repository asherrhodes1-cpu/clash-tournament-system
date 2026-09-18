// Decides which attack reminders a match is due right now. Pure - takes the
// match and the clock, returns what to send - so the timing rules can be
// tested without Firebase or Discord. index.js does the actual sending and
// records each reminder on the match (`remindersSent`) so it goes out once.
const HOUR_MS = 60 * 60 * 1000;

// Must match TIMEOUT_MS in index.js: the point after which a match is
// resolved against whoever didn't act.
const TIMEOUT_MS = 16 * HOUR_MS;
const DEADLINE_WARNING_MS = 4 * HOUR_MS;
const NUDGE_AFTER_UNLOCK_MS = 12 * HOUR_MS;
// The scheduler runs every 5 minutes, so a real unlock is noticed within one
// tick. The window only exists so a tournament that was already running when
// reminders shipped doesn't get a burst of "your match just unlocked" pings
// for rounds that unlocked days ago.
const UNLOCK_WINDOW_MS = 2 * HOUR_MS;

const IN_PLAY = ['scheduled', 'active', 'waiting_for_opponent'];

// Discord renders these in each reader's own timezone, so no formatting here.
function discordTime(ms, style = 'R') {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

// Returns [{ key, recipients: [username], text }] - `key` is what gets marked
// in `remindersSent`, `text` is sent as-is to each recipient.
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
        recipients: notReady.map((p) => p.name),
        text: `⏳ Half your day is gone and neither of you has readied up for **${m.player1}** vs **${m.player2}**. Don't miss your attack!`,
      });
    }

    // Exactly one side ready: the other has TIMEOUT_MS from that moment
    // before forfeiting (see handleTimeouts).
    if (readyPlayer && notReady.length === 1) {
      const readyTime = readyPlayer.name === m.player1 ? m.player1ReadyTime : m.player2ReadyTime;
      const deadline = readyTime && readyTime + TIMEOUT_MS;
      if (deadline && !sent.deadline_ready && now >= deadline - DEADLINE_WARNING_MS && now < deadline) {
        due.push({
          key: 'deadline_ready',
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
        recipients: unreported.map((p) => p.name),
        text: `⏰ Report your result for **${m.player1}** vs **${m.player2}** before ${discordTime(deadline)}, or the match gets settled without you.`,
      });
    }
  }
  return due;
}

module.exports = { dueReminders, discordTime, TIMEOUT_MS };
