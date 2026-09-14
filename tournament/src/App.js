import React, { useState, useEffect } from 'react';
import { MessageCircle, Users, Trophy, LogOut, Menu, X, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { signUp, logIn, logOut, subscribeToAuthState, adminResetPassword } from './api/auth';
import {
  subscribeToTournaments,
  subscribeToMatches,
  subscribeToUserMatches,
  createTournament,
  updateTournamentBanner,
  joinTournament,
  deleteTournament,
  removePlayer,
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
import { subscribeToUserProfile, updateProfile } from './api/users';
import { verifyClashAccount } from './api/clash';
import { getTimeRemainingDisplay } from './utils';

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
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full">
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
              className="flex-1 bg-white hover:bg-neutral-200 text-gray-900 font-bold py-2 px-4 rounded transition"
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
                  className="bg-white hover:bg-neutral-200 text-gray-900 font-bold px-4 py-2 rounded transition"
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
                  className="bg-white hover:bg-neutral-200 text-black font-bold px-4 py-2 rounded transition"
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagRelatedMatch, setFlagRelatedMatch] = useState(null);

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

  const viewProfile = (username) => {
    setSelectedProfileUsername(username);
    setCurrentPage('profile');
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

  const handleJoinTournament = async (tournamentId) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;
    try {
      await joinTournament(tournament, currentUser);
    } catch (err) {
      alert(err.message);
    }
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

  const handleRemovePlayer = async (tournamentId, username) => {
    if (!window.confirm(`Remove ${username} from this tournament? This cannot be undone.`)) {
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
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="MercifulAj" className="w-9 h-9 object-contain" />
              </div>

              <div className="hidden md:flex items-center gap-6">
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
                {currentUser.isStaff && (
                  <button
                    onClick={() => setCurrentPage('create')}
                    className="hover:text-neutral-300 transition"
                  >
                    Create Tournament
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
                <div className="text-sm text-gray-400">
                  {currentUser.username}
                  <div className="text-xs text-gray-500">{currentUser.clashTag}</div>
                  {currentUser.isStaff && <span className="ml-2 text-white font-bold">[STAFF]</span>}
                </div>
                <button
                  onClick={handleLogout}
                  className="border-2 border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded transition"
                >
                  Logout
                </button>
              </div>

              <button
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

            {mobileMenuOpen && (
              <div className="md:hidden pb-4 space-y-3">
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
        </nav>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPage === 'landing' && (
          <LandingPage onEnter={() => setCurrentPage('login')} />
        )}

        {currentPage === 'login' && (
          <LoginPage />
        )}

        {currentPage === 'dashboard' && currentUser && (
          <DashboardPage
            user={currentUser}
            tournaments={tournaments}
            userMatches={userMatches}
            onJoinTournament={handleJoinTournament}
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
                  className="bg-white hover:bg-neutral-200 text-gray-900 font-bold py-2 px-6 rounded transition"
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
            onPlayerReady={handlePlayerReady}
            onViewProfile={viewProfile}
            onUpdateBanner={handleUpdateBanner}
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
          />
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

function LoginPage() {
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
          <h1 className="text-3xl font-bold mb-8 text-center flex items-center justify-center gap-3">
            <Trophy className="w-10 h-10 text-white" />
            Create Account
          </h1>

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

function DashboardPage({ user, tournaments, userMatches, onJoinTournament, onStartTournament, onDeleteTournament, onSelectTournament, onOpenMatch }) {
  const userTournaments = tournaments.filter(t => t.createdBy === user.username || t.players.includes(user.username));
  const pendingMatches = userMatches
    .filter(m => m.status === 'waiting_for_opponent' || m.status === 'pending' || m.status === 'scheduled' || m.status === 'active');
  const openTournaments = tournaments.filter(t => t.status !== 'completed');
  const pastTournaments = tournaments.filter(t => t.status === 'completed');

  return (
    <div className="space-y-8">
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
  return place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : '🎖️';
}

function ProfilePage({ username, currentUser, tournaments, onViewProfile }) {
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingDiscordId, setEditingDiscordId] = useState(false);
  const [discordIdDraft, setDiscordIdDraft] = useState('');
  const [showVerifyForm, setShowVerifyForm] = useState(false);
  const [verifyClashTag, setVerifyClashTag] = useState('');
  const [editingVerifyTag, setEditingVerifyTag] = useState(false);
  const [verifyApiToken, setVerifyApiToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const isOwnProfile = currentUser.username === username;

  useEffect(() => {
    setProfileLoaded(false);
    return subscribeToUserProfile(username, (p) => {
      setProfile(p);
      setProfileLoaded(true);
    });
  }, [username]);

  useEffect(() => {
    setBioDraft(profile?.bio || '');
  }, [profile?.bio]);

  useEffect(() => {
    setDiscordIdDraft(profile?.discordId || '');
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

  const handleSaveDiscordId = async () => {
    const trimmed = discordIdDraft.trim();
    if (trimmed && !/^[0-9]{5,25}$/.test(trimmed)) {
      alert('That doesn\'t look like a Discord User ID (should be a number, e.g. 123456789012345678).');
      return;
    }
    try {
      await updateProfile(profile.id, { discordId: trimmed });
      setEditingDiscordId(false);
    } catch (err) {
      alert(err.message);
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

  const placed = tournaments
    .filter(t => t.status === 'completed' && t.placements && t.placements[username])
    .sort((a, b) => a.placements[username] - b.placements[username]);

  const championships = placed.filter(t => t.placements[username] === 1).length;
  const runnerUps = placed.filter(t => t.placements[username] === 2).length;

  if (profileLoaded && !profile) {
    return (
      <div className="text-center">
        <p className="text-gray-400">No player found with that username</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
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
                <button onClick={handleSaveBio} className="bg-white hover:bg-neutral-200 text-black font-bold px-3 py-1 rounded text-sm transition">
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
              {!editingDiscordId && (
                <button
                  onClick={() => setEditingDiscordId(true)}
                  className="text-xs border border-gray-600 hover:border-white px-2 py-1 rounded transition"
                >
                  {profile?.discordId ? 'Edit' : 'Set up'}
                </button>
              )}
            </div>
            {editingDiscordId ? (
              <div className="space-y-2 mt-2">
                <input
                  type="text"
                  value={discordIdDraft}
                  onChange={(e) => setDiscordIdDraft(e.target.value)}
                  placeholder="e.g., 123456789012345678"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-white"
                />
                <p className="text-xs text-gray-400">
                  In Discord: Settings → Advanced → enable Developer Mode. Then right-click your name anywhere and click "Copy User ID".
                </p>
                <div className="flex gap-2">
                  <button onClick={handleSaveDiscordId} className="bg-white hover:bg-neutral-200 text-black font-bold px-3 py-1 rounded text-sm transition">
                    Save
                  </button>
                  <button
                    onClick={() => { setEditingDiscordId(false); setDiscordIdDraft(profile?.discordId || ''); }}
                    className="border border-gray-600 hover:border-white px-3 py-1 rounded text-sm transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                {profile?.discordId
                  ? "You'll be @mentioned in Discord for your matches and new chat messages."
                  : 'Add your Discord User ID to get @mentioned for your matches and new chat messages.'}
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
                    : 'text-xs bg-white hover:bg-neutral-200 text-black font-bold px-2 py-1 rounded transition'
                }
              >
                {profile?.clashVerified ? 'Re-verify' : 'Verify Now'}
              </button>
            )}
          </div>

          {profile?.clashVerified && (
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
                  className="bg-white hover:bg-neutral-200 text-black font-bold px-3 py-1 rounded text-sm transition disabled:opacity-50"
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
            <p className="text-2xl font-bold">🥇 {championships}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Runner-up Finishes</p>
            <p className="text-2xl font-bold">🥈 {runnerUps}</p>
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
                <span className="text-3xl">{medalFor(t.placements[username])}</span>
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
          <p>Players: {tournament.players.length} | Status: <span className="text-white">{tournament.status === 'loading_stats' ? 'Loading...' : formatStatus(tournament.status)}</span></p>
          {tournament.status === 'completed' && tournament.champion && (
            <p>🏆 Champion: <span className="text-white font-bold">{tournament.champion}</span></p>
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
            className="bg-white hover:bg-neutral-200 text-black font-bold px-4 py-2 rounded text-sm transition"
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
            className="bg-white hover:bg-neutral-200 text-black font-bold px-4 py-2 rounded text-sm transition"
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

  if (tournament.bannerPath) {
    return (
      <div className="rounded overflow-hidden border-2 border-white flex flex-col sm:flex-row">
        <TournamentBannerImage path={tournament.bannerPath} className="w-full sm:w-48 h-32 sm:h-auto object-cover shrink-0" />
        {cardContent}
      </div>
    );
  }

  return <div className="rounded overflow-hidden">{cardContent}</div>;
}

function TournamentBannerImage({ path, className }) {
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

  if (!url) return <div className={`${className} bg-gray-800`} />;
  return <img src={url} alt="Tournament banner" className={className} />;
}

function CreateTournamentPage({ onCreateTournament, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('single_elimination');
  const [signupDeadline, setSignupDeadline] = useState('');
  const [requiredBuilderHallLevel, setRequiredBuilderHallLevel] = useState('');
  const [minBestTrophies, setMinBestTrophies] = useState('');
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
            <p className="text-xs text-gray-400 mt-1">Leave blank to allow signups indefinitely</p>
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
              className="flex-1 bg-white hover:bg-neutral-200 text-gray-900 font-bold py-2 px-4 rounded transition"
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

function TournamentPage({ tournament, matches, user, onSelectMatch, onPlayerReady, onFlagMatch, onResolveDispute, onRemovePlayer, onViewProfile, onUpdateBanner }) {
  const [viewMode, setViewMode] = useState('list');
  const [bannerUrl, setBannerUrl] = useState(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);

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
        {bannerUrl ? (
          <div className="relative">
            <img src={bannerUrl} alt="" className="w-full h-48 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <h1 className="absolute bottom-4 left-6 right-6 text-4xl font-extrabold text-white tracking-tight">{tournament.name}</h1>
            {user.isStaff && (
              <label className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded cursor-pointer transition">
                <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" disabled={uploadingBanner} />
                {uploadingBanner ? 'Uploading...' : 'Change Banner'}
              </label>
            )}
          </div>
        ) : (
          user.isStaff && (
            <label className="block border-b border-gray-700 p-3 text-center text-xs text-gray-400 hover:text-white cursor-pointer transition">
              <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" disabled={uploadingBanner} />
              {uploadingBanner ? 'Uploading...' : '+ Add a banner image'}
            </label>
          )
        )}
        <div className="p-6">
        {!bannerUrl && <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>}
        <p className="text-gray-400">{tournament.description}</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-400">Status</p>
            <p className="text-lg font-bold text-white">{tournament.status === 'loading_stats' ? 'Loading...' : formatStatus(tournament.status)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Players</p>
            <p className="text-lg font-bold">{tournament.players.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Matches</p>
            <p className="text-lg font-bold">{matches.length}</p>
          </div>
          {tournament.champion && (
            <div>
              <p className="text-sm text-gray-400">Champion</p>
              <button
                onClick={() => onViewProfile(tournament.champion)}
                className="text-lg font-bold text-white hover:underline"
              >
                {tournament.champion}
              </button>
            </div>
          )}
        </div>
        {tournament.signupDeadline && (
          <div className="mt-4 p-3 bg-gray-700 rounded">
            <p className="text-sm text-gray-400">Signup Deadline</p>
            <p className="text-white">{new Date(tournament.signupDeadline).toLocaleString()}</p>
          </div>
        )}
        </div>
      </div>

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

      {user.isStaff && matches.filter(m => m.status === 'disputed' || m.status === 'needs_staff_review').length > 0 && (
        <DisputeReview matches={matches} onResolveDispute={onResolveDispute} />
      )}

      {tournament.status === 'completed' && tournament.champion && (
        <TournamentResults tournament={tournament} onViewProfile={onViewProfile} />
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Bracket</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-sm border transition ${
              viewMode === 'list' ? 'bg-white text-black border-white' : 'border-gray-600 text-gray-300 hover:border-white'
            }`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode('bracket')}
            className={`px-3 py-1 rounded text-sm border transition ${
              viewMode === 'bracket' ? 'bg-white text-black border-white' : 'border-gray-600 text-gray-300 hover:border-white'
            }`}
          >
            Bracket
          </button>
        </div>
      </div>

      {viewMode === 'bracket' ? (
        <BracketView matches={matches} rounds={rounds} isDoubleElim={isDoubleElim} bracketSize={tournament.bracketSize} />
      ) : isDoubleElim ? (
        bracketSections.map(({ bracket, round }) => (
          <div key={`${bracket}-${round}`} className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="text-xl font-bold mb-4">{sectionLabel({ bracket, round })}</h2>
            <div className="space-y-3">
              {matches
                .filter(m => m.bracket === bracket && m.round === round)
                .map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    user={user}
                    onSelectMatch={() => onSelectMatch(match.id)}
                    onPlayerReady={() => onPlayerReady(match.id)}
                    onFlagMatch={() => onFlagMatch(match.id)}
                    onViewProfile={onViewProfile}
                  />
                ))}
            </div>
          </div>
        ))
      ) : (
        rounds.map(round => (
          <div key={round} className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            <h2 className="text-xl font-bold mb-4">Round {round}</h2>
            <div className="space-y-3">
              {matches
                .filter(m => m.round === round)
                .map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    user={user}
                    onSelectMatch={() => onSelectMatch(match.id)}
                    onPlayerReady={() => onPlayerReady(match.id)}
                    onFlagMatch={() => onFlagMatch(match.id)}
                    onViewProfile={onViewProfile}
                  />
                ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
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

function TournamentResults({ tournament, onViewProfile }) {
  const standings = buildStandings(tournament);

  return (
    <div className="bg-gray-800 rounded-lg border-2 border-white p-6">
      <div className="text-center mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Tournament Complete</p>
        <h2 className="text-2xl font-bold">🏆 {tournament.champion} wins {tournament.name}!</h2>
      </div>
      <div className="space-y-2">
        {standings.map(({ place, players }) => (
          <div key={place} className="flex items-center justify-between bg-gray-700 rounded px-4 py-3">
            <span className="font-bold text-white">
              {place === 1 ? '🥇' : place === 2 ? '🥈' : '🥉'} {ordinal(place)} place
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

function BracketColumns({ matches, rounds, labelForRound }) {
  const maxRound = rounds.length ? Math.max(...rounds) : 0;

  return (
    <div className="flex gap-8 min-w-max pb-2">
      {rounds.map(round => (
        <div key={round} className="flex flex-col justify-around gap-4 min-w-[220px]">
          <h3 className="text-center font-bold text-gray-400 mb-2">
            {labelForRound ? labelForRound(round, maxRound) : (round === maxRound ? 'Final' : `Round ${round}`)}
          </h3>
          {matches.filter(m => m.round === round).map(match => (
            <div key={match.id} className="bg-gray-700 rounded border border-gray-600 p-2 text-sm space-y-1">
              {[match.player1, match.player2].map((p, idx) => {
                const isWinner = match.status === 'completed' && match.winner === p;
                return (
                  <div
                    key={idx}
                    className={`flex justify-between items-center px-2 py-1 rounded ${
                      isWinner ? 'bg-white text-black font-bold' : 'text-gray-300'
                    }`}
                  >
                    <span>{p || 'TBD'}</span>
                    {isWinner && <span>✓</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function BracketView({ matches, rounds, isDoubleElim, bracketSize }) {
  if (isDoubleElim) {
    const k = Math.round(Math.log2(bracketSize || 2));
    const totalLbRounds = Math.max(2 * (k - 1), 1);

    const wbMatches = matches.filter(m => m.bracket === 'winners');
    const lbMatches = matches.filter(m => m.bracket === 'losers');
    const gfMatches = matches.filter(m => m.bracket === 'grand_final');
    const wbRounds = [...new Set(wbMatches.map(m => m.round))].sort((a, b) => a - b);
    const lbRounds = [...new Set(lbMatches.map(m => m.round))].sort((a, b) => a - b);
    const gfRounds = [...new Set(gfMatches.map(m => m.round))].sort((a, b) => a - b);

    return (
      <div className="space-y-6">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-x-auto">
          <h3 className="font-bold mb-4">Winners Bracket</h3>
          <BracketColumns
            matches={wbMatches}
            rounds={wbRounds}
            labelForRound={(r) => (r === k ? 'Winners Final' : `Round ${r}`)}
          />
        </div>
        {lbRounds.length > 0 && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-x-auto">
            <h3 className="font-bold mb-4">Losers Bracket</h3>
            <BracketColumns
              matches={lbMatches}
              rounds={lbRounds}
              labelForRound={(r) => (r === totalLbRounds ? 'Losers Final' : `Round ${r}`)}
            />
          </div>
        )}
        {gfRounds.length > 0 && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-x-auto">
            <h3 className="font-bold mb-4">Grand Final</h3>
            <BracketColumns matches={gfMatches} rounds={gfRounds} labelForRound={(r) => (r === 1 ? 'Game 1' : 'Bracket Reset')} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 overflow-x-auto">
      <BracketColumns matches={matches} rounds={rounds} />
    </div>
  );
}

function MatchCard({ match, user, onSelectMatch, onPlayerReady, onFlagMatch, onViewProfile }) {
  const userIsPlayer = match.player1 === user.username || match.player2 === user.username;
  const userVote = match.player1 === user.username ? match.winner1Vote : match.winner2Vote;
  const userReady = match.player1 === user.username ? match.player1Ready : match.player2Ready;
  const timeDisplay = getTimeRemainingDisplay(match.scheduledStartTime);

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
          <div>
            <button onClick={() => onViewProfile(match.player1)} className="font-bold hover:underline">
              {match.player1}
            </button>
            <div className="text-xs text-gray-400">#{match.player1Tag}</div>
            {match.player1Ready && match.status === 'pending' && <div className="text-xs text-white">✓ Ready</div>}
          </div>
          <span className="text-gray-400">vs</span>
          <div>
            <button onClick={() => onViewProfile(match.player2)} className="font-bold hover:underline" disabled={match.player2 === 'BYE'}>
              {match.player2}
            </button>
            <div className="text-xs text-gray-400">#{match.player2Tag}</div>
            {match.player2Ready && match.status === 'pending' && <div className="text-xs text-white">✓ Ready</div>}
          </div>
          {getStatusIcon(match.status)}
        </div>
        <div className="text-sm text-gray-300 mt-2">
          {match.status === 'pending' && (
            <p className="text-white">
              {match.player1Ready && match.player2Ready ? '⏱️ Both players ready! Match will start soon.' : 'Waiting for both players to confirm ready...'}
            </p>
          )}
          {match.status === 'scheduled' && (
            <p className="text-white">Match scheduled - coordinate timing with opponent</p>
          )}
          {match.status === 'active' && (
            <p className="text-white">🎮 Match is LIVE - Play now in-game and report results</p>
          )}
          {match.status === 'completed' && (
            <p>Winner: <span className="text-white font-bold">{match.winner}</span></p>
          )}
          {match.status === 'disputed' && (
            <p className="text-white">Disputed • {match.player1} voted: {match.winner1Vote} | {match.player2} voted: {match.winner2Vote}</p>
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
              ⏱️ Time remaining: {timeDisplay?.text}
              {match.resolvedReason === 'no_report_timeout' && ' (Needs staff review - no reports submitted)'}
              {match.resolvedReason === 'opponent_timeout' && ' (Auto-resolved - opponent unresponsive)'}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-2 ml-4 flex-wrap">
        {userIsPlayer && match.status !== 'completed' && (
          <button
            onClick={onSelectMatch}
            className="border border-white text-white hover:bg-white hover:text-black px-3 py-2 rounded text-sm transition"
          >
            💬 Coordinate Match
          </button>
        )}
        {userIsPlayer && match.status === 'pending' && !userReady && (
          <button
            onClick={onPlayerReady}
            className="bg-white hover:bg-neutral-200 text-black font-bold px-4 py-2 rounded text-sm transition"
          >
            I'm Ready
          </button>
        )}
        {userIsPlayer && match.status === 'pending' && userReady && (
          <div className="text-sm text-white">✓ You're Ready</div>
        )}
        {userIsPlayer && !userVote && ['active', 'scheduled', 'waiting_for_opponent'].includes(match.status) && (
          <button
            onClick={onSelectMatch}
            className="bg-white hover:bg-neutral-200 text-black font-bold px-4 py-2 rounded text-sm transition"
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
            className="bg-white hover:bg-neutral-200 p-2 rounded transition"
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

        {timeDisplay && (
          <div className={`mb-4 p-3 rounded text-sm ${timeDisplay.color}`}>
            ⏱️ {timeDisplay.text}
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
                    ? 'bg-white text-black'
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
                    ? 'bg-white text-black'
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
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => onResolveDispute(dispute.id, dispute.winner1Vote)}
                  className="bg-white hover:bg-neutral-200 text-black font-bold px-3 py-2 rounded text-sm transition"
                >
                  Accept {dispute.winner1Vote}
                </button>
                <button
                  onClick={() => onResolveDispute(dispute.id, dispute.winner2Vote)}
                  className="bg-white hover:bg-neutral-200 text-black font-bold px-3 py-2 rounded text-sm transition"
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
                  🕐 No results reported within 16 hours
                </p>
                <p className="text-xs text-gray-300 mb-3">
                  Timed out: {new Date(match.timeoutAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => onResolveDispute(match.id, match.player1)}
                  className="bg-white hover:bg-neutral-200 text-black font-bold px-3 py-2 rounded text-sm transition"
                >
                  Award to {match.player1}
                </button>
                <button
                  onClick={() => onResolveDispute(match.id, match.player2)}
                  className="bg-white hover:bg-neutral-200 text-black font-bold px-3 py-2 rounded text-sm transition"
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
