import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Users, Trophy, LogOut, Menu, X, Send, CheckCircle, AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { signUp, logIn, logOut, subscribeToAuthState, adminResetPassword } from './api/auth';
import {
  subscribeToTournaments,
  subscribeToMatches,
  subscribeToUserMatches,
  createTournament,
  updateTournamentBanner,
  updateTournamentBannerPosition,
  updateTournamentFormat,
  updateTournamentSignupDeadline,
  joinTournament,
  deleteTournament,
  removePlayer,
  reinstatePlayer,
  changeMatchWinner,
  reopenMatch,
  startTournament,
  playerReady,
  reportMatch,
  resolveDispute,
  subscribeToMatchMessages,
  sendMatchMessage,
} from './api/tournaments';
import { subscribeToFlags, createFlag, updateFlagStatus, addFlagResponse } from './api/flags';
import {
  uploadMatchScreenshots,
  getScreenshotUrl,
  uploadProfilePicture,
  getProfilePictureUrl,
  uploadTournamentBanner,
  getTournamentBannerUrl,
} from './api/storage';
import { subscribeToUserProfile, updateProfile, createDiscordLinkCode } from './api/users';
import { dispenseRewards, subscribeToMyReward, subscribeToRewards } from './api/rewards';
import { subscribeToMatchPredictions, submitPrediction, subscribeToPredictionScores } from './api/predictions';
import { verifyClashAccount, fetchClashPlayerData, fetchLocalRanking } from './api/clash';
import { getTimeRemainingDisplay, getRoundUnlockTime, formatCountdown, estimateTournamentDays, getGuaranteedDays, dayEndsAt, matchPosition, winChance, trophiesFor, rankPredictionScores, getPlayersRemaining, rankFinishers, COUNTRIES, getLeagueIconUrl } from './utils';

// ============================================================================
// FLAG REPORT MODAL COMPONENT
// ============================================================================
function FlagReportModal({ onClose, onSubmit, relatedToMatch = null, relatedToTournament = null }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [priority, setPriority] = useState('normal');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    onSubmit({
      title,
      description,
      category,
      priority,
      relatedToMatch,
      relatedToTournament,
    });

    setTitle('');
    setDescription('');
    setCategory('other');
    setPriority('normal');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Report Issue to Staff</h2>

        {error && (
          <div className="mb-4 p-3 bg-neutral-800 border-2 border-white rounded text-white text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
              placeholder="Brief description of issue"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
            >
              <option value="other">Other</option>
              <option value="rules">Rules Question</option>
              <option value="cheating">Suspected Cheating</option>
              <option value="bug">Bug/Technical Issue</option>
              <option value="dispute">Match Dispute</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
              placeholder="Explain the issue in detail..."
              rows="4"
              required
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold py-2 px-4 rounded transition"
            >
              Submit Report
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// The actual gameplay ruleset for a single match - shared between the
// one-time join walkthrough and the always-available reference on the
// match page itself, since players will want to check these mid-match.
const MATCH_FORMAT_RULES = [
  { icon: '🏰', text: 'Join a clan together with your opponent (any clan works) so you can attack each other.' },
  { icon: '⚔️', text: 'Play Best of 3: each round, both players attack the other\'s base once. Whoever gets more stars wins the round (higher % breaks a stars tie). First to win 2 rounds wins the match.' },
  { icon: '🔥', text: 'Tied after 3 rounds? Sudden death: play another round. The first player to fail (0 stars) loses - unless you both fail in the same round, in which case whoever has the higher stars/% in that round wins.' },
  { icon: '⚖️', text: 'Both players must complete the same number of attacks before a winner is declared. If your opponent fails on attack 4, you can\'t win until you\'ve also done a 4th attack with a better result.' },
];

const GENERAL_RULES = [
  { icon: '🗓️', text: 'Each bracket round unlocks on a fixed "Day" that ends at 12:00 PM Central Time - even if your match finishes early, the next bracket round won\'t start until its Day arrives. This keeps everyone on the same pace.' },
  { icon: '✅', text: 'Ready up before your Day ends. If your opponent has readied up and you haven\'t by the end of the Day (12:00 PM Central), you forfeit the match.' },
  { icon: '💬', text: 'Once your match is live, use "Coordinate Match" to chat with your opponent and agree on timing.' },
  { icon: '📸', text: 'Report the result with at least one proof screenshot and who won. Both players must agree, or staff will step in to resolve a dispute.' },
  { icon: '🚫', text: 'Submitting a false result gets you removed from the tournament and banned from future ones - so keep it honest.' },
];

// Who has called the most matches right. Totals come from the scoring
// function, one row per player per tournament; here they're added up for a
// chosen tournament or across all of them.
function LeaderboardPage({ tournaments, user, onViewProfile }) {
  const [scores, setScores] = useState(null);
  const [scope, setScope] = useState('all');

  useEffect(() => subscribeToPredictionScores(setScores), []);

  const ranked = rankPredictionScores(scores || [], scope);
  const scoredTournaments = tournaments.filter((t) => (scores || []).some((r) => r.tournamentId === t.id));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold">🔮 Prediction Leaderboard</h1>
        <p className="text-sm text-gray-400">
          Pick who you think will win any match you're not playing in, before it starts. Every correct pick is a point.
        </p>
      </div>

      {scoredTournaments.length > 0 && (
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
        >
          <option value="all">All tournaments</option>
          {scoredTournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}

      <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
        {scores === null ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : ranked.length === 0 ? (
          <p className="text-gray-400 text-sm">
            No scored predictions yet. Open a match's Details, pick a winner before it starts, and you'll show up here once it's decided.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-4 text-xs text-gray-400 uppercase tracking-wide">
              <span className="w-8">#</span>
              <span className="flex-1">Player</span>
              <span className="w-16 text-right">Correct</span>
              <span className="w-16 text-right">Votes</span>
              <span className="w-16 text-right">Accuracy</span>
            </div>
            {ranked.map((r, idx) => (
              <div
                key={r.username}
                className={`flex items-center gap-3 rounded px-4 py-2 ${r.username === user.username ? 'bg-amber-200/10 border border-amber-400/50' : 'bg-gray-700'}`}
              >
                <span className="w-8 text-gray-300 flex items-center">
                  {idx < 3 && medalFor(idx + 1) ? <img src={medalFor(idx + 1)} alt="" className="w-5 h-5 object-contain" /> : idx + 1}
                </span>
                <button onClick={() => onViewProfile(r.username)} className="flex-1 text-left font-bold hover:underline truncate">
                  {r.username}
                </button>
                <span className="w-16 text-right font-bold text-green-400">{r.correct}</span>
                <span className="w-16 text-right text-gray-300">{r.total}</span>
                <span className="w-16 text-right text-gray-300">{Math.round((r.correct / r.total) * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RulesPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h1 className="text-2xl font-bold mb-1">📋 Tournament Rules</h1>
        <p className="text-gray-400 text-sm mb-5">Match format</p>
        <div className="space-y-3">
          {MATCH_FORMAT_RULES.map((step, idx) => (
            <div key={idx} className="flex gap-3 text-sm">
              <span className="text-xl shrink-0">{step.icon}</span>
              <p className="text-gray-300">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <p className="text-gray-400 text-sm mb-5">How the tournament runs</p>
        <div className="space-y-3">
          {GENERAL_RULES.map((step, idx) => (
            <div key={idx} className="flex gap-3 text-sm">
              <span className="text-xl shrink-0">{step.icon}</span>
              <p className="text-gray-300">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TournamentWalkthroughModal({ onClose }) {
  const steps = [...MATCH_FORMAT_RULES, ...GENERAL_RULES];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-1">🎉 You're In!</h2>
        <p className="text-gray-400 text-sm mb-5">Here's how the tournament works:</p>
        <div className="space-y-3 mb-6">
          {steps.map((step, idx) => (
            <div key={idx} className="flex gap-3 text-sm">
              <span className="text-xl shrink-0">{step.icon}</span>
              <p className="text-gray-300">{step.text}</p>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold py-2 px-4 rounded transition"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// Shown right after an account is created. Linking needs the player to be
// logged in (the code is tied to their account), so it can't be part of the
// signup form itself - this is the first moment it's possible. Skipping is
// allowed but has to be confirmed, since without Discord a player gets no
// reminders and can miss the window to play their match.
const DISCORD_INVITE_URL = process.env.REACT_APP_DISCORD_INVITE_URL || 'https://discord.gg/VXktVUdZS3';

// Discord's own blurple, so it reads as "the Discord button" at a glance and
// stands out from the site's gold/white buttons.
function JoinDiscordButton({ className = '', children = 'Join our Discord' }) {
  return (
    <a
      href={DISCORD_INVITE_URL}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center gap-1.5 bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold rounded transition whitespace-nowrap ${className}`}
    >
      <MessageCircle className="w-4 h-4" />
      {children}
    </a>
  );
}

function DiscordSetupModal({ user, onClose, joining = false, onCancel }) {
  const [linkCode, setLinkCode] = useState(null);
  const [loadingCode, setLoadingCode] = useState(true);
  const [codeError, setCodeError] = useState('');
  const [confirmingSkip, setConfirmingSkip] = useState(false);

  const fetchCode = async () => {
    setLoadingCode(true);
    setCodeError('');
    try {
      setLinkCode(await createDiscordLinkCode());
    } catch (err) {
      setCodeError(err.message || 'Couldn\'t get a link code. Try again.');
    } finally {
      setLoadingCode(false);
    }
  };

  useEffect(() => {
    fetchCode();
  }, []);

  const linked = !!user.discordId;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {linked ? (
          <>
            <h2 className="text-2xl font-bold mb-2">✅ Discord linked</h2>
            <p className="text-gray-300 text-sm mb-5">
              The bot will DM you when your match opens and before a deadline, so you don't miss your attack.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold py-2 px-4 rounded transition"
            >
              {joining ? 'Continue and join' : 'Continue'}
            </button>
          </>
        ) : confirmingSkip ? (
          <>
            <h2 className="text-2xl font-bold mb-2">Are you sure?</h2>
            <div className="p-3 mb-5 rounded border border-amber-400/60 bg-amber-200/10 text-amber-200 text-sm">
              Without Discord you won't get match reminders. If you miss your match, you may be eliminated.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingSkip(false)}
                className="flex-1 bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold py-2 px-4 rounded transition"
              >
                Go back
              </button>
              <button
                onClick={onClose}
                className="flex-1 border border-gray-600 hover:border-white py-2 px-4 rounded transition"
              >
                Skip anyway
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-1">💬 Connect Discord</h2>
            <p className="text-gray-300 text-sm mb-4">
              {joining
                ? 'Linking Discord is required to join tournaments, so the bot can DM you when your matches open and before you\'d run out of time.'
                : 'Get a DM when your match opens and before you\'d run out of time, so you never miss an attack.'}
            </p>
            <ol className="text-sm text-gray-300 space-y-3 mb-5 list-decimal list-inside">
              <li>
                Join our Discord server.
                <div className="mt-2">
                  <JoinDiscordButton className="px-4 py-2" />
                </div>
              </li>
              <li>
                Run this in any channel:
                <div className="mt-2 font-mono text-lg font-bold text-white bg-gray-900 rounded px-3 py-2 select-all">
                  {loadingCode ? 'Getting your code...' : linkCode ? `/link code:${linkCode.code}` : '—'}
                </div>
              </li>
            </ol>
            {codeError && <p className="text-sm text-red-400 mb-3">{codeError}</p>}
            <p className="text-xs text-gray-400 mb-4">
              This window updates by itself once it's linked. The code works once and expires in 10 minutes.{' '}
              <button onClick={fetchCode} disabled={loadingCode} className="underline hover:text-white disabled:opacity-50">
                Get a new code
              </button>
            </p>
            {joining ? (
              <button
                onClick={onCancel}
                className="w-full border border-gray-600 hover:border-white py-2 px-4 rounded transition"
              >
                Cancel, don't join
              </button>
            ) : (
              <button
                onClick={() => setConfirmingSkip(true)}
                className="w-full border border-gray-600 hover:border-white py-2 px-4 rounded transition"
              >
                Skip for now
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// STAFF DASHBOARD COMPONENT
// ============================================================================
function StaffDashboard({ flags, onUpdateFlagStatus, onAddResponse }) {
  const [selectedFlagId, setSelectedFlagId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [responseText, setResponseText] = useState('');
  const [resetUsername, setResetUsername] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const selectedFlag = flags.find((f) => f.id === selectedFlagId) || null;

  const filteredFlags = flags.filter(flag =>
    filterStatus === 'all' ? true : flag.status === filterStatus
  );

  const sortedFlags = [...filteredFlags].sort((a, b) => {
    if (sortBy === 'priority') {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    } else if (sortBy === 'date') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return 0;
  });

  const handleStatusChange = (flagId, newStatus) => {
    onUpdateFlagStatus(flagId, newStatus);
  };

  const handleAddResponse = (flagId) => {
    if (responseText.trim()) {
      onAddResponse(flagId, responseText);
      setResponseText('');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetMessage('');

    if (!resetUsername.trim() || resetPassword.length < 6) {
      setResetMessage('Enter a username and a 6+ character password');
      return;
    }

    setResetSubmitting(true);
    try {
      await adminResetPassword({ username: resetUsername.trim(), newPassword: resetPassword });
      setResetMessage(`Password updated for ${resetUsername.trim()}`);
      setResetUsername('');
      setResetPassword('');
    } catch (err) {
      setResetMessage(err.message || 'Failed to reset password');
    } finally {
      setResetSubmitting(false);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-white text-black border border-white';
      case 'high':
        return 'bg-neutral-800 text-white border-2 border-white';
      case 'normal':
        return 'bg-neutral-800 text-white border border-neutral-600';
      case 'low':
        return 'bg-neutral-800 text-neutral-400 border border-neutral-700';
      default:
        return 'bg-gray-700 text-gray-200';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return 'bg-neutral-800 border-2 border-white';
      case 'in_progress':
        return 'bg-neutral-700 border border-white';
      case 'resolved':
        return 'bg-neutral-800 border border-neutral-700';
      default:
        return 'bg-gray-600';
    }
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'rules':
        return '📋';
      case 'cheating':
        return '⚠️';
      case 'bug':
        return '🐛';
      case 'dispute':
        return '⚔️';
      default:
        return '📌';
    }
  };

  if (selectedFlag) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedFlagId(null)}
          className="text-white hover:text-neutral-300 text-sm"
        >
          ← Back to Flags
        </button>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{selectedFlag.title}</h1>
              <div className="flex gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded text-sm font-medium ${getPriorityColor(selectedFlag.priority)}`}>
                  {selectedFlag.priority.toUpperCase()}
                </span>
                <span className={`px-3 py-1 rounded text-sm font-medium text-white ${getStatusColor(selectedFlag.status)}`}>
                  {selectedFlag.status.replace('_', ' ').toUpperCase()}
                </span>
                <span className="px-3 py-1 rounded text-sm bg-gray-700">
                  {getCategoryIcon(selectedFlag.category)} {selectedFlag.category}
                </span>
              </div>
            </div>
            <div className="text-sm text-gray-400">
              <p>Reported by: {selectedFlag.createdBy}</p>
              <p>{new Date(selectedFlag.createdAt).toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-gray-700 rounded p-4 mb-6">
            <p className="text-gray-200">{selectedFlag.description}</p>
          </div>

          <div className="mb-6">
            <h3 className="font-bold text-lg mb-3">Staff Responses ({selectedFlag.responses?.length || 0})</h3>
            <div className="space-y-3 mb-4 bg-gray-700 rounded p-4 max-h-64 overflow-y-auto">
              {selectedFlag.responses?.length > 0 ? (
                selectedFlag.responses.map((response, idx) => (
                  <div key={idx} className="border-b border-gray-600 pb-3 last:border-0">
                    <div className="flex justify-between">
                      <span className="font-bold text-white">{response.sender}</span>
                      <span className="text-xs text-gray-400">{new Date(response.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-300 mt-1">{response.message}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">No responses yet</p>
              )}
            </div>

            {selectedFlag.status !== 'resolved' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddResponse(selectedFlag.id)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
                  placeholder="Add staff response..."
                />
                <button
                  onClick={() => handleAddResponse(selectedFlag.id)}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold px-4 py-2 rounded transition"
                >
                  Send
                </button>
              </div>
            )}
          </div>

          {selectedFlag.status !== 'resolved' && (
            <div className="border-t border-gray-600 pt-6">
              <p className="text-sm text-gray-400 mb-3">Update Status:</p>
              <div className="flex gap-2 flex-wrap">
                {selectedFlag.status !== 'in_progress' && (
                  <button
                    onClick={() => handleStatusChange(selectedFlag.id, 'in_progress')}
                    className="bg-neutral-700 hover:bg-neutral-600 px-4 py-2 rounded transition"
                  >
                    Mark In Progress
                  </button>
                )}
                {selectedFlag.status !== 'open' && (
                  <button
                    onClick={() => handleStatusChange(selectedFlag.id, 'open')}
                    className="border-2 border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded transition"
                  >
                    Reopen
                  </button>
                )}
                <button
                  onClick={() => handleStatusChange(selectedFlag.id, 'resolved')}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-4 py-2 rounded transition"
                >
                  Mark Resolved
                </button>
              </div>
            </div>
          )}

          {selectedFlag.resolvedAt && (
            <div className="border-t border-gray-600 pt-6 mt-6 bg-neutral-800 border border-neutral-700 rounded p-4">
              <p className="text-white text-sm">
                ✓ Resolved by {selectedFlag.resolvedBy} on {new Date(selectedFlag.resolvedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h1 className="text-3xl font-bold mb-4">Staff Dashboard</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-700 rounded p-4">
            <p className="text-sm text-gray-400">Total Flags</p>
            <p className="text-2xl font-bold">{flags.length}</p>
          </div>
          <div className="bg-neutral-800 border-2 border-white rounded p-4">
            <p className="text-sm text-neutral-300">Open</p>
            <p className="text-2xl font-bold">{flags.filter(f => f.status === 'open').length}</p>
          </div>
          <div className="bg-neutral-800 border border-white rounded p-4">
            <p className="text-sm text-neutral-300">In Progress</p>
            <p className="text-2xl font-bold">{flags.filter(f => f.status === 'in_progress').length}</p>
          </div>
          <div className="bg-neutral-800 border border-neutral-700 rounded p-4">
            <p className="text-sm text-neutral-400">Resolved</p>
            <p className="text-2xl font-bold">{flags.filter(f => f.status === 'resolved').length}</p>
          </div>
        </div>

        <div className="flex gap-4 mb-6 flex-wrap">
          <div>
            <label className="text-sm text-gray-400 block mb-2">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
            >
              <option value="all">All Flags</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-2">Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
            >
              <option value="priority">Priority</option>
              <option value="date">Most Recent</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-4">Reset a Player's Password</h2>
        <form onSubmit={handleResetPassword} className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              type="text"
              value={resetUsername}
              onChange={(e) => setResetUsername(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
              placeholder="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">New Password</label>
            <input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
              placeholder="6+ characters"
            />
          </div>
          <button
            type="submit"
            disabled={resetSubmitting}
            className="border-2 border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded transition disabled:opacity-50"
          >
            {resetSubmitting ? 'Updating...' : 'Reset Password'}
          </button>
        </form>
        {resetMessage && <p className="text-sm text-neutral-300 mt-3">{resetMessage}</p>}
      </div>

      <div className="space-y-3">
        {sortedFlags.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 text-center text-gray-400">
            No flags {filterStatus !== 'all' ? `with status "${filterStatus}"` : ''}
          </div>
        ) : (
          sortedFlags.map(flag => (
            <button
              key={flag.id}
              onClick={() => setSelectedFlagId(flag.id)}
              className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 p-4 transition"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{getCategoryIcon(flag.category)}</span>
                    <h3 className="font-bold text-lg">{flag.title}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(flag.priority)}`}>
                      {flag.priority}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm mb-2">{flag.description.substring(0, 100)}...</p>
                  <div className="flex gap-2 items-center text-xs text-gray-500">
                    <span>by {flag.createdBy}</span>
                    <span>•</span>
                    <span>{new Date(flag.createdAt).toLocaleString()}</span>
                    {flag.responses?.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{flag.responses.length} responses</span>
                      </>
                    )}
                  </div>
                </div>
                <span className={`px-3 py-1 rounded text-sm font-medium text-white ${getStatusColor(flag.status)} ml-4`}>
                  {flag.status.replace('_', ' ')}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
export default function TournamentApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [currentPage, setCurrentPage] = useState('landing');
  const [tournaments, setTournaments] = useState([]);
  const [matches, setMatches] = useState([]);
  const [userMatches, setUserMatches] = useState([]);
  const [flags, setFlags] = useState([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState(null);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [selectedProfileUsername, setSelectedProfileUsername] = useState(null);
  const [profileNavStack, setProfileNavStack] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showDiscordSetup, setShowDiscordSetup] = useState(false);
  const [pendingJoinId, setPendingJoinId] = useState(null);
  const [flagRelatedMatch, setFlagRelatedMatch] = useState(null);

  // The nav menu is a dropdown, so it closes on an outside click or Escape.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onPointerDown = (e) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) setMobileMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((user) => {
      setCurrentUser(user);
      setAuthInitializing(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (currentUser && (currentPage === 'landing' || currentPage === 'login')) {
      setCurrentPage('dashboard');
    }
    if (!currentUser && !authInitializing && currentPage !== 'landing' && currentPage !== 'login') {
      setCurrentPage('landing');
    }
  }, [currentUser, authInitializing, currentPage]);

  useEffect(() => {
    if (!currentUser) {
      setTournaments([]);
      return;
    }
    return subscribeToTournaments(setTournaments);
  }, [currentUser?.username]);

  useEffect(() => {
    if (!currentUser) {
      setFlags([]);
      return;
    }
    return subscribeToFlags(setFlags);
  }, [currentUser?.username]);

  useEffect(() => {
    if (!currentUser) {
      setUserMatches([]);
      return;
    }
    return subscribeToUserMatches(currentUser.username, setUserMatches);
  }, [currentUser?.username]);

  useEffect(() => {
    if (!selectedTournamentId || !currentUser) {
      setMatches([]);
      return;
    }
    return subscribeToMatches(selectedTournamentId, setMatches);
  }, [selectedTournamentId, currentUser?.username]);

  const handleLogout = async () => {
    await logOut();
    setMobileMenuOpen(false);
  };

  // Snapshots enough of the current view (page + whatever it was showing) so
  // "Back" can restore it exactly, even through a chain of profile-to-profile
  // clicks - each click pushes one more snapshot onto the stack.
  const viewProfile = (username) => {
    setProfileNavStack((prev) => [
      ...prev,
      { page: currentPage, tournamentId: selectedTournamentId, matchId: selectedMatchId, profileUsername: selectedProfileUsername },
    ]);
    setSelectedProfileUsername(username);
    setCurrentPage('profile');
  };

  const handleBackFromProfile = () => {
    setProfileNavStack((prev) => {
      if (prev.length === 0) {
        setCurrentPage('dashboard');
        return prev;
      }
      const last = prev[prev.length - 1];
      setCurrentPage(last.page);
      setSelectedTournamentId(last.tournamentId);
      setSelectedMatchId(last.matchId);
      setSelectedProfileUsername(last.profileUsername);
      return prev.slice(0, -1);
    });
  };

  const handleCreateTournament = async (tournamentData, bannerFile) => {
    const id = await createTournament(tournamentData, currentUser.username);
    if (bannerFile) {
      const path = await uploadTournamentBanner(id, bannerFile);
      await updateTournamentBanner(id, path);
    }
    setCurrentPage('dashboard');
  };

  const handleUpdateBanner = async (tournamentId, bannerFile) => {
    const path = await uploadTournamentBanner(tournamentId, bannerFile);
    await updateTournamentBanner(tournamentId, path);
  };

  const handleUpdateBannerPosition = async (tournamentId, position) => {
    await updateTournamentBannerPosition(tournamentId, position);
  };

  const handleUpdateFormat = async (tournamentId, format) => {
    await updateTournamentFormat(tournamentId, format);
  };

  const handleUpdateSignupDeadline = async (tournamentId, deadline) => {
    await updateTournamentSignupDeadline(tournamentId, deadline);
  };

  const joinNow = async (tournamentId) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;
    try {
      await joinTournament(tournament, currentUser);
      setShowWalkthrough(true);
    } catch (err) {
      alert(err.message);
    }
  };

  // A player without Discord linked gets no match reminders, so joining
  // starts with the Discord prompt (link it, or skip and join anyway).
  const handleJoinTournament = async (tournamentId) => {
    if (!currentUser.discordId) {
      setPendingJoinId(tournamentId);
      return;
    }
    await joinNow(tournamentId);
  };

  const handleDeleteTournament = async (tournamentId) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    const warning = tournament?.status === 'completed'
      ? 'Delete this tournament? This also removes the placement badges/achievements it gave players. This cannot be undone.'
      : 'Are you sure you want to delete this tournament? This cannot be undone.';
    if (window.confirm(warning)) {
      await deleteTournament(tournamentId);
      setCurrentPage('dashboard');
    }
  };

  // Staff fixing a result they decided by hand. The api functions refuse
  // (with a reason) when the wrong winner has already moved too far along.
  const handleChangeWinner = async (matchId, winner) => {
    const tournament = tournaments.find(t => t.id === selectedTournamentId);
    if (!tournament) return;
    try {
      await changeMatchWinner(tournament, matches, matchId, winner, currentUser.username);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReopenMatch = async (matchId) => {
    const tournament = tournaments.find(t => t.id === selectedTournamentId);
    if (!tournament) return;
    try {
      await reopenMatch(tournament, matches, matchId);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReinstatePlayer = async (tournamentId, username) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;
    try {
      await reinstatePlayer(tournament, matches, username);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemovePlayer = async (tournamentId, username) => {
    if (!window.confirm(`Remove ${username} from this tournament? Their opponent will be given the win. You can reinstate them afterwards, but only until the next round is created.`)) {
      return;
    }
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;
    await removePlayer(tournament, matches, username, currentUser.username);
  };

  const handleStartTournament = async (tournamentId) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;
    try {
      await startTournament(tournament);
    } catch (err) {
      alert(`Failed to start tournament: ${err.message}`);
    }
  };

  const handlePlayerReady = async (matchId) => {
    await playerReady(selectedTournamentId, matchId, currentUser.username);
  };

  const handleReportMatch = async (matchId, selectedWinner, screenshotFiles) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    const isPlayer1 = currentUser.username === match.player1;
    const alreadyVoted = isPlayer1 ? match.winner1Vote : match.winner2Vote;
    if (alreadyVoted) {
      throw new Error('You already submitted a result for this match.');
    }
    const screenshotPaths = await uploadMatchScreenshots(
      selectedTournamentId,
      matchId,
      isPlayer1 ? 'player1' : 'player2',
      screenshotFiles
    );
    await reportMatch(selectedTournamentId, matchId, currentUser.username, selectedWinner, screenshotPaths);
  };

  const handleResolveDispute = async (matchId, winner) => {
    try {
      await resolveDispute(selectedTournamentId, matchId, winner, currentUser.username);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateFlag = async (flagData) => {
    await createFlag(flagData, currentUser.username);
  };

  const handleUpdateFlagStatus = async (flagId, status, staffResponse = null) => {
    await updateFlagStatus(flagId, status, currentUser.username, staffResponse);
  };

  const handleAddFlagResponse = async (flagId, message) => {
    await addFlagResponse(flagId, message, currentUser.username);
  };

  if (authInitializing) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-neutral-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {currentUser && (
        <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16 gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <img src="/badges/rainbow.png" alt="Rainbow League" className="w-9 h-9 object-contain" />
                <span className="font-display font-bold text-lg tracking-tight whitespace-nowrap hidden sm:inline">
                  RAINBOW <span className="bg-gradient-to-r from-amber-200 to-yellow-500 bg-clip-text text-transparent">LEAGUE</span>
                </span>
              </div>

              <div className={`${currentUser.isStaff ? 'hidden xl:flex' : 'hidden lg:flex'} items-center gap-3 text-sm whitespace-nowrap`}>
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className="hover:text-neutral-300 transition"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => viewProfile(currentUser.username)}
                  className="hover:text-neutral-300 transition"
                >
                  Profile
                </button>
                <button
                  onClick={() => setCurrentPage('rules')}
                  className="hover:text-neutral-300 transition"
                >
                  Rules
                </button>
                <button
                  onClick={() => setCurrentPage('leaderboard')}
                  className="hover:text-neutral-300 transition"
                >
                  Leaderboard
                </button>
                {currentUser.isStaff && (
                  <button
                    onClick={() => setCurrentPage('create')}
                    className="hover:text-neutral-300 transition"
                    title="Create Tournament"
                  >
                    Create
                  </button>
                )}
                {currentUser.isStaff && (
                  <button
                    onClick={() => setCurrentPage('staff_dashboard')}
                    className="border border-white text-white hover:bg-white hover:text-black px-3 py-1 rounded text-sm transition"
                  >
                    Staff Dashboard
                  </button>
                )}
                <JoinDiscordButton className="px-2.5 py-1.5">Discord</JoinDiscordButton>
                <div className="text-sm text-gray-400 max-w-[11rem]">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate">{currentUser.username}</span>
                    {currentUser.isStaff && <span className="text-white font-bold shrink-0">[STAFF]</span>}
                  </div>
                  <div className="text-xs text-gray-500">{currentUser.clashTag}</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="border-2 border-white text-white hover:bg-white hover:text-black px-3 py-1.5 rounded transition"
                >
                  Logout
                </button>
              </div>

              <div ref={mobileMenuRef} className={`relative ${currentUser.isStaff ? 'xl:hidden' : 'lg:hidden'}`}>
                  <button
                    aria-label="Menu"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  >
                    {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                  </button>
                {mobileMenuOpen && (
                  <div className="absolute right-0 top-full mt-3 w-64 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl p-2 space-y-1 z-50">
                    <JoinDiscordButton className="w-full px-4 py-2" />
                    <button
                      onClick={() => {
                        setCurrentPage('dashboard');
                        setMobileMenuOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-700 rounded"
                    >
                      Dashboard
                    </button>
                    <button
                      onClick={() => {
                        viewProfile(currentUser.username);
                        setMobileMenuOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-700 rounded"
                    >
                      Profile
                    </button>
                    <button
                      onClick={() => {
                        setCurrentPage('rules');
                        setMobileMenuOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-700 rounded"
                    >
                      Rules
                    </button>
                    <button
                      onClick={() => {
                        setCurrentPage('leaderboard');
                        setMobileMenuOpen(false);
                      }}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-700 rounded"
                    >
                      Leaderboard
                    </button>
                    {currentUser.isStaff && (
                      <button
                        onClick={() => {
                          setCurrentPage('create');
                          setMobileMenuOpen(false);
                        }}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-700 rounded"
                      >
                        Create Tournament
                      </button>
                    )}
                    {currentUser.isStaff && (
                      <button
                        onClick={() => {
                          setCurrentPage('staff_dashboard');
                          setMobileMenuOpen(false);
                        }}
                        className="block w-full text-left border-2 border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded"
                      >
                        Staff Dashboard
                      </button>
                    )}
                    <div className="px-4 py-2 text-sm text-gray-400 border-t border-gray-700 pt-3">
                      {currentUser.username}
                      {currentUser.isStaff && <span className="ml-2 text-white font-bold">[STAFF]</span>}
                    </div>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left border-2 border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </nav>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPage === 'landing' && (
          <LandingPage onEnter={() => setCurrentPage('login')} />
        )}

        {currentPage === 'login' && (
          <LoginPage onAccountCreated={() => setShowDiscordSetup(true)} />
        )}

        {currentPage === 'dashboard' && currentUser && (
          <DashboardPage
            user={currentUser}
            tournaments={tournaments}
            userMatches={userMatches}
            onJoinTournament={handleJoinTournament}
            onLinkDiscord={() => setShowDiscordSetup(true)}
            onStartTournament={handleStartTournament}
            onDeleteTournament={handleDeleteTournament}
            onSelectTournament={(id) => {
              setSelectedTournamentId(id);
              setCurrentPage('tournament');
            }}
            onOpenMatch={(match) => {
              setSelectedTournamentId(match.tournamentId);
              setSelectedMatchId(match.id);
              setCurrentPage('match');
            }}
          />
        )}

        {currentPage === 'create' && currentUser && (
          currentUser.isStaff ? (
            <CreateTournamentPage
              onCreateTournament={handleCreateTournament}
              onCancel={() => setCurrentPage('dashboard')}
            />
          ) : (
            <div className="max-w-md mx-auto mt-20">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
                <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
                <p className="text-gray-400 mb-6">Only staff members can create tournaments.</p>
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold py-2 px-6 rounded transition"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )
        )}

        {currentPage === 'tournament' && currentUser && (
          <TournamentPage
            tournament={tournaments.find(t => t.id === selectedTournamentId)}
            matches={matches}
            user={currentUser}
            onSelectMatch={(matchId) => {
              setSelectedMatchId(matchId);
              setCurrentPage('match');
            }}
            onResolveDispute={handleResolveDispute}
            onRemovePlayer={handleRemovePlayer}
            onReinstatePlayer={handleReinstatePlayer}
            onChangeWinner={handleChangeWinner}
            onReopenMatch={handleReopenMatch}
            onPlayerReady={handlePlayerReady}
            onViewProfile={viewProfile}
            onUpdateBanner={handleUpdateBanner}
            onUpdateBannerPosition={handleUpdateBannerPosition}
            onUpdateFormat={handleUpdateFormat}
            onUpdateSignupDeadline={handleUpdateSignupDeadline}
            onFlagMatch={(matchId) => {
              setFlagRelatedMatch(matchId);
              setFlagModalOpen(true);
            }}
          />
        )}

        {currentPage === 'match' && currentUser && (
          <MatchPage
            match={matches.find(m => m.id === selectedMatchId) || userMatches.find(m => m.id === selectedMatchId)}
            user={currentUser}
            onReportWinner={async (winner, screenshotFiles) => {
              await handleReportMatch(selectedMatchId, winner, screenshotFiles);
              setCurrentPage('tournament');
            }}
            onCancel={() => setCurrentPage('tournament')}
          />
        )}

        {currentPage === 'staff_dashboard' && currentUser?.isStaff && (
          <StaffDashboard
            flags={flags}
            onUpdateFlagStatus={handleUpdateFlagStatus}
            onAddResponse={handleAddFlagResponse}
          />
        )}

        {currentPage === 'profile' && currentUser && (
          <ProfilePage
            username={selectedProfileUsername || currentUser.username}
            currentUser={currentUser}
            tournaments={tournaments}
            onViewProfile={viewProfile}
            onBack={handleBackFromProfile}
          />
        )}

        {currentPage === 'rules' && currentUser && <RulesPage />}
        {currentPage === 'leaderboard' && currentUser && (
          <LeaderboardPage tournaments={tournaments} user={currentUser} onViewProfile={viewProfile} />
        )}
      </div>

      {flagModalOpen && (
        <FlagReportModal
          onClose={() => {
            setFlagModalOpen(false);
            setFlagRelatedMatch(null);
          }}
          onSubmit={(flagData) => {
            handleCreateFlag(flagData);
            setFlagModalOpen(false);
            setFlagRelatedMatch(null);
          }}
          relatedToMatch={flagRelatedMatch}
        />
      )}

      {showWalkthrough && (
        <TournamentWalkthroughModal onClose={() => setShowWalkthrough(false)} />
      )}

      {showDiscordSetup && currentUser && (
        <DiscordSetupModal user={currentUser} onClose={() => setShowDiscordSetup(false)} />
      )}

      {pendingJoinId && currentUser && (
        <DiscordSetupModal
          joining
          user={currentUser}
          onClose={() => {
            const id = pendingJoinId;
            setPendingJoinId(null);
            joinNow(id);
          }}
          onCancel={() => setPendingJoinId(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// PAGE COMPONENTS
// ============================================================================

function LandingPage({ onEnter }) {
  return (
    <div className="text-center max-w-lg mx-auto mt-20">
      <img
        src="/logo.png"
        alt="MercifulAj Logo"
        className="w-64 h-64 sm:w-72 sm:h-72 mx-auto mb-12 object-contain"
      />
      <button
        onClick={onEnter}
        className="inline-block bg-white text-black px-12 py-4 rounded font-bold text-lg tracking-wide border-2 border-white hover:bg-black hover:text-white transition"
      >
        ENTER TOURNAMENTS
      </button>
    </div>
  );
}

function LoginPage({ onAccountCreated }) {
  const [isCreating, setIsCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clashTag, setClashTag] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (!/^[A-Za-z0-9_.-]+$/.test(username.trim())) {
      setError('Username may only contain letters, numbers, underscores, hyphens, and periods');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!clashTag.trim()) {
      setError('Clash of Clans tag is required');
      return;
    }

    if (!clashTag.startsWith('#')) {
      setError('Clash tag must start with #');
      return;
    }

    if (!apiToken.trim()) {
      setError('Your Clash of Clans API token is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp({
        username,
        password,
        clashTag: clashTag.toUpperCase(),
        apiToken: apiToken.trim(),
        inviteCode: inviteCode.trim(),
      });
      onAccountCreated?.();
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await logIn({ username, password });
    } catch (err) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCreating) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
          <div className="text-3xl font-bold mb-8 text-center flex items-center justify-center gap-3">
            <Trophy className="w-10 h-10 text-white" />
            Create Account
          </div>

          {error && (
            <div className="mb-4 p-3 bg-neutral-800 border-2 border-white rounded text-white text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
                placeholder="Enter username (3+ characters)"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
                placeholder="Enter password (6+ characters)"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
                placeholder="Confirm password"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Clash of Clans Tag</label>
              <input
                type="text"
                value={clashTag}
                onChange={(e) => setClashTag(e.target.value.toUpperCase())}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
                placeholder="e.g., #ABC123XYZ"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Find your tag in your Clash profile</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Clash of Clans API Token</label>
              <input
                type="text"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
                placeholder="Paste your API token"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                In Clash of Clans: Settings → More Settings → scroll down to "API Token" → tap Show → copy and paste it here.
                This proves the tag above is really yours and unlocks your verified Builder Hall level and best trophies.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Staff Invite Code (optional)</label>
              <input
                type="password"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="w-full bg-gray-700 border border-white rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
                placeholder="Only if you were given one"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-white hover:bg-neutral-200 text-gray-900 font-bold py-2 px-4 rounded transition disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </button>

            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setError('');
                setUsername('');
                setPassword('');
                setConfirmPassword('');
                setClashTag('');
                setApiToken('');
                setInviteCode('');
              }}
              className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition"
            >
              Back to Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="MercifulAj" className="w-24 h-24 object-contain" />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-neutral-800 border-2 border-white rounded text-white text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
              placeholder="Enter username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
              placeholder="Enter password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-white hover:bg-neutral-200 text-gray-900 font-bold py-2 px-4 rounded transition disabled:opacity-50"
          >
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <button
          onClick={() => {
            setIsCreating(true);
            setError('');
            setUsername('');
            setPassword('');
          }}
          className="w-full mt-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white font-bold py-2 px-4 rounded transition"
        >
          Create New Account
        </button>
      </div>
    </div>
  );
}

function DashboardPage({ user, tournaments, userMatches, onJoinTournament, onStartTournament, onDeleteTournament, onSelectTournament, onOpenMatch, onLinkDiscord }) {
  const userTournaments = tournaments.filter(t => t.createdBy === user.username || t.players.includes(user.username));
  const pendingMatches = userMatches
    .filter(m => m.status === 'waiting_for_opponent' || m.status === 'pending' || m.status === 'scheduled' || m.status === 'active');
  const openTournaments = tournaments.filter(t => t.status !== 'completed');
  const pastTournaments = tournaments.filter(t => t.status === 'completed');

  return (
    <div className="space-y-8">
      {!user.discordId && (
        <div className="bg-gray-800 rounded-lg border-2 border-[#5865F2] p-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold">💬 Join our Discord</h2>
            <p className="text-sm text-gray-300">
              Get the bot's DMs when your matches open and before you'd run out of time, so you never miss an attack.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <JoinDiscordButton className="px-4 py-2" />
            <button onClick={onLinkDiscord} className="border border-gray-600 hover:border-white px-4 py-2 rounded transition">
              Link my Discord
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Trophy className="w-6 h-6" />}
          label="Active Tournaments"
          value={tournaments.filter(t => t.status === 'in_progress').length}
        />
        <StatCard
          icon={<Users className="w-6 h-6" />}
          label="My Tournaments"
          value={userTournaments.length}
        />
        <StatCard
          icon={<MessageCircle className="w-6 h-6" />}
          label="Pending Matches"
          value={pendingMatches.length}
          onClick={pendingMatches.length > 0 ? () => onOpenMatch(pendingMatches[0]) : undefined}
        />
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-2xl font-bold mb-4">Available Tournaments</h2>
        <div className="space-y-3">
          {openTournaments.length === 0 ? (
            <p className="text-gray-400">No tournaments yet. Create one to get started!</p>
          ) : (
            openTournaments.map(tournament => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                user={user}
                onJoin={onJoinTournament}
                onStart={onStartTournament}
                onDelete={onDeleteTournament}
                onView={() => onSelectTournament(tournament.id)}
              />
            ))
          )}
        </div>
      </div>

      {pastTournaments.length > 0 && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-2xl font-bold mb-4">Past Tournaments</h2>
          <div className="space-y-3">
            {pastTournaments.map(tournament => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                user={user}
                onJoin={onJoinTournament}
                onStart={onStartTournament}
                onDelete={onDeleteTournament}
                onView={() => onSelectTournament(tournament.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function medalFor(place) {
  if (place === 1) return '/badges/rainbow.png';
  if (place === 2) return '/badges/diamond.png';
  if (place === 3) return '/badges/ruby.png';
  if (place <= 10) return '/badges/emerald.png';
  return null;
}

function ProfilePage({ username, currentUser, tournaments, onViewProfile, onBack }) {
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [discordLinkCode, setDiscordLinkCode] = useState(null);
  const [gettingLinkCode, setGettingLinkCode] = useState(false);
  const [editingCountry, setEditingCountry] = useState(false);
  const [countryDraft, setCountryDraft] = useState('');
  const [localRanking, setLocalRanking] = useState(undefined);
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [verifyClashTag, setVerifyClashTag] = useState('');
  const [editingVerifyTag, setEditingVerifyTag] = useState(false);
  const [verifyApiToken, setVerifyApiToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [liveStats, setLiveStats] = useState(undefined);
  const [loadingLiveStats, setLoadingLiveStats] = useState(false);

  const isOwnProfile = currentUser.username === username;

  useEffect(() => {
    setProfileLoaded(false);
    setLiveStats(undefined);
    setLocalRanking(undefined);
    return subscribeToUserProfile(username, (p) => {
      setProfile(p);
      setProfileLoaded(true);
    });
  }, [username]);

  useEffect(() => {
    setBioDraft(profile?.bio || '');
  }, [profile?.bio]);

  useEffect(() => {
    setDiscordLinkCode(null);
  }, [profile?.discordId]);

  useEffect(() => {
    let cancelled = false;
    if (profile?.avatarPath) {
      getProfilePictureUrl(profile.avatarPath).then((url) => {
        if (!cancelled) setAvatarUrl(url);
      });
    } else {
      setAvatarUrl(null);
    }
    return () => { cancelled = true; };
  }, [profile?.avatarPath]);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !profile) return;
    setUploading(true);
    try {
      const path = await uploadProfilePicture(profile.id, file);
      await updateProfile(profile.id, { avatarPath: path });
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveBio = async () => {
    try {
      await updateProfile(profile.id, { bio: bioDraft.trim() });
      setEditingBio(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleGetLinkCode = async () => {
    setGettingLinkCode(true);
    try {
      setDiscordLinkCode(await createDiscordLinkCode());
    } catch (err) {
      alert(err.message);
    } finally {
      setGettingLinkCode(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setVerifyError('');

    const tagToVerify = editingVerifyTag ? verifyClashTag.trim().toUpperCase() : profile?.clashTag;
    if (!tagToVerify || !tagToVerify.startsWith('#')) {
      setVerifyError('Clash tag must start with #');
      return;
    }
    if (!verifyApiToken.trim()) {
      setVerifyError('API token is required');
      return;
    }

    setVerifying(true);
    try {
      await verifyClashAccount({ clashTag: tagToVerify, apiToken: verifyApiToken.trim() });
      setShowVerifyForm(false);
      setEditingVerifyTag(false);
      setVerifyClashTag('');
      setVerifyApiToken('');
    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveCountry = async (e) => {
    e.preventDefault();
    try {
      await updateProfile(profile.id, { country: countryDraft ? parseInt(countryDraft, 10) : '' });
      setEditingCountry(false);
      setLocalRanking(undefined);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRefreshLiveStats = async () => {
    if (!profile?.clashTag) return;
    setLoadingLiveStats(true);
    try {
      const [data, ranking] = await Promise.all([
        fetchClashPlayerData(profile.clashTag),
        profile.country ? fetchLocalRanking(profile.clashTag, profile.country) : Promise.resolve(undefined),
      ]);
      setLiveStats(data);
      setLocalRanking(profile.country ? ranking : undefined);
    } finally {
      setLoadingLiveStats(false);
    }
  };

  const placed = tournaments
    .filter(t => t.status === 'completed' && t.placements && t.placements[username])
    .sort((a, b) => a.placements[username] - b.placements[username]);

  const championships = placed.filter(t => t.placements[username] === 1).length;
  const runnerUps = placed.filter(t => t.placements[username] === 2).length;

  if (profileLoaded && !profile) {
    return (
      <div className="text-center space-y-4">
        <p className="text-gray-400">No player found with that username</p>
        <button onClick={onBack} className="text-sm text-gray-300 hover:text-white underline">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <button onClick={onBack} className="text-sm text-gray-300 hover:text-white flex items-center gap-1 transition">
        ← Back
      </button>
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-full bg-gray-700 border-2 border-white overflow-hidden flex items-center justify-center text-2xl font-bold">
              {avatarUrl ? (
                <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
              ) : (
                username.charAt(0).toUpperCase()
              )}
            </div>
            {isOwnProfile && (
              <label
                className="absolute -bottom-1 -right-1 bg-white text-black rounded-full w-7 h-7 flex items-center justify-center text-xs cursor-pointer border-2 border-gray-800"
                title="Change profile picture"
              >
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
                {uploading ? '…' : '✎'}
              </label>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold">{username}</h1>
            <p className="text-gray-400">{profile?.clashTag}</p>
            {profile?.isStaff && <span className="text-white font-bold text-xs">[STAFF]</span>}
          </div>
        </div>

        <div className="mt-4">
          {editingBio ? (
            <div className="space-y-2">
              <textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                maxLength={300}
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-white"
                placeholder="Say something about yourself..."
              />
              <div className="flex gap-2">
                <button onClick={handleSaveBio} className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-1 rounded text-sm transition">
                  Save
                </button>
                <button
                  onClick={() => { setEditingBio(false); setBioDraft(profile?.bio || ''); }}
                  className="border border-gray-600 hover:border-white px-3 py-1 rounded text-sm transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <p className="text-gray-300 text-sm">
                {profile?.bio || (isOwnProfile ? 'No bio yet — add one!' : 'No bio yet.')}
              </p>
              {isOwnProfile && (
                <button
                  onClick={() => setEditingBio(true)}
                  className="border border-gray-600 hover:border-white text-xs px-2 py-1 rounded shrink-0 transition"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {isOwnProfile && (
          <div className="mt-4 p-3 bg-gray-700 rounded">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <span className="text-sm font-bold">💬 Discord Notifications</span>
              {!discordLinkCode && (
                <button
                  onClick={handleGetLinkCode}
                  disabled={gettingLinkCode}
                  className="text-xs border border-gray-600 hover:border-white px-2 py-1 rounded transition disabled:opacity-50"
                >
                  {gettingLinkCode ? 'Getting code...' : profile?.discordId ? 'Re-link' : 'Link Discord'}
                </button>
              )}
            </div>
            {discordLinkCode ? (
              <div className="space-y-2 mt-2">
                <p className="text-xs text-gray-300">In our Discord server, run:</p>
                <p className="font-mono text-lg font-bold text-white bg-gray-800 rounded px-3 py-2 select-all">
                  /link code:{discordLinkCode.code}
                </p>
                <p className="text-xs text-gray-400">The code expires in 10 minutes and works once.</p>
                <button
                  onClick={() => setDiscordLinkCode(null)}
                  className="border border-gray-600 hover:border-white px-3 py-1 rounded text-sm transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-400">
                  {profile?.discordId
                    ? "Linked. The bot will DM you about your matches and new chat messages."
                    : 'Link your Discord to get DMs about your matches and new chat messages. It\'s required to join tournaments.'}
                </p>
                <div className="mt-2">
                  <JoinDiscordButton className="px-3 py-1 text-sm" />
                </div>
              </div>
            )}
          </div>
        )}

        {isOwnProfile && (
          <div className="mt-4 p-3 bg-gray-700 rounded">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <span className="text-sm font-bold">🌍 Country</span>
              {!editingCountry && (
                <button
                  onClick={() => { setCountryDraft(profile?.country || ''); setEditingCountry(true); }}
                  className="text-xs border border-gray-600 hover:border-white px-2 py-1 rounded transition"
                >
                  {profile?.country ? 'Edit' : 'Set up'}
                </button>
              )}
            </div>
            {editingCountry ? (
              <form onSubmit={handleSaveCountry} className="space-y-2 mt-2">
                <select
                  value={countryDraft}
                  onChange={(e) => setCountryDraft(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-white"
                >
                  <option value="">No country selected</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400">
                  Clash of Clans doesn't expose which country an account is in, so this is used only to check your local leaderboard ranking.
                </p>
                <div className="flex gap-2">
                  <button type="submit" className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-1 rounded text-sm transition">
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCountry(false)}
                    className="border border-gray-600 hover:border-white px-3 py-1 rounded text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-gray-400">
                {profile?.country
                  ? `Used for local ranking: ${COUNTRIES.find((c) => c.id === profile.country)?.name || profile.country}`
                  : 'Set your country to see your local Builder Base ranking.'}
              </p>
            )}
          </div>
        )}

        <div className="mt-4 p-3 bg-gray-700 rounded">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className={`text-sm font-bold ${profile?.clashVerified ? 'text-white' : 'text-gray-400 font-normal'}`}>
              {profile?.clashVerified ? '✓ Verified Clash Account' : 'Clash of Clans account not verified'}
            </span>
            {isOwnProfile && (
              <button
                onClick={() => setShowVerifyForm(!showVerifyForm)}
                className={
                  profile?.clashVerified
                    ? 'text-xs border border-gray-600 hover:border-white px-2 py-1 rounded transition'
                    : 'text-xs bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-2 py-1 rounded transition'
                }
              >
                {profile?.clashVerified ? 'Re-verify' : 'Verify Now'}
              </button>
            )}
          </div>

          {profile?.clashVerified && (
            <>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-gray-800 rounded p-3 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Builder Hall</p>
                  <p className="text-xl font-bold text-white mt-1">{profile.builderHallLevel}</p>
                </div>
                <div className="bg-gray-800 rounded p-3 text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Best Trophies</p>
                  <p className="text-xl font-bold text-white mt-1">{profile.bestBuilderBaseTrophies}</p>
                </div>
              </div>

              <div className="mt-3">
                {liveStats === undefined ? (
                  <button
                    onClick={handleRefreshLiveStats}
                    disabled={loadingLiveStats}
                    className="text-xs border border-gray-600 hover:border-white px-2 py-1 rounded transition disabled:opacity-50"
                  >
                    {loadingLiveStats ? 'Fetching live stats...' : '🔄 Pull Live Clash Stats'}
                  </button>
                ) : liveStats === null ? (
                  <p className="text-xs text-gray-400">Couldn't reach the Clash of Clans API right now.</p>
                ) : (
                  <div className="bg-gray-800 rounded p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400 uppercase tracking-wide">Live from Supercell</span>
                      <button
                        onClick={handleRefreshLiveStats}
                        disabled={loadingLiveStats}
                        className="text-xs text-gray-400 hover:text-white underline disabled:opacity-50"
                      >
                        {loadingLiveStats ? 'Refreshing...' : 'Refresh'}
                      </button>
                    </div>
                    <p className="flex items-center gap-1.5">
                      Current Trophies:
                      {getLeagueIconUrl(liveStats.builderBaseLeague) ? (
                        <img src={getLeagueIconUrl(liveStats.builderBaseLeague)} alt="" className="w-4 h-4" />
                      ) : '🏆'}
                      <span className="font-bold text-white">
                        {liveStats.builderBaseTrophies}{liveStats.builderBaseLeague ? ` (${liveStats.builderBaseLeague})` : ''}
                      </span>
                    </p>
                    <p>Best Trophies: <span className="font-bold text-white">{liveStats.bestBuilderBaseTrophies}</span></p>
                    {liveStats.clanName && (
                      <p className="flex items-center gap-1.5">
                        Clan:
                        {liveStats.clanBadgeUrl && <img src={liveStats.clanBadgeUrl} alt="" className="w-4 h-4" />}
                        <span className="font-bold text-white">{liveStats.clanName}</span>
                      </p>
                    )}
                    {liveStats.bestSeasonRank != null || liveStats.bestSeasonTrophies != null ? (
                      <p>🌍 Best Builder Base Season: <span className="font-bold text-white">{formatBestSeason(liveStats)}</span></p>
                    ) : null}
                    {liveStats.versusBattleWins != null && <p>Builder Base Wins: <span className="font-bold text-white">{liveStats.versusBattleWins}</span></p>}
                    {profile?.country && (
                      <p>
                        Local Ranking ({COUNTRIES.find((c) => c.id === profile.country)?.name}):{' '}
                        <span className="font-bold text-white">
                          {localRanking === undefined
                            ? '—'
                            : localRanking === null
                            ? 'Unavailable right now'
                            : localRanking.rank == null
                            ? `Outside the top ${localRanking.checkedTop}`
                            : `#${localRanking.rank}`}
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {isOwnProfile && showVerifyForm && (
            <form onSubmit={handleVerify} className="mt-3 space-y-2 border-t border-gray-600 pt-3">
              {verifyError && (
                <div className="p-2 bg-neutral-800 border border-white rounded text-white text-xs">{verifyError}</div>
              )}
              {editingVerifyTag ? (
                <input
                  type="text"
                  value={verifyClashTag}
                  onChange={(e) => setVerifyClashTag(e.target.value.toUpperCase())}
                  placeholder="e.g., #ABC123XYZ"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-white"
                />
              ) : (
                <p className="text-xs text-gray-400">
                  Verifying <span className="text-white font-bold">{profile?.clashTag || 'no tag on file'}</span>.{' '}
                  <button
                    type="button"
                    onClick={() => { setEditingVerifyTag(true); setVerifyClashTag(profile?.clashTag || ''); }}
                    className="underline hover:text-white"
                  >
                    Wrong tag?
                  </button>
                </p>
              )}
              <input
                type="text"
                value={verifyApiToken}
                onChange={(e) => setVerifyApiToken(e.target.value)}
                placeholder="Paste your API token"
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-white"
              />
              <p className="text-xs text-gray-400">
                In Clash of Clans: Settings → More Settings → scroll down to "API Token" → tap Show → copy and paste it here.
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={verifying}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-1 rounded text-sm transition disabled:opacity-50"
                >
                  {verifying ? 'Verifying...' : 'Submit'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowVerifyForm(false); setEditingVerifyTag(false); setVerifyError(''); }}
                  className="border border-gray-600 hover:border-white px-3 py-1 rounded text-sm transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-400">Tournaments Placed</p>
            <p className="text-2xl font-bold">{placed.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Championships</p>
            <p className="text-2xl font-bold flex items-center gap-2">
              <img src="/badges/rainbow.png" alt="" className="w-7 h-7 object-contain" /> {championships}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Runner-up Finishes</p>
            <p className="text-2xl font-bold flex items-center gap-2">
              <img src="/badges/diamond.png" alt="" className="w-7 h-7 object-contain" /> {runnerUps}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-xl font-bold mb-4">Achievements</h2>
        {placed.length === 0 ? (
          <p className="text-gray-400 text-sm">No completed tournaments yet. Finish one to earn your first badge!</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {placed.map(t => (
              <div key={t.id} className="bg-gray-700 rounded p-4 flex items-center gap-3">
                {medalFor(t.placements[username]) && (
                  <img src={medalFor(t.placements[username])} alt={`${ordinal(t.placements[username])} place`} className="w-12 h-12 object-contain shrink-0" />
                )}
                <div>
                  <p className="font-bold">{ordinal(t.placements[username])} place</p>
                  <p className="text-sm text-gray-300">{t.name}</p>
                  <button
                    onClick={() => onViewProfile(t.champion)}
                    className="text-xs text-gray-500 hover:text-white hover:underline transition"
                  >
                    Champion: {t.champion}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentCard({ tournament, user, onJoin, onStart, onDelete, onView }) {
  const isCreator = tournament.createdBy === user.username;
  const hasJoined = tournament.players.includes(user.username);
  const now = new Date();
  const deadlinePassed = tournament.signupDeadline && new Date(tournament.signupDeadline) < now;

  const bhOk = tournament.requiredBuilderHallLevel == null || user.builderHallLevel === tournament.requiredBuilderHallLevel;
  const trophyOk = tournament.minBestTrophies == null || (user.bestBuilderBaseTrophies ?? -1) >= tournament.minBestTrophies;
  const meetsRequirements = bhOk && trophyOk;
  const hasRequirements = tournament.requiredBuilderHallLevel != null || tournament.minBestTrophies != null;

  const canJoin = !hasJoined && !isCreator && tournament.status === 'signups_open' && !deadlinePassed && meetsRequirements;
  const blockedByRequirements = !hasJoined && !isCreator && tournament.status === 'signups_open' && !deadlinePassed && !meetsRequirements;

  const formatStatus = (status) => {
    return status
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getDeadlineDisplay = () => {
    if (!tournament.signupDeadline) return null;
    const deadline = new Date(tournament.signupDeadline);
    if (deadline < now) {
      return <span className="text-white font-semibold">Signups Closed</span>;
    }
    return <span className="text-white">{deadline.toLocaleString()}</span>;
  };

  const cardContent = (
    <div className="bg-gray-700 flex-1 min-w-0 p-4 flex justify-between items-center flex-wrap gap-4">
      <div className="flex-1 min-w-0">
        <h3 className="font-extrabold text-xl tracking-tight">{tournament.name}</h3>
        <div className="text-sm text-gray-300 mt-1">
          <p>Creator: {tournament.createdBy}</p>
          <p>Players: {tournament.players.length} · Status: <span className="text-white">{tournament.status === 'loading_stats' ? 'Loading...' : formatStatus(tournament.status)}</span></p>
          {tournament.status === 'completed' && tournament.champion && (
            <p className="flex items-center gap-1.5">
              <img src="/badges/rainbow.png" alt="" className="w-4 h-4 object-contain" /> Champion:{' '}
              <span className="text-amber-300 font-bold">{tournament.champion}</span>
            </p>
          )}
          {tournament.prize && (
            <p>Prize: <span className="text-white font-bold">{tournament.prize}</span></p>
          )}
          {hasRequirements && (
            <p>
              Requires:{' '}
              <span className="text-white">
                {tournament.requiredBuilderHallLevel != null && `Builder Hall ${tournament.requiredBuilderHallLevel}`}
                {tournament.requiredBuilderHallLevel != null && tournament.minBestTrophies != null && ' · '}
                {tournament.minBestTrophies != null && `${tournament.minBestTrophies}+ best trophies`}
              </span>
            </p>
          )}
          {tournament.signupDeadline && (
            <p>Deadline: {getDeadlineDisplay()}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {canJoin && (
          <button
            onClick={() => onJoin(tournament.id)}
            className="bg-gradient-to-b from-green-400 to-green-600 hover:from-green-300 hover:to-green-500 border-2 border-green-900 shadow-[0_3px_0_#14532d] active:translate-y-0.5 active:shadow-none text-white font-bold px-4 py-2 rounded text-sm transition"
          >
            Join
          </button>
        )}
        {blockedByRequirements && (
          <span
            className="bg-neutral-800 border-2 border-white text-white px-4 py-2 rounded text-sm"
            title="You don't meet this tournament's Builder Hall / trophy requirements"
          >
            Doesn't Meet Requirements
          </span>
        )}
        {hasJoined && !isCreator && tournament.status === 'signups_open' && (
          <span className="bg-neutral-800 border border-neutral-600 text-white px-4 py-2 rounded text-sm">Joined ✓</span>
        )}
        {deadlinePassed && !hasJoined && tournament.status === 'signups_open' && (
          <span className="bg-neutral-800 border-2 border-white text-white px-4 py-2 rounded text-sm">Signups Closed</span>
        )}
        {isCreator && tournament.status === 'signups_open' && tournament.players.length >= 2 && (
          <button
            onClick={() => onStart(tournament.id)}
            className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-4 py-2 rounded text-sm transition"
          >
            Start Tournament
          </button>
        )}
        {tournament.status === 'loading_stats' && (
          <div className="text-white text-sm">Fetching player data...</div>
        )}
        <button
          onClick={onView}
          className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm transition"
        >
          View
        </button>
        {user.isStaff && (
          <button
            onClick={() => onDelete(tournament.id)}
            className="border-2 border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded text-sm transition"
            title="Delete tournament"
          >
            🗑️ Delete
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded overflow-hidden border-2 border-white flex flex-col sm:flex-row">
      {tournament.bannerPath ? (
        <TournamentBannerImage
          path={tournament.bannerPath}
          position={tournament.bannerPosition}
          className="w-full sm:w-48 h-32 sm:h-auto object-cover shrink-0"
        />
      ) : (
        <AutoBanner seed={tournament.id} className="w-full sm:w-48 h-32 sm:h-auto shrink-0" />
      )}
      {cardContent}
    </div>
  );
}

// Deterministic hash so the same tournament always gets the same colors.
function hashSeed(seed) {
  const str = String(seed);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Auto-generated banner for tournaments without an uploaded image - a
// colorful gradient in the vein of Clash's event cards, kept separate from
// the app's own black/white chrome since it's a decorative graphic.
function AutoBanner({ seed, className, children }) {
  const hue = hashSeed(seed) % 360;
  const gradient = `linear-gradient(135deg, hsl(${hue}, 65%, 32%), hsl(${(hue + 45) % 360}, 70%, 16%))`;
  return (
    <div className={`${className} flex items-center justify-center relative overflow-hidden`} style={{ background: gradient }}>
      <div
        className="absolute inset-0 opacity-20"
        style={{ background: `radial-gradient(circle at 30% 30%, hsl(${(hue + 20) % 360}, 80%, 60%), transparent 60%)` }}
      />
      {children}
    </div>
  );
}

// Bold, thick-outlined title text meant to sit on top of a banner image or
// gradient - the "chunky game font" look from the Clash Royale reference.
function BannerTitle({ children, className = '' }) {
  return (
    <span
      className={`font-black text-white ${className}`}
      style={{ WebkitTextStroke: '1.5px black', textShadow: '2px 2px 0 rgba(0,0,0,0.6)' }}
    >
      {children}
    </span>
  );
}

function TournamentBannerImage({ path, position, className }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (path) {
      getTournamentBannerUrl(path).then((u) => { if (!cancelled) setUrl(u); });
    } else {
      setUrl(null);
    }
    return () => { cancelled = true; };
  }, [path]);

  const objectPosition = `${position?.x ?? 50}% ${position?.y ?? 50}%`;

  if (!url) return <div className={`${className} bg-gray-800`} />;
  return <img src={url} alt="Tournament banner" className={className} style={{ objectPosition }} />;
}

function CreateTournamentPage({ onCreateTournament, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('single_elimination');
  const [signupDeadline, setSignupDeadline] = useState('');
  const [requiredBuilderHallLevel, setRequiredBuilderHallLevel] = useState('');
  const [minBestTrophies, setMinBestTrophies] = useState('');
  const [prize, setPrize] = useState('');
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [error, setError] = useState('');

  const handleBannerUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Tournament name is required');
      return;
    }

    if (signupDeadline && new Date(signupDeadline) < new Date()) {
      setError('Signup deadline must be in the future');
      return;
    }

    onCreateTournament({
      name,
      description,
      format,
      signupDeadline: signupDeadline || null,
      requiredBuilderHallLevel: requiredBuilderHallLevel ? parseInt(requiredBuilderHallLevel, 10) : null,
      minBestTrophies: minBestTrophies ? parseInt(minBestTrophies, 10) : null,
      prize: prize.trim(),
    }, bannerFile);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
        <h2 className="text-2xl font-bold mb-6">Create Tournament</h2>

        {error && (
          <div className="mb-4 p-3 bg-neutral-800 border-2 border-white rounded text-white text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Tournament Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
              placeholder="e.g., Builder Base April Cup"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Banner Image (Optional)</label>
            <label className="block">
              <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
              <div className="border-2 border-dashed border-gray-600 rounded overflow-hidden cursor-pointer hover:border-white transition">
                {bannerPreview ? (
                  <img src={bannerPreview} alt="Banner preview" className="w-full h-32 object-cover" />
                ) : (
                  <div className="p-4 text-center">
                    <p className="text-sm text-gray-400">Click to upload a banner</p>
                    <p className="text-xs text-gray-500 mt-1">Shown on the tournament card and page</p>
                  </div>
                )}
              </div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
              placeholder="Details about your tournament"
              rows="4"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Prize (Optional)</label>
            <input
              type="text"
              value={prize}
              onChange={(e) => setPrize(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
              placeholder="e.g., $25 gift card, in-game gems, bragging rights"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
            >
              <option value="single_elimination">Single Elimination</option>
              <option value="double_elimination">Double Elimination</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Signup Deadline (Optional)</label>
            <input
              type="datetime-local"
              value={signupDeadline}
              onChange={(e) => setSignupDeadline(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave blank to allow signups indefinitely, or to start the bracket yourself whenever you're ready.
              With a deadline set, the tournament seeds its bracket and starts automatically the moment it passes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Required Builder Hall (Optional)</label>
              <select
                value={requiredBuilderHallLevel}
                onChange={(e) => setRequiredBuilderHallLevel(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-white"
              >
                <option value="">No restriction</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(level => (
                  <option key={level} value={level}>Builder Hall {level} only</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Minimum Best Trophies (Optional)</label>
              <input
                type="number"
                min="0"
                value={minBestTrophies}
                onChange={(e) => setMinBestTrophies(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
                placeholder="e.g., 4000"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-3">
            Only players with a verified Clash of Clans account meeting these requirements can join. Leave blank for no restriction.
          </p>

          <div className="flex gap-4">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold py-2 px-4 rounded transition"
            >
              Create Tournament
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TournamentPage({ tournament, matches, user, onSelectMatch, onPlayerReady, onFlagMatch, onResolveDispute, onRemovePlayer, onReinstatePlayer, onChangeWinner, onReopenMatch, onViewProfile, onUpdateBanner, onUpdateBannerPosition, onUpdateFormat, onUpdateSignupDeadline }) {
  const [viewMode, setViewMode] = useState('list');
  const [selectedDay, setSelectedDay] = useState(null);
  const [bannerUrl, setBannerUrl] = useState(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [repositioning, setRepositioning] = useState(false);
  const [draftPosition, setDraftPosition] = useState({ x: 50, y: 50 });
  const [savingPosition, setSavingPosition] = useState(false);
  const bannerBoxRef = useRef(null);
  const dragStateRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (tournament?.bannerPath) {
      getTournamentBannerUrl(tournament.bannerPath).then((u) => { if (!cancelled) setBannerUrl(u); });
    } else {
      setBannerUrl(null);
    }
    return () => { cancelled = true; };
  }, [tournament?.bannerPath]);

  const handleBannerChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingBanner(true);
    try {
      await onUpdateBanner(tournament.id, file);
    } catch (err) {
      alert(err.message);
    } finally {
      setUploadingBanner(false);
    }
  };

  const [changingFormat, setChangingFormat] = useState(false);
  const handleFormatChange = async (e) => {
    const newFormat = e.target.value;
    if (newFormat === tournament.format) return;
    setChangingFormat(true);
    try {
      await onUpdateFormat(tournament.id, newFormat);
    } catch (err) {
      alert(err.message);
    } finally {
      setChangingFormat(false);
    }
  };

  const [editingDeadline, setEditingDeadline] = useState(false);
  const [deadlineDraft, setDeadlineDraft] = useState('');
  const [savingDeadline, setSavingDeadline] = useState(false);

  const startEditingDeadline = () => {
    setDeadlineDraft(toDatetimeLocalValue(tournament.signupDeadline));
    setEditingDeadline(true);
  };

  const handleSaveDeadline = async () => {
    setSavingDeadline(true);
    try {
      await onUpdateSignupDeadline(tournament.id, deadlineDraft || null);
      setEditingDeadline(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingDeadline(false);
    }
  };

  const startRepositioning = () => {
    setDraftPosition(tournament.bannerPosition || { x: 50, y: 50 });
    setRepositioning(true);
  };

  const handleDragStart = (e) => {
    if (!repositioning) return;
    dragStateRef.current = { startX: e.clientX, startY: e.clientY, startPosition: draftPosition };
    e.target.setPointerCapture(e.pointerId);
  };

  const handleDragMove = (e) => {
    if (!repositioning || !dragStateRef.current || !bannerBoxRef.current) return;
    const { width, height } = bannerBoxRef.current.getBoundingClientRect();
    const { startX, startY, startPosition } = dragStateRef.current;
    const deltaXPct = ((e.clientX - startX) / width) * 100;
    const deltaYPct = ((e.clientY - startY) / height) * 100;
    setDraftPosition({
      x: Math.max(0, Math.min(100, startPosition.x - deltaXPct)),
      y: Math.max(0, Math.min(100, startPosition.y - deltaYPct)),
    });
  };

  const handleDragEnd = () => {
    dragStateRef.current = null;
  };

  const handleSavePosition = async () => {
    setSavingPosition(true);
    try {
      await onUpdateBannerPosition(tournament.id, draftPosition);
      setRepositioning(false);
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingPosition(false);
    }
  };

  if (!tournament) {
    return (
      <div className="text-center">
        <p className="text-gray-400">Tournament not found</p>
      </div>
    );
  }

  const formatStatus = (status) => {
    return status
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
  const isDoubleElim = tournament.format === 'double_elimination';

  // Double elimination's winners/losers/grand-final sections each carry
  // their own "day" (a round in one bracket can land on the same day as a
  // different round in the other), so a single elimination round IS its
  // day, but here the day has to be read off the section's own matches.
  const matchDay = (m) => (isDoubleElim ? (m.day ?? m.round) : m.round);
  const allDays = [...new Set(matches.map(matchDay))].sort((a, b) => a - b);
  const isDayComplete = (d) => matches.filter((m) => matchDay(m) === d).every((m) => m.status === 'completed');
  // Defaults to the earliest day that isn't fully decided yet - i.e. the
  // current day - so clicking into the list view doesn't dump you on Day 1
  // of a tournament that's already well underway.
  const defaultDay = allDays.find((d) => !isDayComplete(d)) ?? allDays[allDays.length - 1];
  const activeDay = selectedDay ?? defaultDay;

  const bracketOrder = { winners: 0, losers: 1, grand_final: 2 };
  const bracketSections = isDoubleElim
    ? [...new Set(matches.map(m => `${m.bracket}:${m.round}`))]
        .map(key => {
          const [bracket, round] = key.split(':');
          return { bracket, round: parseInt(round, 10) };
        })
        .sort((a, b) => (bracketOrder[a.bracket] - bracketOrder[b.bracket]) || (a.round - b.round))
    : null;
  const sectionLabel = ({ bracket, round }) => {
    if (bracket === 'winners') return `Winners Bracket — Round ${round}`;
    if (bracket === 'losers') return `Losers Bracket — Round ${round}`;
    return round === 1 ? 'Grand Final' : 'Grand Final — Bracket Reset';
  };

  return (
    <div className="space-y-8">
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="relative" ref={bannerBoxRef}>
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              className={`w-full h-48 object-cover ${repositioning ? 'cursor-move' : ''}`}
              style={{
                objectPosition: `${(repositioning ? draftPosition : tournament.bannerPosition)?.x ?? 50}% ${(repositioning ? draftPosition : tournament.bannerPosition)?.y ?? 50}%`,
                touchAction: repositioning ? 'none' : 'auto',
                userSelect: 'none',
              }}
              onPointerDown={handleDragStart}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              draggable={false}
            />
          ) : (
            <AutoBanner seed={tournament.id} className="w-full h-48" />
          )}
          {!repositioning && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />}
          {!repositioning && (
            <h1 className="absolute bottom-4 left-6 right-6 text-4xl tracking-tight">
              <BannerTitle>{tournament.name}</BannerTitle>
            </h1>
          )}
          {user.isStaff && !repositioning && (
            <div className="absolute top-4 right-4 flex gap-2">
              {bannerUrl && (
                <button
                  onClick={startRepositioning}
                  className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded transition"
                >
                  Reposition
                </button>
              )}
              <label className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded cursor-pointer transition">
                <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" disabled={uploadingBanner} />
                {uploadingBanner ? 'Uploading...' : bannerUrl ? 'Change Banner' : '+ Add Banner'}
              </label>
            </div>
          )}
          {repositioning && (
            <div className="absolute inset-x-0 bottom-0 bg-black/70 p-3 flex items-center justify-between gap-2">
              <p className="text-xs text-white">Drag the image to reposition it</p>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleSavePosition}
                  disabled={savingPosition}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-1 rounded text-xs transition disabled:opacity-50"
                >
                  {savingPosition ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setRepositioning(false)}
                  className="border border-white text-white hover:bg-white hover:text-black px-3 py-1 rounded text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="p-6">
        <p className="text-gray-400">{tournament.description}</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-400">Status</p>
            <p className="text-lg font-bold text-white">{tournament.status === 'loading_stats' ? 'Loading...' : formatStatus(tournament.status)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Format</p>
            {user.isStaff && tournament.status === 'signups_open' ? (
              <select
                value={tournament.format}
                onChange={handleFormatChange}
                disabled={changingFormat}
                className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-white"
              >
                <option value="single_elimination">Single Elimination</option>
                <option value="double_elimination">Double Elimination</option>
              </select>
            ) : (
              <p className="text-lg font-bold text-white">{tournament.format === 'double_elimination' ? 'Double Elimination' : 'Single Elimination'}</p>
            )}
          </div>
          {tournament.status === 'signups_open' && (
            <div>
              <p className="text-sm text-gray-400">Signup Deadline</p>
              {user.isStaff && editingDeadline ? (
                <div className="space-y-1">
                  <input
                    type="datetime-local"
                    value={deadlineDraft}
                    onChange={(e) => setDeadlineDraft(e.target.value)}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-white"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDeadline}
                      disabled={savingDeadline}
                      className="text-xs bg-gradient-to-r from-amber-200 to-yellow-500 text-gray-900 px-2 py-1 rounded font-bold"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingDeadline(false)}
                      disabled={savingDeadline}
                      className="text-xs border border-white text-white px-2 py-1 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-bold text-white">
                    {tournament.signupDeadline ? new Date(tournament.signupDeadline).toLocaleString() : 'None - starts manually'}
                  </p>
                  {user.isStaff && (
                    <button onClick={startEditingDeadline} className="text-xs text-gray-400 hover:text-white underline">
                      Edit
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {!tournament.startedAt && (
            <div>
              <p className="text-sm text-gray-400">Players</p>
              <p className="text-lg font-bold">{tournament.players.length}</p>
            </div>
          )}
          {tournament.startedAt && (
            <div>
              <p className="text-sm text-gray-400">Players Remaining</p>
              <p className="text-lg font-bold bg-gradient-to-r from-amber-200 to-yellow-500 bg-clip-text text-transparent">{getPlayersRemaining(tournament, matches).length}</p>
            </div>
          )}
          {tournament.prize && (
            <div>
              <p className="text-sm text-gray-400">Prize</p>
              <p className="text-lg font-bold text-white">🏆 {tournament.prize}</p>
            </div>
          )}
          {tournament.status === 'signups_open' && (
            <div>
              <p className="text-sm text-gray-400">Estimated Duration</p>
              <p className="text-lg font-bold text-white">
                {tournament.players.length >= 2
                  ? `${estimateTournamentDays(tournament.players.length, tournament.format)} days`
                  : 'Needs 2+ players'}
              </p>
            </div>
          )}
          {tournament.startedAt && !tournament.champion && (
            <div>
              <p className="text-sm text-gray-400">Est. Finish</p>
              <p className="text-lg font-bold text-white">Day {estimateTournamentDays(tournament.players.length, tournament.format)}</p>
            </div>
          )}
          {tournament.champion && (
            <div>
              <p className="text-sm text-gray-400">Champion</p>
              <button
                onClick={() => onViewProfile(tournament.champion)}
                className="text-lg font-bold text-amber-300 hover:underline flex items-center gap-1.5"
              >
                <img src="/badges/rainbow.png" alt="" className="w-5 h-5 object-contain" /> {tournament.champion}
              </button>
            </div>
          )}
        </div>
        {tournament.signupDeadline && tournament.status !== 'signups_open' && (
          <div className="mt-4 p-3 bg-gray-700 rounded">
            <p className="text-sm text-gray-400">Signup Deadline</p>
            <p className="text-white">{new Date(tournament.signupDeadline).toLocaleString()}</p>
          </div>
        )}
        </div>
      </div>

      {user.isStaff && matches.filter(m => m.status === 'disputed' || m.status === 'needs_staff_review').length > 0 && (
        <DisputeReview matches={matches} onResolveDispute={onResolveDispute} />
      )}

      {tournament.status === 'completed' && tournament.champion && (
        <TournamentResults tournament={tournament} onViewProfile={onViewProfile} />
      )}

      {tournament.status === 'completed' && <RewardCard tournament={tournament} user={user} />}
      {tournament.status === 'completed' && user.isStaff && <RewardsPanel tournament={tournament} matches={matches} />}

      {user.isStaff && tournament.status === 'in_progress' && (
        <RemovedPlayersCard tournament={tournament} onReinstatePlayer={onReinstatePlayer} onViewProfile={onViewProfile} />
      )}

      {tournament.status === 'signups_open' && (
        <RegisteredPlayersCard tournament={tournament} user={user} onViewProfile={onViewProfile} onRemovePlayer={onRemovePlayer} />
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">Bracket</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-sm border transition ${
              viewMode === 'list' ? 'border-amber-400 text-amber-300' : 'border-gray-600 text-gray-300 hover:border-white'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('bracket')}
            className={`px-3 py-1 rounded text-sm border transition ${
              viewMode === 'bracket' ? 'border-amber-400 text-amber-300' : 'border-gray-600 text-gray-300 hover:border-white'
            }`}
          >
            Bracket
          </button>
          <button
            onClick={() => setViewMode('remaining')}
            className={`px-3 py-1 rounded text-sm border transition ${
              viewMode === 'remaining' ? 'border-amber-400 text-amber-300' : 'border-gray-600 text-gray-300 hover:border-white'
            }`}
          >
            Players Remaining
          </button>
        </div>
      </div>

      {viewMode === 'list' && allDays.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {allDays.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`px-3 py-1 rounded text-sm border transition ${
                activeDay === d ? 'border-amber-400 text-amber-300' : 'border-gray-600 text-gray-300 hover:border-white'
              }`}
            >
              Day {d}
            </button>
          ))}
        </div>
      )}

      {viewMode === 'remaining' ? (
        <>
          {user.isStaff && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h2 className="text-xl font-bold mb-4">Players ({tournament.players.length})</h2>
              {tournament.players.length === 0 ? (
                <p className="text-gray-400 text-sm">No players yet</p>
              ) : (
                <div className="space-y-2">
                  {tournament.players.map(player => (
                    <div key={player} className="flex items-center justify-between bg-gray-700 rounded px-4 py-2">
                      <button onClick={() => onViewProfile(player)} className="hover:underline text-left">
                        {player}
                      </button>
                      <button
                        onClick={() => onRemovePlayer(tournament.id, player)}
                        className="border border-white text-white hover:bg-white hover:text-black px-3 py-1 rounded text-xs transition"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <PlayersRemainingView tournament={tournament} matches={matches} onViewProfile={onViewProfile} />
        </>
      ) : viewMode === 'bracket' ? (
        <BracketView matches={matches} rounds={rounds} isDoubleElim={isDoubleElim} bracketSize={tournament.bracketSize} />
      ) : isDoubleElim ? (
        bracketSections
          .filter(({ bracket, round }) => {
            const sectionMatches = matches.filter(m => m.bracket === bracket && m.round === round);
            return (sectionMatches[0]?.day ?? round) === activeDay;
          })
          .map(({ bracket, round }) => {
            const sectionMatches = matches.filter(m => m.bracket === bracket && m.round === round);
            const day = sectionMatches[0]?.day ?? round;
            const unlockTime = sectionMatches[0]?.unlockAt ?? getRoundUnlockTime(tournament, day);
            return (
            <div key={`${bracket}-${round}`} className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h2 className="text-xl font-bold">{sectionLabel({ bracket, round })}</h2>
                <RoundDayStatus round={day} unlockTime={unlockTime} totalDays={getGuaranteedDays(tournament)} />
              </div>
              <div className="space-y-3">
                {sectionMatches
                  .filter(match => !isByeMatch(match))
                  .map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      user={user}
                      tournament={tournament}
                      onSelectMatch={() => onSelectMatch(match.id)}
                      onPlayerReady={() => onPlayerReady(match.id)}
                      onFlagMatch={() => onFlagMatch(match.id)}
                      onViewProfile={onViewProfile}
                      onResolveDispute={onResolveDispute}
                      onChangeWinner={onChangeWinner}
                      onReopenMatch={onReopenMatch}
                    />
                  ))}
              </div>
              <ByeNote roundMatches={sectionMatches} />
            </div>
            );
          })
      ) : (
        rounds
          .filter((round) => round === activeDay)
          .map(round => {
            const roundMatches = matches.filter(m => m.round === round);
            const unlockTime = roundMatches[0]?.unlockAt ?? getRoundUnlockTime(tournament, round);
            return (
            <div key={round} className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h2 className="text-xl font-bold">Round {round}</h2>
                <RoundDayStatus round={round} unlockTime={unlockTime} totalDays={getGuaranteedDays(tournament)} />
              </div>
              <div className="space-y-3">
                {roundMatches
                  .filter(match => !isByeMatch(match))
                  .map(match => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      user={user}
                      tournament={tournament}
                      onSelectMatch={() => onSelectMatch(match.id)}
                      onPlayerReady={() => onPlayerReady(match.id)}
                      onFlagMatch={() => onFlagMatch(match.id)}
                      onViewProfile={onViewProfile}
                      onResolveDispute={onResolveDispute}
                      onChangeWinner={onChangeWinner}
                      onReopenMatch={onReopenMatch}
                    />
                  ))}
              </div>
              <ByeNote roundMatches={roundMatches} />
            </div>
            );
          })
      )}
    </div>
  );
}

// Everyone can see who has registered while signups are open (updates live as
// people join). Staff also get a Remove button here, since this is where they
// need it - the Players Remaining view is buried under the bracket controls.
// Staff: players taken out of a running tournament, with a way to undo it.
// Reinstating reopens the matches removal handed to their opponent, which is
// only safe until the next round exists (reinstatePlayer refuses after that).
function RemovedPlayersCard({ tournament, onReinstatePlayer, onViewProfile }) {
  const removed = tournament.removedPlayers || [];
  if (removed.length === 0) return null;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h2 className="text-xl font-bold mb-1">Removed players ({removed.length})</h2>
      <p className="text-sm text-gray-400 mb-4">
        Reinstating puts a player back and reopens the match their opponent was given. It only works until the next round is created.
      </p>
      <div className="space-y-2">
        {removed.map((player) => (
          <div key={player} className="flex items-center justify-between gap-3 bg-gray-700 rounded px-4 py-2">
            <button onClick={() => onViewProfile(player)} className="hover:underline text-left font-bold truncate">
              {player}
            </button>
            <button
              onClick={() => onReinstatePlayer(tournament.id, player)}
              className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-1 rounded text-xs transition shrink-0"
            >
              Reinstate
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegisteredPlayersCard({ tournament, user, onViewProfile, onRemovePlayer }) {
  const players = tournament.players || [];

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h2 className="text-xl font-bold mb-1">Registered players ({players.length})</h2>
      <p className="text-sm text-gray-400 mb-4">Everyone signed up so far, in the order they joined.</p>
      {players.length === 0 ? (
        <p className="text-gray-400 text-sm">No one has registered yet. Be the first!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {players.map((player, idx) => (
            <div key={player} className="flex items-center justify-between gap-3 bg-gray-700 rounded px-4 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-gray-400 text-sm w-7 shrink-0">{idx + 1}.</span>
                <button onClick={() => onViewProfile(player)} className="hover:underline text-left font-bold truncate">
                  {player}
                </button>
                {player === user.username && (
                  <span className="text-xs text-amber-300 border border-amber-400/60 rounded px-1.5 py-0.5 shrink-0">You</span>
                )}
              </div>
              {user.isStaff && (
                <button
                  onClick={() => onRemovePlayer(tournament.id, player)}
                  className="border border-white text-white hover:bg-white hover:text-black px-3 py-1 rounded text-xs transition shrink-0"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayersRemainingView({ tournament, matches, onViewProfile }) {
  const remaining = getPlayersRemaining(tournament, matches);
  const total = tournament.players.length;
  const stats = tournament.playerStats || {};

  const sorted = [...remaining].sort((a, b) => (stats[b]?.bestBuilderBaseTrophies || 0) - (stats[a]?.bestBuilderBaseTrophies || 0));

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h2 className="text-xl font-bold mb-4">
        {remaining.length} of {total} Players Remaining
      </h2>
      {sorted.length === 0 ? (
        <p className="text-gray-400 text-sm">No players remaining</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((player) => (
            <div key={player} className="flex items-center justify-between bg-gray-700 rounded px-4 py-2">
              <button onClick={() => onViewProfile(player)} className="hover:underline text-left font-bold flex items-center gap-1.5">
                {player === tournament.champion && <img src="/badges/rainbow.png" alt="" className="w-4 h-4 object-contain" />}
                {player}
              </button>
              {stats[player] && (
                <span className="text-sm text-gray-400">
                  {stats[player].tag && <span className="mr-3">{stats[player].tag}</span>}
                  🏆 {stats[player].bestBuilderBaseTrophies ?? 0}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Converts a stored UTC instant back into the "YYYY-MM-DDTHH:mm" shape an
// <input type="datetime-local"> expects, using the viewer's own local time -
// so the field always reads back exactly what it would show if you'd just
// picked "now" in that same timezone.
function toDatetimeLocalValue(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function buildStandings(tournament) {
  if (!tournament.placements) return [];

  const byPlace = {};
  for (const [player, place] of Object.entries(tournament.placements)) {
    (byPlace[place] ||= []).push(player);
  }

  return Object.entries(byPlace)
    .map(([place, players]) => ({ place: parseInt(place, 10), players }))
    .sort((a, b) => a.place - b.place);
}

// A player's own prize link. Only they and staff can read it (Firestore
// rules), and it works once, so it's shown only to the person it was given to.
function RewardCard({ tournament, user }) {
  const [reward, setReward] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribeToMyReward(tournament.id, user.username, setReward), [tournament.id, user.username]);

  if (!reward) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(reward.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert('Couldn\'t copy - open the link instead.');
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border-2 border-amber-400/50 p-6">
      <h2 className="text-xl font-bold mb-1">🎁 Your reward</h2>
      <p className="text-sm text-gray-300 mb-4">
        You finished {ordinal(reward.place)}. This link only works once, so don't share it.
      </p>
      <div className="flex gap-2 flex-wrap">
        <a
          href={reward.link}
          target="_blank"
          rel="noreferrer"
          className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-4 py-2 rounded transition"
        >
          Claim reward
        </a>
        <button onClick={copyLink} className="border border-gray-600 hover:border-white px-4 py-2 rounded transition">
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}

// Staff: paste the prize links, pick how many top finishers get one, send.
// The ranking is strict (see rankFinishers) so "top 10" is exactly ten
// players; the checkboxes are only there to override it. Links are
// interchangeable, so they're handed out in the order they're pasted.
const DELIVERY_LABELS = {
  dm_sent: 'DM sent',
  app_only: 'Not DMed - they can claim it in the app',
  pending: 'Sending...',
};

function RewardsPanel({ tournament, matches }) {
  const [rewards, setRewards] = useState({});
  const [linksText, setLinksText] = useState('');
  const [count, setCount] = useState(10);
  const [selected, setSelected] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => subscribeToRewards(tournament.id, setRewards), [tournament.id]);

  const ranking = rankFinishers(tournament.placements, matches);
  const hasReward = (username) => !!rewards[username.toLowerCase()];
  const top = ranking.slice(0, Math.max(count, 0));

  // Reset the selection to the top N whenever N (or what's already been
  // given out) changes; manual ticks apply until then.
  const rewardedKey = Object.keys(rewards).sort().join(',');
  useEffect(() => {
    setSelected(new Set(top.filter((r) => !hasReward(r.username)).map((r) => r.username)));
  }, [count, rewardedKey, ranking.length]);

  const links = linksText.split('\n').map((l) => l.trim()).filter(Boolean);
  const badLink = links.find((l) => !/^https?:\/\/\S+$/i.test(l));
  const duplicateLink = links.find((l, i) => links.indexOf(l) !== i);
  const chosen = ranking.filter((r) => selected.has(r.username));
  const ready = chosen.length > 0 && chosen.length === links.length && !badLink && !duplicateLink;

  let problem = '';
  if (links.length && badLink) problem = `That doesn't look like a link: ${badLink.slice(0, 50)}`;
  else if (duplicateLink) problem = 'The same link is in the list twice.';
  else if (chosen.length !== links.length) problem = `${chosen.length} player${chosen.length === 1 ? '' : 's'} selected but ${links.length} link${links.length === 1 ? '' : 's'} pasted - they need to match.`;

  const toggle = (username) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  };

  const send = async () => {
    if (!window.confirm(`Send ${chosen.length} reward link${chosen.length === 1 ? '' : 's'}? This can't be undone.`)) return;
    setSending(true);
    setError('');
    try {
      await dispenseRewards(tournament.id, chosen.map((r, i) => ({ username: r.username, link: links[i] })));
      setLinksText('');
    } catch (err) {
      setError(err.message || 'Something went wrong sending the rewards.');
    } finally {
      setSending(false);
    }
  };

  const sentCount = Object.keys(rewards).length;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold">🎁 Dispense rewards</h2>
        <p className="text-sm text-gray-400">
          Paste one link per line. The top finishers each get one by DM and in the app.
          {sentCount > 0 && ` ${sentCount} already sent.`}
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-300" htmlFor="reward-count">Top finishers:</label>
        <input
          id="reward-count"
          type="number"
          min="1"
          max={ranking.length || 1}
          value={count}
          onChange={(e) => setCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white"
        />
      </div>

      <textarea
        value={linksText}
        onChange={(e) => setLinksText(e.target.value)}
        rows={5}
        placeholder={'https://link.clashofclans.com/...\nhttps://link.clashofclans.com/...'}
        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-white font-mono"
      />

      <div className="space-y-1">
        {top.map((r, i) => {
          const given = rewards[r.username.toLowerCase()];
          return (
            <label key={r.username} className="flex items-center gap-3 bg-gray-700 rounded px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(r.username)}
                disabled={!!given}
                onChange={() => toggle(r.username)}
              />
              <span className="w-8 text-gray-400">{i + 1}.</span>
              <span className="font-bold text-white flex-1">{r.username}</span>
              <span className="text-xs text-gray-400">
                {given ? DELIVERY_LABELS[given.delivery] || 'Sent' : `${ordinal(r.place)} place${r.eliminatedBy ? ` · out to ${r.eliminatedBy}` : ''}`}
              </span>
            </label>
          );
        })}
      </div>

      <p className="text-xs text-gray-400">
        Players who were knocked out in the same round are ordered by who beat them: losing to a higher finisher ranks higher.
      </p>

      {(problem && linksText.trim()) && <p className="text-sm text-amber-300">{problem}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={send}
        disabled={!ready || sending}
        className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-4 py-2 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {sending ? 'Sending...' : `Send ${chosen.length || ''} reward${chosen.length === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}

function TournamentResults({ tournament, onViewProfile }) {
  const standings = buildStandings(tournament);

  return (
    <div className="bg-gray-800 rounded-lg border-2 border-amber-400/50 p-6">
      <div className="text-center mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Tournament Complete</p>
        <img src="/badges/rainbow.png" alt="" className="w-14 h-14 object-contain mx-auto mb-2" />
        <h2 className="text-2xl font-bold">
          <span className="bg-gradient-to-r from-amber-200 to-yellow-500 bg-clip-text text-transparent">{tournament.champion}</span> wins {tournament.name}!
        </h2>
      </div>
      <div className="space-y-2">
        {standings.map(({ place, players }) => (
          <div key={place} className="flex items-center justify-between bg-gray-700 rounded px-4 py-3">
            <span className="font-bold text-white flex items-center gap-2">
              {medalFor(place) && <img src={medalFor(place)} alt="" className="w-6 h-6 object-contain" />} {ordinal(place)} place
            </span>
            <span className="text-gray-200 space-x-2">
              {players.map((p, idx) => (
                <React.Fragment key={p}>
                  {idx > 0 && ', '}
                  <button onClick={() => onViewProfile(p)} className="hover:underline hover:text-white">
                    {p}
                  </button>
                </React.Fragment>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// A bye isn't a match anyone plays - the player just advances - so the round
// list hides those matches and names the players instead. With bracket
// padding (see seedDoubleEliminationBracket) a big field has many of them in
// round 1, which would otherwise bury the handful of real matches.
const isByeMatch = (m) => m.player1 === 'BYE' || m.player2 === 'BYE';
const byePlayersOf = (roundMatches) =>
  roundMatches.filter(isByeMatch).map((m) => (m.player1 === 'BYE' ? m.player2 : m.player1));

function ByeNote({ roundMatches }) {
  const names = byePlayersOf(roundMatches);
  if (!names.length) return null;
  return (
    <p className="text-sm text-gray-400 mt-3">
      Bye, advancing automatically ({names.length}): {names.join(', ')}
    </p>
  );
}

function BracketMatchBox({ match, placeholder: placeholderProp }) {
  // An empty seat (both sides a bye - two byes fed the same slot) isn't a
  // match anyone plays, so it's drawn like a not-yet-known slot.
  const placeholder = placeholderProp || (match?.player1 === 'BYE' && match?.player2 === 'BYE');
  return (
    <div className={`bg-gray-700 rounded border border-gray-600 p-2 text-sm space-y-1 ${placeholder ? 'opacity-50 border-dashed' : ''}`}>
      {[match?.player1, match?.player2].map((p, idx) => {
        const isWinner = match?.status === 'completed' && match.winner === p;
        return (
          <div
            key={idx}
            className={`flex justify-between items-center px-2 py-1 rounded ${
              isWinner ? 'bg-amber-200/20 border border-amber-400/50 text-amber-300 font-bold' : 'text-gray-300'
            }`}
          >
            <span>{p || 'TBD'}</span>
            {isWinner && <span>✓</span>}
          </div>
        );
      })}
    </div>
  );
}

// Rounds are created one at a time as the previous one finishes, so callers
// pass every round the bracket will have plus how many matches a not-yet-
// created round should show, and the rest of the bracket is drawn as empty
// TBD placeholders instead of only ever showing what exists so far.
//
// `zoom` scales the columns (CSS zoom, so the scroll width follows it), and
// whenever the focused day or the zoom changes the enclosing
// [data-bracket-scroll] box scrolls that day's column to the left edge - the
// bracket follows the tournament instead of leaving the current day
// off-screen at the far end of a wide row.
function BracketColumns({ matches, rounds, labelForRound, totalRounds, expectedMatchCount, focusRound, focusNonce, zoom = 1 }) {
  const maxRound = totalRounds ?? (rounds.length ? Math.max(...rounds) : 0);
  const innerRef = useRef(null);

  // The focused day may not exist in this section (a short losers bracket,
  // say), so land on the nearest round it does have.
  const target = focusRound == null || !rounds.length
    ? null
    : rounds.reduce((best, r) => (Math.abs(r - focusRound) < Math.abs(best - focusRound) ? r : best), rounds[0]);

  useEffect(() => {
    const inner = innerRef.current;
    const scroller = inner?.closest('[data-bracket-scroll]');
    const col = target != null && inner?.querySelector(`[data-round="${target}"]`);
    if (!scroller || !col) return;
    const delta = col.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    // 24 = the box's own left padding, so the column lines up with the title.
    scroller.scrollTo({ left: scroller.scrollLeft + delta - 24, behavior: 'smooth' });
  }, [target, zoom, focusNonce]);

  return (
    <div ref={innerRef} className="flex gap-8 min-w-max pb-2" style={{ zoom }}>
      {rounds.map(round => {
        const roundMatches = matches.filter(m => m.round === round);
        const expected = expectedMatchCount?.(round) ?? 0;
        // A round can be only partly built - a pair's next match is created
        // once both its matches are decided - so when some exist, show the
        // rest as empty slots in their bracket positions.
        const positions = roundMatches.map(matchPosition);
        const partlyBuilt = roundMatches.length > 0 && roundMatches.length < expected && positions.every((p) => p < expected);
        const placeholders = roundMatches.length === 0 ? expected : 0;
        return (
          <div key={round} data-round={round} className="flex flex-col justify-around gap-4 min-w-[220px]">
            <h3 className={`text-center font-bold mb-2 ${round === target ? 'text-amber-300' : 'text-gray-400'}`}>
              {labelForRound ? labelForRound(round, maxRound) : (round === maxRound ? `Day ${round} · Final` : `Day ${round}`)}
            </h3>
            {partlyBuilt
              ? Array.from({ length: expected }, (_, pos) => {
                  const match = roundMatches.find((m) => matchPosition(m) === pos);
                  return match ? <BracketMatchBox key={match.id} match={match} /> : <BracketMatchBox key={`tbd-${pos}`} placeholder />;
                })
              : roundMatches.map(match => <BracketMatchBox key={match.id} match={match} />)}
            {Array.from({ length: placeholders }, (_, i) => <BracketMatchBox key={`tbd-${i}`} placeholder />)}
          </div>
        );
      })}
    </div>
  );
}

// Single elimination doesn't store its bracket size, but every round halves
// (rounding up, an odd player gets a bye), so the full number of rounds falls
// out of how many matches round 1 has.
function singleElimTotalRounds(matches) {
  const roundOneMatches = matches.filter((m) => m.round === 1).length;
  return roundOneMatches ? 1 + Math.ceil(Math.log2(roundOneMatches)) : undefined;
}

// Every match yields one winner, so a round with c matches feeds ceil(c / 2)
// into the next one. Worked out from round 1, which always exists in full, so
// it stays right while a later round is only partly built.
function singleElimExpectedCount(matches, round) {
  const roundOne = matches.filter((m) => m.round === 1).length;
  return Math.ceil(roundOne / 2 ** (round - 1));
}

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

const BRACKET_ZOOM_DEFAULT = 1.25;
const BRACKET_ZOOM_MIN = 0.4;
const BRACKET_ZOOM_MAX = 2;

function BracketView({ matches, rounds, isDoubleElim, bracketSize }) {
  const [zoom, setZoom] = useState(BRACKET_ZOOM_DEFAULT);
  const [focusNonce, setFocusNonce] = useState(0);
  const rootRef = useRef(null);

  // The current day is the earliest one that still has an undecided match,
  // or the last day once everything is done.
  const dayOf = (m) => m.day ?? m.round;
  const undecided = matches.filter((m) => m.status !== 'completed');
  const currentDay = undecided.length
    ? Math.min(...undecided.map(dayOf))
    : Math.max(1, ...matches.map(dayOf));

  const clampZoom = (z) => Math.min(BRACKET_ZOOM_MAX, Math.max(BRACKET_ZOOM_MIN, z));
  const stepZoom = (delta) => setZoom((z) => clampZoom(Math.round((z + delta) * 100) / 100));
  const resetToCurrentDay = () => { setZoom(BRACKET_ZOOM_DEFAULT); setFocusNonce((n) => n + 1); };
  // Shrinks until the widest section fits its box, never zooming in past 100%.
  const fitWholeBracket = () => {
    const scrollers = rootRef.current?.querySelectorAll('[data-bracket-scroll]') || [];
    let fit = 1;
    scrollers.forEach((el) => {
      // scrollWidth/clientWidth include the box's 24px side padding on each side.
      const contentWidth = el.scrollWidth - 48;
      if (contentWidth > 0) fit = Math.min(fit, zoom * ((el.clientWidth - 48) / contentWidth));
    });
    setZoom(clampZoom(Math.floor(fit * 100) / 100));
  };

  const controls = (
    <div className="flex items-center gap-2 flex-wrap text-sm">
      <button onClick={() => stepZoom(-0.25)} className="border border-gray-600 hover:border-white rounded w-8 h-8 flex items-center justify-center transition" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
      <span className="text-gray-300 w-12 text-center">{Math.round(zoom * 100)}%</span>
      <button onClick={() => stepZoom(0.25)} className="border border-gray-600 hover:border-white rounded w-8 h-8 flex items-center justify-center transition" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
      <button onClick={fitWholeBracket} className="border border-gray-600 hover:border-white rounded px-3 h-8 transition">Fit whole bracket</button>
      <button onClick={resetToCurrentDay} className="border border-amber-400 text-amber-300 rounded px-3 h-8 transition">Current day</button>
    </div>
  );

  if (isDoubleElim) {
    const size = bracketSize || 2;
    const k = Math.round(Math.log2(size));
    const totalLbRounds = Math.max(2 * (k - 1), 1);

    const wbMatches = matches.filter(m => m.bracket === 'winners');
    const lbMatches = matches.filter(m => m.bracket === 'losers');
    const gfMatches = matches.filter(m => m.bracket === 'grand_final');
    // Losers rounds come in pairs of equal size (a drop-in round, then a
    // consolidation round), each pair half the size of the last.
    const lbExpected = (r) => Math.max(1, size / 2 ** (Math.floor((r + 1) / 2) + 1));
    // Bracket reset only happens if the losers-bracket finalist wins game
    // one, so only game one is ever drawn ahead of time.
    const gfRounds = [...new Set([1, ...gfMatches.map(m => m.round)])].sort((a, b) => a - b);

    return (
      <div ref={rootRef} className="space-y-6">
        {controls}
        <div data-bracket-scroll className="bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-x-auto">
          <h3 className="font-bold mb-4">Winners Bracket</h3>
          <BracketColumns
            matches={wbMatches}
            rounds={range(k)}
            expectedMatchCount={(r) => size / 2 ** r}
            labelForRound={(r) => (r === k ? `Day ${r} · Winners Final` : `Day ${r}`)}
            focusRound={currentDay}
            focusNonce={focusNonce}
            zoom={zoom}
          />
        </div>
        <div data-bracket-scroll className="bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-x-auto">
          <h3 className="font-bold mb-4">Losers Bracket</h3>
          <BracketColumns
            matches={lbMatches}
            rounds={range(totalLbRounds)}
            expectedMatchCount={lbExpected}
            labelForRound={(r) => (r === totalLbRounds ? `Day ${r} · Losers Final` : `Day ${r}`)}
            focusRound={currentDay}
            focusNonce={focusNonce}
            zoom={zoom}
          />
        </div>
        <div data-bracket-scroll className="bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-x-auto">
          <h3 className="font-bold mb-4">Grand Final</h3>
          <BracketColumns
            matches={gfMatches}
            rounds={gfRounds}
            expectedMatchCount={() => 1}
            labelForRound={(r) => (r === 1 ? 'Game 1' : 'Bracket Reset')}
            zoom={zoom}
          />
        </div>
      </div>
    );
  }

  const totalRounds = singleElimTotalRounds(matches);
  return (
    <div ref={rootRef} className="space-y-4">
      {controls}
      <div data-bracket-scroll className="bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-x-auto">
        <BracketColumns
          matches={matches}
          rounds={totalRounds ? range(totalRounds) : rounds}
          totalRounds={totalRounds}
          expectedMatchCount={(r) => singleElimExpectedCount(matches, r)}
          focusRound={currentDay}
          focusNonce={focusNonce}
          zoom={zoom}
        />
      </div>
    </div>
  );
}

// The game's clock icon, sized to sit in a line of text like the emoji it
// replaces.
function ClockIcon() {
  return <img src="/icons/clock.png" alt="" className="inline-block w-[1.3em] h-[1.3em] align-[-0.3em] mr-1" />;
}

function RoundUnlockCountdown({ unlockTime }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const remaining = unlockTime - now;
  if (remaining <= 0) return <span className="text-white font-bold">Live</span>;
  return <span className="text-gray-300">Unlocks in {formatCountdown(remaining)}</span>;
}

// `unlockTime` comes from the round's own matches (their unlockAt, set once
// at creation) rather than a schedule computed from tournament start - a
// round that hasn't been created yet has no unlockTime and simply isn't
// shown, instead of guessing when it "should" arrive. A live day still knows
// when the next one opens, though: days end at noon Central, so that's
// dayEndsAt(this day's unlockTime).
function RoundDayStatus({ round, unlockTime, totalDays }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const isLive = unlockTime && now >= unlockTime;
  const nextDayAt = unlockTime && dayEndsAt(unlockTime);
  const hasNextDay = totalDays && round < totalDays;

  return (
    <span className="text-sm text-gray-400">
      Day {round}
      {unlockTime && <> — <RoundUnlockCountdown unlockTime={unlockTime} /></>}
      {isLive && hasNextDay && (
        <>
          {' · '}
          {nextDayAt > now
            ? <>Day {round + 1} unlocks in <span className="text-gray-300">{formatCountdown(nextDayAt - now)}</span></>
            : `Day ${round + 1} unlocks once every match is decided`}
        </>
      )}
    </span>
  );
}

// Shared across every mounted card so the same player's tag is only ever
// fetched once per session, no matter how many matches they appear in -
// collapsed rounds don't mount their cards at all, so in practice this only
// ever fetches for whichever round is actually expanded.
const liveStatsCache = new Map();
const liveStatsInFlight = new Map();

function useLiveClashStats(tag) {
  const [stats, setStats] = useState(() => (tag ? liveStatsCache.get(tag) : undefined));

  useEffect(() => {
    if (!tag || tag === 'BYE') {
      setStats(undefined);
      return;
    }
    if (liveStatsCache.has(tag)) {
      setStats(liveStatsCache.get(tag));
      return;
    }
    let cancelled = false;
    const promise = liveStatsInFlight.get(tag) || fetchClashPlayerData(tag).then((data) => {
      liveStatsCache.set(tag, data);
      liveStatsInFlight.delete(tag);
      return data;
    });
    liveStatsInFlight.set(tag, promise);
    promise.then((data) => { if (!cancelled) setStats(data); });
    return () => { cancelled = true; };
  }, [tag]);

  return stats;
}

// Only called for players Supercell reports a Builder Base best season for
// (see the callers): the rank when it has one, else that season's trophies.
function formatBestSeason(stats) {
  const season = stats.bestSeasonId ? ` (${stats.bestSeasonId})` : '';
  if (stats.bestSeasonRank != null) return `#${stats.bestSeasonRank}${season}`;
  return `${stats.bestSeasonTrophies} trophies${season}`;
}

// Global live rank isn't something Supercell's API exposes (only a
// per-country leaderboard, and only an all-time best-season rank) - best
// season rank is the closest real substitute for "how good is this player,
// globally", so that's what shows here instead of a live global rank.
function PlayerStatStrip({ tag }) {
  const stats = useLiveClashStats(tag);
  if (!tag || tag === 'BYE') return null;
  if (!stats) return null;

  const leagueIcon = getLeagueIconUrl(stats.builderBaseLeague);

  return (
    <div className="text-xs text-gray-400 mt-1 space-y-0.5">
      <div className="flex items-center gap-1">
        {leagueIcon ? <img src={leagueIcon} alt="" className="w-4 h-4" /> : <span>🏆</span>}
        <span>{stats.builderBaseTrophies}{stats.builderBaseLeague ? ` · ${stats.builderBaseLeague}` : ''}</span>
      </div>
      {stats.clanName && (
        <div className="flex items-center gap-1">
          {stats.clanBadgeUrl && <img src={stats.clanBadgeUrl} alt="" className="w-4 h-4" />}
          <span>{stats.clanName}</span>
        </div>
      )}
      {(stats.bestSeasonRank != null || stats.bestSeasonTrophies != null) && (
        <div>🌍 Best Builder Base Season: {formatBestSeason(stats)}</div>
      )}
    </div>
  );
}

function MatchCard({ match, user, tournament, onSelectMatch, onPlayerReady, onFlagMatch, onViewProfile, onResolveDispute, onChangeWinner, onReopenMatch }) {
  const userIsPlayer = match.player1 === user.username || match.player2 === user.username;
  const userVote = match.player1 === user.username ? match.winner1Vote : match.winner2Vote;
  const userReady = match.player1 === user.username ? match.player1Ready : match.player2Ready;
  const timeDisplay = getTimeRemainingDisplay(match.scheduledStartTime);
  const unlockTime = match.unlockAt ?? getRoundUnlockTime(tournament, match.day ?? match.round);
  const roundLocked = unlockTime && Date.now() < unlockTime;
  const [forcingWinner, setForcingWinner] = useState(false);
  const [changingResult, setChangingResult] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const isPlayer1Winner = match.status === 'completed' && !!match.winner && match.winner === match.player1;
  const isPlayer2Winner = match.status === 'completed' && !!match.winner && match.winner === match.player2;

  const handleForceWinner = (winner) => {
    if (!window.confirm(`Force ${winner} as the winner of this match? This immediately completes it.`)) return;
    onResolveDispute(match.id, winner);
    setForcingWinner(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-neutral-900 border border-neutral-700';
      case 'disputed':
        return 'bg-neutral-900 border-2 border-white';
      case 'active':
        return 'bg-neutral-800 border border-white';
      case 'scheduled':
        return 'bg-neutral-900 border border-neutral-600';
      case 'waiting_for_opponent':
        return 'bg-neutral-900 border border-neutral-700';
      default:
        return 'bg-gray-700';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'disputed':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className={`${getStatusColor(match.status)} rounded p-4 flex items-center justify-between flex-wrap gap-4`}>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className={isPlayer1Winner ? 'bg-amber-400/10 border border-amber-400/40 rounded px-2 py-1' : isPlayer2Winner ? 'opacity-60' : ''}>
            <button onClick={() => onViewProfile(match.player1)} className={`font-bold hover:underline ${isPlayer1Winner ? 'text-amber-300' : ''}`}>
              {isPlayer1Winner && '🏆 '}{match.player1}
            </button>
            <div className={`text-xs ${isPlayer1Winner ? 'text-amber-300/70' : 'text-gray-400'}`}>{match.player1Tag}</div>
            {match.player1Ready && match.status === 'pending' && <div className="text-xs text-green-400 font-bold">✓ Ready</div>}
            <PlayerStatStrip tag={match.player1Tag} />
          </div>
          <span className="text-gray-400">vs</span>
          <div className={isPlayer2Winner ? 'bg-amber-400/10 border border-amber-400/40 rounded px-2 py-1' : isPlayer1Winner ? 'opacity-60' : ''}>
            <button onClick={() => onViewProfile(match.player2)} className={`font-bold hover:underline ${isPlayer2Winner ? 'text-amber-300' : ''}`} disabled={match.player2 === 'BYE'}>
              {isPlayer2Winner && '🏆 '}{match.player2}
            </button>
            <div className={`text-xs ${isPlayer2Winner ? 'text-amber-300/70' : 'text-gray-400'}`}>{match.player2Tag}</div>
            {match.player2Ready && match.status === 'pending' && <div className="text-xs text-green-400 font-bold">✓ Ready</div>}
            <PlayerStatStrip tag={match.player2Tag} />
          </div>
          {getStatusIcon(match.status)}
        </div>
        <div className="text-sm text-gray-300 mt-2">
          {match.status === 'pending' && (
            <p className={match.player1Ready && match.player2Ready ? 'text-green-400 font-bold' : 'text-white'}>
              {match.player1Ready && match.player2Ready ? <><ClockIcon />Both players ready! Match will start soon.</> : 'Waiting for both players to confirm ready...'}
            </p>
          )}
          {match.status === 'scheduled' && (
            <p className="text-white">Match scheduled - coordinate timing with opponent</p>
          )}
          {match.status === 'active' && (
            <p className="text-white">🎮 Match is LIVE - Play now in-game and report results</p>
          )}
          {match.status === 'completed' && match.resolvedReason === 'mutual_no_show' ? (
            <p className="text-white">⚠️ Both players disqualified — neither reported a result</p>
          ) : match.status === 'completed' && match.resolvedReason === 'grace_period' ? (
            <p className="text-white">🕊️ Neither player reported — both advance under a one-time grace period</p>
          ) : match.status === 'completed' && (match.resolvedReason === 'opponent_timeout' || match.resolvedReason === 'opponent_no_show' || match.resolvedReason === 'staff_override') && (
            <p className="text-xs text-gray-400">
              {match.resolvedReason === 'opponent_timeout' && 'Opponent unresponsive'}
              {match.resolvedReason === 'opponent_no_show' && 'Opponent never readied up'}
              {match.resolvedReason === 'staff_override' && 'Set by staff'}
            </p>
          )}
          {match.status === 'disputed' && (
            <p className="text-white">Disputed • {match.player1} voted: {match.winner1Vote} · {match.player2} voted: {match.winner2Vote}</p>
          )}
          {match.status === 'waiting_for_opponent' && userIsPlayer && userVote && (
            <>
              <p>You voted for: <span className="text-white font-bold">{userVote}</span></p>
              <div className="text-xs text-white mt-1">
                📸 Screenshot submitted
              </div>
              <p className="text-xs text-gray-400 mt-1">Waiting for opponent...</p>
            </>
          )}
          {match.status === 'waiting_for_opponent' && userIsPlayer && !userVote && (
            <p className="text-white">Your opponent has reported a result — submit yours to confirm or dispute it.</p>
          )}
          {(match.status === 'active' || match.status === 'scheduled' || match.status === 'waiting_for_opponent') && match.scheduledStartTime && (
            <div className={`text-xs mt-2 ${timeDisplay?.color || 'text-gray-400'}`}>
              <ClockIcon />Time remaining: {timeDisplay?.text}
              {match.resolvedReason === 'no_report_timeout' && ' (Needs staff review - no reports submitted)'}
              {match.resolvedReason === 'opponent_timeout' && ' (Auto-resolved - opponent unresponsive)'}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 ml-4 flex-wrap">
        <button
          onClick={() => setShowDetails(true)}
          className="border border-gray-600 text-gray-300 hover:border-white hover:text-white px-3 py-2 rounded text-sm transition"
          title="View match overview"
        >
          🔍 Details
        </button>
        {showDetails && (
          <MatchDetailModal match={match} tournament={tournament} onClose={() => setShowDetails(false)} onViewProfile={onViewProfile} isStaff={user.isStaff} user={user} />
        )}
        {userIsPlayer && match.status !== 'completed' && (
          <button
            onClick={onSelectMatch}
            className="border border-white text-white hover:bg-white hover:text-black px-3 py-2 rounded text-sm transition"
          >
            💬 Coordinate Match
          </button>
        )}
        {userIsPlayer && match.status === 'pending' && !userReady && roundLocked && (
          <div className="text-xs text-gray-400 text-right">
            🔒 Day {match.day ?? match.round}<br /><RoundUnlockCountdown unlockTime={unlockTime} />
          </div>
        )}
        {userIsPlayer && match.status === 'pending' && !userReady && !roundLocked && (
          <button
            onClick={onPlayerReady}
            className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-4 py-2 rounded text-sm transition"
          >
            I'm Ready
          </button>
        )}
        {userIsPlayer && match.status === 'pending' && userReady && (
          <div className="text-sm text-green-400 font-bold">✓ You're Ready</div>
        )}
        {userIsPlayer && !userVote && ['active', 'scheduled', 'waiting_for_opponent'].includes(match.status) && (
          <button
            onClick={onSelectMatch}
            className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-4 py-2 rounded text-sm transition"
          >
            Report Result
          </button>
        )}
        {userIsPlayer && userVote && match.status !== 'completed' && match.status !== 'disputed' && (
          <div className="text-sm text-white">Waiting for opponent...</div>
        )}
        {userIsPlayer && ['active', 'scheduled', 'waiting_for_opponent'].includes(match.status) && (
          <button
            onClick={onFlagMatch}
            className="border border-white text-white hover:bg-white hover:text-black px-3 py-2 rounded text-sm transition"
            title="Report issue to staff"
          >
            🚩 Flag
          </button>
        )}
        {user.isStaff && match.status === 'completed' && ['staff_override', 'opponent_no_show'].includes(match.resolvedReason) && match.player2 !== 'BYE' && (
          changingResult ? (
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-xs text-gray-400">Wrong call?</span>
              <button
                onClick={() => {
                  const other = match.winner === match.player1 ? match.player2 : match.player1;
                  if (window.confirm(`Change the winner from ${match.winner} to ${other}?`)) onChangeWinner(match.id, other);
                  setChangingResult(false);
                }}
                className="text-xs border border-white text-white hover:bg-white hover:text-black px-2 py-1 rounded transition"
              >
                Switch winner to {match.winner === match.player1 ? match.player2 : match.player1}
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Reopen this match so it can be decided again?')) onReopenMatch(match.id);
                  setChangingResult(false);
                }}
                className="text-xs border border-white text-white hover:bg-white hover:text-black px-2 py-1 rounded transition"
              >
                Reopen match
              </button>
              <button onClick={() => setChangingResult(false)} className="text-xs text-gray-400 hover:text-white">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setChangingResult(true)}
              className="border border-neutral-600 text-neutral-400 hover:border-white hover:text-white px-3 py-2 rounded text-sm transition"
              title="This result was decided by staff or by an automatic no-show forfeit - change it"
            >
              ✏️ Change result
            </button>
          )
        )}
        {user.isStaff && match.status !== 'completed' && match.player2 !== 'BYE' && (
          forcingWinner ? (
            <div className="flex gap-2 items-center flex-wrap">
              <span className="text-xs text-gray-400">Force winner:</span>
              <button
                onClick={() => handleForceWinner(match.player1)}
                className="text-xs border border-white text-white hover:bg-white hover:text-black px-2 py-1 rounded transition"
              >
                {match.player1}
              </button>
              <button
                onClick={() => handleForceWinner(match.player2)}
                className="text-xs border border-white text-white hover:bg-white hover:text-black px-2 py-1 rounded transition"
              >
                {match.player2}
              </button>
              <button
                onClick={() => setForcingWinner(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setForcingWinner(true)}
              className="border border-neutral-600 text-neutral-400 hover:border-white hover:text-white px-3 py-2 rounded text-sm transition"
              title="Manually pick a winner, bypassing ready-up/reporting"
            >
              ⚙️ Force Winner
            </button>
          )
        )}
      </div>
    </div>
  );
}

function MatchDetailPlayerCard({ name, tag, stats, ready, readyTime, vote, isWinner, isPending, onViewProfile }) {
  return (
    <div className="flex-1 bg-gray-700 rounded p-4">
      <button
        onClick={() => onViewProfile(name)}
        className="font-bold text-lg hover:underline text-left disabled:no-underline disabled:cursor-default"
        disabled={name === 'BYE'}
      >
        {isWinner && '🏆 '}
        {name || 'TBD'}
      </button>
      {tag && <div className="text-xs text-gray-400 mt-1">{tag}</div>}
      {stats?.bestBuilderBaseTrophies != null && (
        <div className="text-xs text-gray-400">🏆 {stats.bestBuilderBaseTrophies} trophies</div>
      )}
      <PlayerStatStrip tag={tag} />
      {isPending && (
        <div className={`text-xs mt-2 ${ready ? 'text-green-400 font-bold' : 'text-gray-400'}`}>
          {ready ? `✓ Ready${readyTime ? ` at ${new Date(readyTime).toLocaleString()}` : ''}` : 'Not ready yet'}
        </div>
      )}
      {vote && <div className="text-xs mt-2 text-white">Voted: {vote}</div>}
    </div>
  );
}

// A spectator-friendly overview of a single match - readable by anyone
// (unlike MatchPage, which is the participant-only coordinate/report flow),
// so people can check on any match's status, timing, and proof without
// needing to be one of the two players in it.
// Staff-only, read-only view of a match's chat, to help judge disputes and who
// should advance (players' chat is otherwise private to the two of them, and
// Firestore rules only let those two and staff read it). Only subscribes
// once opened, so a long list of matches doesn't open a listener per match.
function MatchChatHistory({ match }) {
  const [messages, setMessages] = useState(null);

  useEffect(() => subscribeToMatchMessages(match.tournamentId, match.id, setMessages), [match.tournamentId, match.id]);

  return <ChatHistoryList match={match} messages={messages} />;
}

function ChatHistoryList({ match, messages }) {
  return (
    <div className="mt-2 bg-gray-900 rounded p-3 max-h-64 overflow-y-auto space-y-3">
      {messages === null ? (
        <p className="text-sm text-gray-400">Loading chat...</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-gray-400">No messages were sent in this match.</p>
      ) : (
        messages.map((msg, idx) => (
          <div key={idx} className="text-sm">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`font-bold ${msg.sender === match.player1 ? 'text-amber-300' : msg.sender === match.player2 ? 'text-sky-300' : 'text-white'}`}>
                {msg.sender}
              </span>
              <span className="text-xs text-gray-500">{new Date(msg.timestamp).toLocaleString()}</span>
            </div>
            <div className="text-gray-200 whitespace-pre-wrap break-words">{msg.text}</div>
          </div>
        ))
      )}
    </div>
  );
}

function StaffChatToggle({ match }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white px-3 py-1 rounded transition"
      >
        {open ? 'Hide chat history' : '💬 View chat history'}
      </button>
      {open && <MatchChatHistory match={match} />}
    </div>
  );
}

// A rough win-chance estimate from the two players' trophies (see winChance
// in utils.js for how it's worked out and why it's only a guide). Only shown
// before a match is decided, and only when both players' trophies are known.
function WinChance({ match }) {
  const live1 = useLiveClashStats(match.player1Tag);
  const live2 = useLiveClashStats(match.player2Tag);
  const chance = winChance(trophiesFor(live1, match.player1Stats), trophiesFor(live2, match.player2Stats));
  if (chance == null) return null;
  const p1 = Math.round(chance * 100);
  const p2 = 100 - p1;

  return (
    <div className="mt-4 p-3 bg-gray-900 rounded">
      <div className="flex justify-between text-sm font-bold mb-1">
        <span className="text-amber-300">{match.player1} {p1}%</span>
        <span className="text-sky-300">{p2}% {match.player2}</span>
      </div>
      <div className="flex h-2 rounded overflow-hidden bg-gray-700">
        <div className="bg-amber-300" style={{ width: `${p1}%` }} />
        <div className="bg-sky-300" style={{ width: `${p2}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Win chance estimate from trophies. It's a rough guide, not a guarantee - anyone can win.
      </p>
    </div>
  );
}

// Anyone except the two players can pick who they think will win, until the
// match starts. Scoring happens on the server once there's a result.
function MatchPrediction({ match, user }) {
  const [predictions, setPredictions] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeToMatchPredictions(match.tournamentId, match.id, setPredictions), [match.tournamentId, match.id]);

  const isPlayer = user.username === match.player1 || user.username === match.player2;
  if (isPlayer || match.player1 === 'BYE' || match.player2 === 'BYE' || predictions === null) return null;

  const mine = predictions.find((p) => p.id === user.uid);
  const open = match.status === 'pending';
  const votesFor = (name) => predictions.filter((p) => p.pick === name).length;
  const total = predictions.length;
  if (!open && total === 0) return null;

  const pick = async (name) => {
    setSaving(true);
    try {
      await submitPrediction(match, user, name);
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const percent = (name) => (total ? Math.round((votesFor(name) / total) * 100) : 0);
  const decided = match.status === 'completed' && match.winner && !['player_removed', 'mutual_no_show', 'grace_period'].includes(match.resolvedReason);

  return (
    <div className="mt-4 p-3 bg-gray-900 rounded">
      <p className="text-sm font-bold mb-2">🔮 Who will win?</p>
      {open ? (
        <>
          <div className="flex gap-2">
            {[match.player1, match.player2].map((name) => (
              <button
                key={name}
                onClick={() => pick(name)}
                disabled={saving}
                className={`flex-1 px-3 py-2 rounded text-sm font-bold border transition disabled:opacity-50 ${
                  mine?.pick === name ? 'border-amber-400 text-amber-300 bg-amber-200/10' : 'border-gray-600 hover:border-white'
                }`}
              >
                {mine?.pick === name ? '✓ ' : ''}{name}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {mine ? 'You can change your pick until the match starts.' : 'Pick before the match starts. Every correct pick is a point on the leaderboard.'}
          </p>
        </>
      ) : mine ? (
        <p className="text-sm">
          You picked <span className="font-bold">{mine.pick}</span>
          {decided && (mine.pick === match.winner ? <span className="text-green-400 font-bold"> - correct! ✓</span> : <span className="text-gray-400"> - not this time</span>)}
        </p>
      ) : (
        <p className="text-sm text-gray-400">Predictions for this match are closed.</p>
      )}
      {(mine || !open) && total > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {total} vote{total === 1 ? '' : 's'}: {match.player1} {percent(match.player1)}% · {match.player2} {percent(match.player2)}%
        </p>
      )}
    </div>
  );
}

function MatchDetailModal({ match, tournament, onClose, onViewProfile, isStaff, user }) {
  const [screenshotUrls, setScreenshotUrls] = useState({ player1: [], player2: [] });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      Promise.all((match.player1ScreenshotPaths || []).map((p) => getScreenshotUrl(p))),
      Promise.all((match.player2ScreenshotPaths || []).map((p) => getScreenshotUrl(p))),
    ]).then(([player1, player2]) => {
      if (!cancelled) setScreenshotUrls({ player1, player2 });
    });
    return () => { cancelled = true; };
  }, [match.id, match.player1ScreenshotPaths, match.player2ScreenshotPaths]);

  const formatStatus = (status) =>
    status.replace(/_/g, ' ').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const resultExplanation = () => {
    if (match.status !== 'completed') return null;
    if (match.resolvedReason === 'mutual_no_show') return 'Both players disqualified — neither reported a result.';
    if (match.resolvedReason === 'grace_period') return 'Neither player reported — both advanced under a one-time grace period.';
    const reasons = {
      opponent_timeout: 'opponent unresponsive after voting closed',
      opponent_no_show: 'opponent never readied up',
      staff_override: 'set manually by staff',
    };
    if (!match.winner) return null;
    const suffix = reasons[match.resolvedReason] ? ` (${reasons[match.resolvedReason]})` : '';
    return `${match.winner} won${suffix}.`;
  };

  const renderPlayer = (name, tag, stats, ready, readyTime, vote) => (
    <MatchDetailPlayerCard
      name={name}
      tag={tag}
      stats={stats}
      ready={ready}
      readyTime={readyTime}
      vote={vote}
      isWinner={match.status === 'completed' && match.winner === name}
      isPending={match.status === 'pending'}
      onViewProfile={onViewProfile}
    />
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Match Overview</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="text-sm text-gray-400 mb-4">
          {tournament.format === 'double_elimination' && match.bracket && (
            <span className="capitalize">{match.bracket.replace('_', ' ')} bracket • </span>
          )}
          Round {match.round} • <span className="text-white">{formatStatus(match.status)}</span>
        </div>

        <div className="flex gap-3 items-stretch">
          {renderPlayer(match.player1, match.player1Tag, match.player1Stats, match.player1Ready, match.player1ReadyTime, match.winner1Vote)}
          <div className="flex items-center text-gray-400 font-bold">vs</div>
          {renderPlayer(match.player2, match.player2Tag, match.player2Stats, match.player2Ready, match.player2ReadyTime, match.winner2Vote)}
        </div>

        {match.status !== 'completed' && match.player1 && match.player2 && match.player1 !== 'BYE' && match.player2 !== 'BYE' && (
          <WinChance match={match} />
        )}

        <MatchPrediction match={match} user={user} />

        {resultExplanation() && (
          <div className="mt-4 p-3 bg-neutral-900 border border-neutral-700 rounded text-sm text-white">
            {resultExplanation()}
          </div>
        )}

        {(match.scheduledStartTime || match.completedAt || match.timeoutAt) && (
          <div className="mt-4 text-xs text-gray-400 space-y-1">
            {match.scheduledStartTime && <p>Scheduled: {new Date(match.scheduledStartTime).toLocaleString()}</p>}
            {match.completedAt && <p>Completed: {new Date(match.completedAt).toLocaleString()}</p>}
            {match.timeoutAt && <p>Flagged to staff: {new Date(match.timeoutAt).toLocaleString()}</p>}
          </div>
        )}

        {(screenshotUrls.player1.length > 0 || screenshotUrls.player2.length > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-sm font-medium mb-2">📸 Proof Screenshots</p>
            {screenshotUrls.player1.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-gray-400 mb-1">{match.player1}</p>
                <div className="flex flex-wrap gap-2">
                  {screenshotUrls.player1.map((url, idx) => (
                    <img key={idx} src={url} alt="" className="max-h-48 rounded border border-gray-600" />
                  ))}
                </div>
              </div>
            )}
            {screenshotUrls.player2.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1">{match.player2}</p>
                <div className="flex flex-wrap gap-2">
                  {screenshotUrls.player2.map((url, idx) => (
                    <img key={idx} src={url} alt="" className="max-h-48 rounded border border-gray-600" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {isStaff && match.player1 && match.player2 && match.player2 !== 'BYE' && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-sm font-medium">Staff: match chat</p>
            <StaffChatToggle match={match} />
          </div>
        )}

        <button onClick={onClose} className="w-full mt-6 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition">
          Close
        </button>
      </div>
    </div>
  );
}

const MAX_SCREENSHOTS = 5;

function MatchPage({ match, user, onReportWinner, onCancel }) {
  const [selectedWinner, setSelectedWinner] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    if (!match) return;
    return subscribeToMatchMessages(match.tournamentId, match.id, setMessages);
  }, [match?.tournamentId, match?.id]);

  if (!match) {
    return (
      <div className="text-center">
        <p className="text-gray-400">Match not found</p>
      </div>
    );
  }

  const opponent = match.player1 === user.username ? match.player2 : match.player1;
  const timeDisplay = getTimeRemainingDisplay(match.scheduledStartTime);
  const userVote = match.player1 === user.username ? match.winner1Vote : match.winner2Vote;

  const handleSendMessage = () => {
    if (messageText.trim()) {
      sendMatchMessage(match.tournamentId, match.id, user.username, messageText.trim());
      setMessageText('');
    }
  };

  const handleScreenshotUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const combined = [...screenshots, ...files].slice(0, MAX_SCREENSHOTS);
    setScreenshots(combined);
    setScreenshotPreviews(combined.map((f) => URL.createObjectURL(f)));
    e.target.value = '';
  };

  const handleRemoveScreenshot = (index) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
    setScreenshotPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReportWinner = (winner) => {
    if (screenshots.length === 0) {
      alert('Please upload at least one screenshot before reporting');
      return;
    }

    const confirmed = window.confirm(
      `Confirm: ${winner} won this match?\n\nSubmitting a false result will result in immediate removal from this tournament and a ban from future tournaments.`
    );
    if (!confirmed) return;

    setSelectedWinner(winner);
    setTimeout(async () => {
      try {
        await onReportWinner(winner, screenshots);
      } catch (err) {
        setSelectedWinner(null);
        alert(err.message);
      }
    }, 500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-6 flex flex-col">
        <h2 className="text-xl font-bold mb-4">Match Chat</h2>
        <div className="flex-1 mb-4 bg-gray-700 rounded p-4 overflow-y-auto space-y-3 max-h-96">
          {messages.length === 0 ? (
            <p className="text-gray-400 text-center text-sm mt-20">
              Chat with your opponent here. Coordinate match timing, discuss results, etc.
            </p>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`text-sm ${msg.sender === user.username ? 'text-right' : ''}`}>
                <span className="font-bold">{msg.sender}</span>
                <div className={`mt-1 ${msg.sender === user.username ? 'text-white' : 'text-gray-300'}`}>
                  {msg.text}
                </div>
                <div className="text-xs text-gray-500 mt-1">{new Date(msg.timestamp).toLocaleTimeString()}</div>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white"
            placeholder="Type your message..."
          />
          <button
            onClick={handleSendMessage}
            className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 p-2 rounded transition"
          >
            <Send className="w-5 h-5 text-gray-900" />
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 h-fit max-h-[600px] overflow-y-auto">
        <h3 className="font-bold text-lg mb-4">Report Match Result</h3>

        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-1">You're playing against:</p>
          <p className="text-lg font-bold">{opponent}</p>
        </div>

        <div className="mb-6 border-b border-gray-600 pb-6">
          <button
            onClick={() => setShowRules(!showRules)}
            className="w-full flex items-center justify-between text-sm font-medium text-gray-300 hover:text-white transition"
          >
            <span>📋 Match Format Rules</span>
            <span>{showRules ? '▲' : '▼'}</span>
          </button>
          {showRules && (
            <div className="space-y-3 mt-3">
              {MATCH_FORMAT_RULES.map((step, idx) => (
                <div key={idx} className="flex gap-3 text-xs">
                  <span className="text-base shrink-0">{step.icon}</span>
                  <p className="text-gray-400">{step.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {timeDisplay && (
          <div className={`mb-4 p-3 rounded text-sm ${timeDisplay.color}`}>
            <ClockIcon />{timeDisplay.text}
            <p className="text-xs mt-1 text-gray-400">Time to report your result</p>
          </div>
        )}

        {userVote ? (
          <div className="mb-6 p-4 bg-neutral-800 border border-white rounded text-white text-sm text-center">
            ✓ You already reported <span className="font-bold">{userVote}</span> as the winner.
            <p className="text-xs mt-1 text-gray-400">Your result is locked in — you can't resubmit or change it.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 pb-6 border-b border-gray-600">
              <p className="text-sm font-medium mb-3">📸 Proof Screenshots</p>
              <p className="text-xs text-gray-400 mb-3">
                Upload one or more screenshots showing the match result from your profile (up to {MAX_SCREENSHOTS})
              </p>

              {screenshotPreviews.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {screenshotPreviews.map((preview, idx) => (
                    <div key={idx} className="relative">
                      <img src={preview} alt={`Screenshot ${idx + 1}`} className="w-full h-20 object-cover rounded" />
                      <button
                        type="button"
                        onClick={() => handleRemoveScreenshot(idx)}
                        className="absolute -top-1 -right-1 bg-white text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {screenshots.length < MAX_SCREENSHOTS && (
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleScreenshotUpload}
                    className="hidden"
                  />
                  <div className="border-2 border-dashed border-gray-600 rounded p-4 text-center cursor-pointer hover:border-white transition">
                    <p className="text-sm text-gray-400">
                      {screenshots.length > 0 ? 'Add another screenshot' : 'Click to upload screenshot(s)'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">or drag and drop</p>
                  </div>
                </label>
              )}
            </div>

            <p className="text-sm text-gray-300 mb-4">
              Based on the match, who won?
            </p>

            <div className="mb-4 p-3 bg-neutral-800 border border-white rounded text-xs text-gray-300">
              ⚠️ Submitting a false result will result in immediate removal from this tournament and a ban from future tournaments.
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleReportWinner(match.player1)}
                disabled={selectedWinner !== null || screenshots.length === 0}
                className={`w-full p-3 rounded font-bold transition ${
                  selectedWinner === match.player1
                    ? 'bg-gradient-to-r from-amber-200 to-yellow-500 text-gray-900'
                    : 'bg-gray-700 hover:bg-gray-600'
                } ${selectedWinner !== null && selectedWinner !== match.player1 ? 'opacity-50' : ''} ${screenshots.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {match.player1} won
              </button>
              <button
                onClick={() => handleReportWinner(match.player2)}
                disabled={selectedWinner !== null || screenshots.length === 0}
                className={`w-full p-3 rounded font-bold transition ${
                  selectedWinner === match.player2
                    ? 'bg-gradient-to-r from-amber-200 to-yellow-500 text-gray-900'
                    : 'bg-gray-700 hover:bg-gray-600'
                } ${selectedWinner !== null && selectedWinner !== match.player2 ? 'opacity-50' : ''} ${screenshots.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {match.player2} won
              </button>
            </div>

            {selectedWinner && (
              <div className="mt-4 p-3 bg-neutral-800 border border-white rounded text-white text-sm text-center">
                ✓ Vote submitted! Waiting for opponent to confirm...
              </div>
            )}

            {screenshots.length === 0 && selectedWinner === null && (
              <div className="mt-4 p-3 bg-neutral-800 border-2 border-white rounded text-white text-sm text-center">
                ⚠️ At least one screenshot required to report
              </div>
            )}
          </>
        )}

        <button
          onClick={onCancel}
          className="w-full mt-6 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition"
        >
          Back
        </button>
      </div>
    </div>
  );
}

function DisputeReview({ matches, onResolveDispute }) {
  const [expandedDispute, setExpandedDispute] = useState(null);
  const [screenshotUrls, setScreenshotUrls] = useState({});
  const disputes = matches.filter(m => m.status === 'disputed');
  const noReports = matches.filter(m => m.status === 'needs_staff_review');
  const allIssues = [...disputes, ...noReports];

  if (allIssues.length === 0) return null;

  const toggleScreenshot = async (key, paths) => {
    if (expandedDispute === key) {
      setExpandedDispute(null);
      return;
    }
    setExpandedDispute(key);
    if (!screenshotUrls[key]) {
      const urls = await Promise.all(paths.map((p) => getScreenshotUrl(p)));
      setScreenshotUrls(prev => ({ ...prev, [key]: urls }));
    }
  };

  return (
    <div className="bg-neutral-900 border-2 border-white rounded-lg p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <AlertCircle className="w-6 h-6" />
        Pending Staff Review ({allIssues.length})
      </h2>
      <div className="space-y-3">
        {disputes.map(dispute => (
          <div key={dispute.id} className="bg-neutral-800 border border-neutral-600 rounded p-4">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div className="flex-1">
                <p className="font-bold mb-2">
                  {dispute.player1} <span className="text-gray-300">vs</span> {dispute.player2}
                </p>
                <p className="text-sm text-gray-300 mb-2">
                  {dispute.player1} voted: <span className="text-white font-bold">{dispute.winner1Vote}</span>
                </p>
                <p className="text-sm text-gray-300 mb-3">
                  {dispute.player2} voted: <span className="text-white font-bold">{dispute.winner2Vote}</span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {dispute.player1ScreenshotPaths?.length > 0 && (
                    <button
                      onClick={() => toggleScreenshot(`${dispute.id}-p1`, dispute.player1ScreenshotPaths)}
                      className="text-xs bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white px-3 py-1 rounded transition"
                    >
                      📸 {dispute.player1}'s Screenshot{dispute.player1ScreenshotPaths.length > 1 ? `s (${dispute.player1ScreenshotPaths.length})` : ''}
                    </button>
                  )}
                  {dispute.player2ScreenshotPaths?.length > 0 && (
                    <button
                      onClick={() => toggleScreenshot(`${dispute.id}-p2`, dispute.player2ScreenshotPaths)}
                      className="text-xs bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white px-3 py-1 rounded transition"
                    >
                      📸 {dispute.player2}'s Screenshot{dispute.player2ScreenshotPaths.length > 1 ? `s (${dispute.player2ScreenshotPaths.length})` : ''}
                    </button>
                  )}
                </div>
                {expandedDispute === `${dispute.id}-p1` && screenshotUrls[`${dispute.id}-p1`] && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {screenshotUrls[`${dispute.id}-p1`].map((url, idx) => (
                      <img key={idx} src={url} alt={`Player 1 proof ${idx + 1}`} className="max-h-64 rounded border border-gray-600" />
                    ))}
                  </div>
                )}
                {expandedDispute === `${dispute.id}-p2` && screenshotUrls[`${dispute.id}-p2`] && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {screenshotUrls[`${dispute.id}-p2`].map((url, idx) => (
                      <img key={idx} src={url} alt={`Player 2 proof ${idx + 1}`} className="max-h-64 rounded border border-gray-600" />
                    ))}
                  </div>
                )}
                <StaffChatToggle match={dispute} />
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => onResolveDispute(dispute.id, dispute.winner1Vote)}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-2 rounded text-sm transition"
                >
                  Accept {dispute.winner1Vote}
                </button>
                <button
                  onClick={() => onResolveDispute(dispute.id, dispute.winner2Vote)}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-2 rounded text-sm transition"
                >
                  Accept {dispute.winner2Vote}
                </button>
              </div>
            </div>
          </div>
        ))}

        {noReports.map(match => (
          <div key={match.id} className="bg-neutral-900 rounded p-4 border-l-4 border-white">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <p className="font-bold mb-2 text-white">
                  {match.player1} <span className="text-gray-300">vs</span> {match.player2}
                </p>
                <p className="text-sm text-neutral-300 mb-2">
                  <ClockIcon />No results reported within 16 hours
                  {match.resolvedReason === 'no_report_timeout_repeat' && (
                    <span className="text-white font-bold"> — repeat offense, already used their grace period</span>
                  )}
                </p>
                <p className="text-xs text-gray-300 mb-3">
                  Timed out: {new Date(match.timeoutAt).toLocaleString()}
                </p>
                <StaffChatToggle match={match} />
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => onResolveDispute(match.id, match.player1)}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-2 rounded text-sm transition"
                >
                  Award to {match.player1}
                </button>
                <button
                  onClick={() => onResolveDispute(match.id, match.player2)}
                  className="bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-black font-bold px-3 py-2 rounded text-sm transition"
                >
                  Award to {match.player2}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-gray-800 rounded-lg border border-gray-700 p-6 ${onClick ? 'cursor-pointer hover:border-white transition' : ''}`}
    >
      <div className="flex items-center gap-4">
        <div className="text-white">{icon}</div>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
      </div>
      {onClick && <p className="text-xs text-gray-500 mt-2">Click to open your match</p>}
    </div>
  );
}
