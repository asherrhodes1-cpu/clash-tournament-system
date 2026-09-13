import React, { useState, useEffect } from 'react';
import { MessageCircle, Users, Trophy, LogOut, Menu, X, Send, CheckCircle, AlertCircle } from 'lucide-react';
import { signUp, logIn, logOut, subscribeToAuthState, adminResetPassword } from './api/auth';
import {
  subscribeToTournaments,
  subscribeToMatches,
  subscribeToUserMatches,
  createTournament,
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
import { uploadMatchScreenshot, getScreenshotUrl } from './api/storage';
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

  const handleCreateTournament = async (tournamentData) => {
    await createTournament(tournamentData, currentUser.username);
    setCurrentPage('dashboard');
  };

  const handleJoinTournament = async (tournamentId) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;
    try {
      await joinTournament(tournament, currentUser.username);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteTournament = async (tournamentId) => {
    if (window.confirm('Are you sure you want to delete this tournament? This cannot be undone.')) {
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

  const handleReportMatch = async (matchId, selectedWinner, screenshotFile) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    const isPlayer1 = currentUser.username === match.player1;
    const screenshotPath = await uploadMatchScreenshot(
      selectedTournamentId,
      matchId,
      isPlayer1 ? 'player1' : 'player2',
      screenshotFile
    );
    await reportMatch(selectedTournamentId, matchId, currentUser.username, selectedWinner, screenshotPath);
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
            onFlagMatch={(matchId) => {
              setFlagRelatedMatch(matchId);
              setFlagModalOpen(true);
            }}
          />
        )}

        {currentPage === 'match' && currentUser && (
          <MatchPage
            match={matches.find(m => m.id === selectedMatchId)}
            user={currentUser}
            onReportWinner={async (winner, screenshotFile) => {
              await handleReportMatch(selectedMatchId, winner, screenshotFile);
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

    setIsSubmitting(true);
    try {
      await signUp({
        username,
        password,
        clashTag: clashTag.toUpperCase(),
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

function DashboardPage({ user, tournaments, userMatches, onJoinTournament, onStartTournament, onDeleteTournament, onSelectTournament }) {
  const userTournaments = tournaments.filter(t => t.createdBy === user.username || t.players.includes(user.username));

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
          value={userMatches
            .filter(m => m.status === 'waiting_for_opponent' || m.status === 'pending' || m.status === 'scheduled').length}
        />
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-2xl font-bold mb-4">Available Tournaments</h2>
        <div className="space-y-3">
          {tournaments.length === 0 ? (
            <p className="text-gray-400">No tournaments yet. Create one to get started!</p>
          ) : (
            tournaments.map(tournament => (
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
    </div>
  );
}

function TournamentCard({ tournament, user, onJoin, onStart, onDelete, onView }) {
  const isCreator = tournament.createdBy === user.username;
  const hasJoined = tournament.players.includes(user.username);
  const now = new Date();
  const deadlinePassed = tournament.signupDeadline && new Date(tournament.signupDeadline) < now;
  const canJoin = !hasJoined && !isCreator && tournament.status === 'signups_open' && !deadlinePassed;

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

  return (
    <div className="bg-gray-700 rounded p-4 flex justify-between items-center flex-wrap gap-4">
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-lg">{tournament.name}</h3>
        <div className="text-sm text-gray-300 mt-1">
          <p>Creator: {tournament.createdBy}</p>
          <p>Players: {tournament.players.length} | Status: <span className="text-white">{tournament.status === 'loading_stats' ? 'Loading...' : formatStatus(tournament.status)}</span></p>
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
        {isCreator && user.isStaff && (
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
}

function CreateTournamentPage({ onCreateTournament, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('single_elimination');
  const [signupDeadline, setSignupDeadline] = useState('');
  const [error, setError] = useState('');

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
    });
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
              <option value="double_elimination">Double Elimination (Coming Soon)</option>
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

function TournamentPage({ tournament, matches, user, onSelectMatch, onPlayerReady, onFlagMatch, onResolveDispute, onRemovePlayer }) {
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

  return (
    <div className="space-y-8">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>
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
              <p className="text-lg font-bold text-white">{tournament.champion}</p>
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

      {user.isStaff && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-bold mb-4">Players ({tournament.players.length})</h2>
          {tournament.players.length === 0 ? (
            <p className="text-gray-400 text-sm">No players yet</p>
          ) : (
            <div className="space-y-2">
              {tournament.players.map(player => (
                <div key={player} className="flex items-center justify-between bg-gray-700 rounded px-4 py-2">
                  <span>{player}</span>
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

      {rounds.map(round => (
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
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchCard({ match, user, onSelectMatch, onPlayerReady, onFlagMatch }) {
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
            <span className="font-bold">{match.player1}</span>
            <div className="text-xs text-gray-400">#{match.player1Tag}</div>
            {match.player1Ready && match.status === 'pending' && <div className="text-xs text-white">✓ Ready</div>}
          </div>
          <span className="text-gray-400">vs</span>
          <div>
            <span className="font-bold">{match.player2}</span>
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

function MatchPage({ match, user, onReportWinner, onCancel }) {
  const [selectedWinner, setSelectedWinner] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
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

  const handleSendMessage = () => {
    if (messageText.trim()) {
      sendMatchMessage(match.tournamentId, match.id, user.username, messageText.trim());
      setMessageText('');
    }
  };

  const handleScreenshotUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setScreenshot(file);
      setScreenshotPreview(URL.createObjectURL(file));
    }
  };

  const handleReportWinner = (winner) => {
    if (!screenshot) {
      alert('Please upload a screenshot before reporting');
      return;
    }

    setSelectedWinner(winner);
    setTimeout(() => {
      onReportWinner(winner, screenshot);
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

        <div className="mb-6 pb-6 border-b border-gray-600">
          <p className="text-sm font-medium mb-3">📸 Proof Screenshot</p>
          <p className="text-xs text-gray-400 mb-3">Upload a screenshot showing the match result from your profile</p>

          <label className="block">
            <input
              type="file"
              accept="image/*"
              onChange={handleScreenshotUpload}
              className="hidden"
            />
            <div className="border-2 border-dashed border-gray-600 rounded p-4 text-center cursor-pointer hover:border-white transition">
              {screenshotPreview ? (
                <div>
                  <img src={screenshotPreview} alt="Preview" className="w-full h-auto rounded mb-2 max-h-48" />
                  <p className="text-xs text-white">✓ Screenshot uploaded</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-400">Click to upload screenshot</p>
                  <p className="text-xs text-gray-500 mt-1">or drag and drop</p>
                </div>
              )}
            </div>
          </label>
        </div>

        <p className="text-sm text-gray-300 mb-4">
          Based on the match, who won?
        </p>

        <div className="space-y-2">
          <button
            onClick={() => handleReportWinner(match.player1)}
            disabled={selectedWinner !== null || !screenshot}
            className={`w-full p-3 rounded font-bold transition ${
              selectedWinner === match.player1
                ? 'bg-white text-black'
                : 'bg-gray-700 hover:bg-gray-600'
            } ${selectedWinner !== null && selectedWinner !== match.player1 ? 'opacity-50' : ''} ${!screenshot ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {match.player1} won
          </button>
          <button
            onClick={() => handleReportWinner(match.player2)}
            disabled={selectedWinner !== null || !screenshot}
            className={`w-full p-3 rounded font-bold transition ${
              selectedWinner === match.player2
                ? 'bg-white text-black'
                : 'bg-gray-700 hover:bg-gray-600'
            } ${selectedWinner !== null && selectedWinner !== match.player2 ? 'opacity-50' : ''} ${!screenshot ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {match.player2} won
          </button>
        </div>

        {selectedWinner && (
          <div className="mt-4 p-3 bg-neutral-800 border border-white rounded text-white text-sm text-center">
            ✓ Vote submitted! Waiting for opponent to confirm...
          </div>
        )}

        {!screenshot && selectedWinner === null && (
          <div className="mt-4 p-3 bg-neutral-800 border-2 border-white rounded text-white text-sm text-center">
            ⚠️ Screenshot required to report
          </div>
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

  const toggleScreenshot = async (key, path) => {
    if (expandedDispute === key) {
      setExpandedDispute(null);
      return;
    }
    setExpandedDispute(key);
    if (!screenshotUrls[key]) {
      const url = await getScreenshotUrl(path);
      setScreenshotUrls(prev => ({ ...prev, [key]: url }));
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
                  {dispute.player1ScreenshotPath && (
                    <button
                      onClick={() => toggleScreenshot(`${dispute.id}-p1`, dispute.player1ScreenshotPath)}
                      className="text-xs bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white px-3 py-1 rounded transition"
                    >
                      📸 {dispute.player1}'s Screenshot
                    </button>
                  )}
                  {dispute.player2ScreenshotPath && (
                    <button
                      onClick={() => toggleScreenshot(`${dispute.id}-p2`, dispute.player2ScreenshotPath)}
                      className="text-xs bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-white px-3 py-1 rounded transition"
                    >
                      📸 {dispute.player2}'s Screenshot
                    </button>
                  )}
                </div>
                {expandedDispute === `${dispute.id}-p1` && screenshotUrls[`${dispute.id}-p1`] && (
                  <img src={screenshotUrls[`${dispute.id}-p1`]} alt="Player 1 proof" className="mt-3 max-h-64 rounded border border-gray-600" />
                )}
                {expandedDispute === `${dispute.id}-p2` && screenshotUrls[`${dispute.id}-p2`] && (
                  <img src={screenshotUrls[`${dispute.id}-p2`]} alt="Player 2 proof" className="mt-3 max-h-64 rounded border border-gray-600" />
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

function StatCard({ icon, label, value }) {
  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center gap-4">
        <div className="text-white">{icon}</div>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}
