import React, { useState, useEffect } from 'react';
import { MessageCircle, Users, Trophy, LogOut, Menu, X, Send, CheckCircle, AlertCircle } from 'lucide-react';

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
          <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded text-red-300 text-sm">
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
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              placeholder="Brief description of issue"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
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
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
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
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              placeholder="Explain the issue in detail..."
              rows="4"
              required
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-4 rounded transition"
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
function StaffDashboard({ user, setCurrentPage, onUpdateFlagStatus, onAddResponse }) {
  const [flags, setFlags] = useState(() => {
    const saved = localStorage.getItem('flags');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedFlag, setSelectedFlag] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  const [responseText, setResponseText] = useState('');

  const refreshFlags = () => {
    const saved = localStorage.getItem('flags');
    setFlags(saved ? JSON.parse(saved) : []);
  };

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
    refreshFlags();
  };

  const handleAddResponse = (flagId) => {
    if (responseText.trim()) {
      onAddResponse(flagId, responseText);
      setResponseText('');
      refreshFlags();
      const updatedFlags = JSON.parse(localStorage.getItem('flags') || '[]');
      setSelectedFlag(updatedFlags.find(f => f.id === flagId));
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-900 text-red-200';
      case 'high':
        return 'bg-orange-900 text-orange-200';
      case 'normal':
        return 'bg-yellow-900 text-yellow-200';
      case 'low':
        return 'bg-blue-900 text-blue-200';
      default:
        return 'bg-gray-700 text-gray-200';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return 'bg-red-600';
      case 'in_progress':
        return 'bg-yellow-600';
      case 'resolved':
        return 'bg-green-600';
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
          onClick={() => setSelectedFlag(null)}
          className="text-yellow-500 hover:text-yellow-600 text-sm"
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
                      <span className="font-bold text-yellow-400">{response.sender}</span>
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
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
                  placeholder="Add staff response..."
                />
                <button
                  onClick={() => handleAddResponse(selectedFlag.id)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold px-4 py-2 rounded transition"
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
                    className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded transition"
                  >
                    Mark In Progress
                  </button>
                )}
                {selectedFlag.status !== 'open' && (
                  <button
                    onClick={() => handleStatusChange(selectedFlag.id, 'open')}
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded transition"
                  >
                    Reopen
                  </button>
                )}
                <button
                  onClick={() => handleStatusChange(selectedFlag.id, 'resolved')}
                  className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded transition"
                >
                  Mark Resolved
                </button>
              </div>
            </div>
          )}

          {selectedFlag.resolvedAt && (
            <div className="border-t border-gray-600 pt-6 mt-6 bg-green-900 rounded p-4">
              <p className="text-green-300 text-sm">
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
          <div className="bg-red-900 rounded p-4">
            <p className="text-sm text-red-200">Open</p>
            <p className="text-2xl font-bold">{flags.filter(f => f.status === 'open').length}</p>
          </div>
          <div className="bg-yellow-900 rounded p-4">
            <p className="text-sm text-yellow-200">In Progress</p>
            <p className="text-2xl font-bold">{flags.filter(f => f.status === 'in_progress').length}</p>
          </div>
          <div className="bg-green-900 rounded p-4">
            <p className="text-sm text-green-200">Resolved</p>
            <p className="text-2xl font-bold">{flags.filter(f => f.status === 'resolved').length}</p>
          </div>
        </div>

        <div className="flex gap-4 mb-6 flex-wrap">
          <div>
            <label className="text-sm text-gray-400 block mb-2">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
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
              className="bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="priority">Priority</option>
              <option value="date">Most Recent</option>
            </select>
          </div>
          <div className="flex-1">
            <button
              onClick={refreshFlags}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm w-full md:w-auto"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
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
              onClick={() => setSelectedFlag(flag)}
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
  const [currentPage, setCurrentPage] = useState('login');
  const [tournaments, setTournaments] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagRelatedMatch, setFlagRelatedMatch] = useState(null);

  useEffect(() => {
    const savedData = localStorage.getItem('tournamentData');
    if (savedData) {
      setTournaments(JSON.parse(savedData));
    }
  }, []);

  const saveData = (data) => {
    localStorage.setItem('tournamentData', JSON.stringify(data));
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
    setCurrentPage('dashboard');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentPage('login');
    setMobileMenuOpen(false);
  };

  const handleCreateTournament = (tournamentData) => {
    const newTournament = {
      id: Date.now(),
      ...tournamentData,
      createdBy: currentUser.username,
      players: [],
      bracket: [],
      matches: [],
      status: 'signups_open',
      createdAt: new Date().toISOString(),
    };
    const updated = [...tournaments, newTournament];
    setTournaments(updated);
    saveData(updated);
    setCurrentPage('dashboard');
  };

  const handleJoinTournament = (tournamentId) => {
    setTournaments(prev => prev.map(t => {
      if (t.id === tournamentId) {
        if (!t.players.includes(currentUser.username)) {
          return { ...t, players: [...t.players, currentUser.username] };
        }
      }
      return t;
    }));
    saveData(tournaments);
  };

  const handleStartTournament = async (tournamentId) => {
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (!tournament) return;

    setTournaments(prev => prev.map(t => 
      t.id === tournamentId ? { ...t, status: 'loading_stats', bracket: [] } : t
    ));

    const playerStats = {};
    for (const player of tournament.players) {
      const playerAccount = JSON.parse(localStorage.getItem('accounts') || '[]')
        .find(acc => acc.username === player);
      
      if (playerAccount) {
        const stats = await fetchClashPlayerData(playerAccount.clashTag);
        if (stats) {
          playerStats[player] = stats;
        }
      }
    }

    const bracket = generateSeededBracket(tournament.players, playerStats);
    const firstRoundMatches = bracket.map((pair, idx) => ({
      id: `${tournamentId}-${idx}`,
      tournamentId,
      player1: pair[0],
      player2: pair[1],
      player1Tag: playerStats[pair[0]]?.tag || '',
      player2Tag: playerStats[pair[1]]?.tag || '',
      player1Stats: playerStats[pair[0]] || null,
      player2Stats: playerStats[pair[1]] || null,
      round: 1,
      status: 'pending',
      player1Ready: false,
      player2Ready: false,
      player1ReadyTime: null,
      player2ReadyTime: null,
      scheduledStartTime: null,
      winner1Vote: null,
      winner2Vote: null,
      player1VoteTime: null,
      player2VoteTime: null,
      player1Screenshot: null,
      player2Screenshot: null,
    }));

    setTournaments(prev => prev.map(t => {
      if (t.id === tournamentId) {
        return {
          ...t,
          status: 'in_progress',
          bracket,
          matches: firstRoundMatches,
          playerStats,
        };
      }
      return t;
    }));

    saveData(tournaments);
  };

  const handlePlayerReady = (matchId) => {
    setTournaments(prev => prev.map(t => {
      const updatedMatches = t.matches.map(m => {
        if (m.id === matchId) {
          const isPlayer1 = currentUser.username === m.player1;
          const updatedMatch = {
            ...m,
            [isPlayer1 ? 'player1Ready' : 'player2Ready']: true,
            [isPlayer1 ? 'player1ReadyTime' : 'player2ReadyTime']: new Date().getTime(),
          };

          if (updatedMatch.player1Ready && updatedMatch.player2Ready && !updatedMatch.scheduledStartTime) {
            updatedMatch.status = 'scheduled';
            updatedMatch.scheduledStartTime = new Date().getTime();
          } else if (updatedMatch.player1Ready && updatedMatch.player2Ready) {
            updatedMatch.status = 'active';
          }

          return updatedMatch;
        }
        return m;
      });

      return { ...t, matches: updatedMatches };
    }));

    saveData(tournaments);
  };

  const handleReportMatch = (matchId, selectedWinner, screenshot) => {
    const now = new Date().getTime();
    
    setTournaments(prev => prev.map(t => {
      const updatedMatches = t.matches.map(m => {
        if (m.id === matchId) {
          const isPlayer1 = currentUser.username === m.player1;
          const updatedMatch = {
            ...m,
            [isPlayer1 ? 'winner1Vote' : 'winner2Vote']: selectedWinner,
            [isPlayer1 ? 'player1VoteTime' : 'player2VoteTime']: now,
            [isPlayer1 ? 'player1Screenshot' : 'player2Screenshot']: screenshot,
          };

          if (updatedMatch.winner1Vote && updatedMatch.winner2Vote) {
            if (updatedMatch.winner1Vote === updatedMatch.winner2Vote) {
              updatedMatch.status = 'completed';
              updatedMatch.winner = updatedMatch.winner1Vote;
              updatedMatch.completedAt = now;
            } else {
              updatedMatch.status = 'disputed';
            }
          } else {
            updatedMatch.status = 'waiting_for_opponent';
          }

          return updatedMatch;
        }
        return m;
      });

      return { ...t, matches: updatedMatches };
    }));

    saveData(tournaments);
  };

  const handleResolveDispute = (matchId, winner) => {
    setTournaments(prev => prev.map(t => {
      const updatedMatches = t.matches.map(m => {
        if (m.id === matchId) {
          return {
            ...m,
            status: 'completed',
            winner,
            resolvedBy: currentUser.username,
          };
        }
        return m;
      });
      return { ...t, matches: updatedMatches };
    }));
    saveData(tournaments);
  };

  const handleMatchTimeout = (tournamentId, matchId, resolution) => {
    setTournaments(prev => prev.map(t => {
      if (t.id === tournamentId) {
        const updatedMatches = t.matches.map(m => {
          if (m.id === matchId) {
            if (resolution === 'no_report') {
              return {
                ...m,
                status: 'needs_staff_review',
                timeoutAt: new Date().getTime(),
                resolvedReason: 'no_report_timeout',
              };
            } else {
              return {
                ...m,
                status: 'completed',
                winner: resolution,
                autoResolvedAt: new Date().getTime(),
                resolvedReason: 'opponent_timeout',
              };
            }
          }
          return m;
        });
        return { ...t, matches: updatedMatches };
      }
      return t;
    }));

    saveData(tournaments);
  };

  const handleCreateFlag = (flagData) => {
    const newFlag = {
      id: Date.now(),
      ...flagData,
      createdBy: currentUser.username,
      createdAt: new Date().toISOString(),
      status: 'open',
      priority: flagData.priority || 'normal',
      responses: [],
      resolvedAt: null,
      resolvedBy: null,
    };

    const updatedFlags = JSON.parse(localStorage.getItem('flags') || '[]');
    updatedFlags.push(newFlag);
    localStorage.setItem('flags', JSON.stringify(updatedFlags));
  };

  const handleUpdateFlagStatus = (flagId, status, staffResponse = null) => {
    const flags = JSON.parse(localStorage.getItem('flags') || '[]');
    const updatedFlags = flags.map(flag => {
      if (flag.id === flagId) {
        const updated = { ...flag, status };
        if (status === 'resolved') {
          updated.resolvedAt = new Date().toISOString();
          updated.resolvedBy = currentUser.username;
        }
        if (staffResponse) {
          updated.responses = [...(updated.responses || []), {
            sender: currentUser.username,
            message: staffResponse,
            timestamp: new Date().toISOString(),
          }];
        }
        return updated;
      }
      return flag;
    });
    localStorage.setItem('flags', JSON.stringify(updatedFlags));
  };

  const handleAddFlagResponse = (flagId, message) => {
    const flags = JSON.parse(localStorage.getItem('flags') || '[]');
    const updatedFlags = flags.map(flag => {
      if (flag.id === flagId) {
        return {
          ...flag,
          responses: [...(flag.responses || []), {
            sender: currentUser.username,
            message,
            timestamp: new Date().toISOString(),
          }],
        };
      }
      return flag;
    });
    localStorage.setItem('flags', JSON.stringify(updatedFlags));
  };

  useEffect(() => {
    const interval = setInterval(() => {
      checkMatchTimeouts(tournaments, handleMatchTimeout);
      
      tournaments.forEach(tournament => {
        if (tournament.status === 'in_progress') {
          const roundNumbers = [...new Set(tournament.matches.map(m => m.round))];
          
          roundNumbers.forEach(round => {
            const roundMatches = tournament.matches.filter(m => m.round === round);
            const allComplete = roundMatches.every(m => m.status === 'completed' || m.status === 'disputed' || m.status === 'needs_staff_review');
            
            if (allComplete && round < 10) {
              const nextRound = round + 1;
              const alreadyHasNextRound = tournament.matches.some(m => m.round === nextRound);
              
              if (!alreadyHasNextRound) {
                const winners = roundMatches
                  .filter(m => m.status === 'completed')
                  .map(m => m.winner);

                if (winners.length === 1) {
                  setTournaments(prev => prev.map(t => {
                    if (t.id === tournament.id) {
                      return { ...t, status: 'completed', champion: winners[0] };
                    }
                    return t;
                  }));
                } else if (winners.length > 1) {
                  const nextRoundMatches = [];
                  for (let i = 0; i < winners.length; i += 2) {
                    if (winners[i + 1]) {
                      const now = new Date().getTime();
                      nextRoundMatches.push({
                        id: `${tournament.id}-r${nextRound}-${i / 2}`,
                        tournamentId: tournament.id,
                        player1: winners[i],
                        player2: winners[i + 1],
                        player1Tag: tournament.playerStats?.[winners[i]]?.tag || '',
                        player2Tag: tournament.playerStats?.[winners[i + 1]]?.tag || '',
                        player1Stats: tournament.playerStats?.[winners[i]] || null,
                        player2Stats: tournament.playerStats?.[winners[i + 1]] || null,
                        round: nextRound,
                        status: 'pending',
                        player1Ready: false,
                        player2Ready: false,
                        winner1Vote: null,
                        winner2Vote: null,
                        player1Screenshot: null,
                        player2Screenshot: null,
                      });
                    }
                  }

                  setTournaments(prev => prev.map(t => {
                    if (t.id === tournament.id) {
                      return { ...t, matches: [...t.matches, ...nextRoundMatches] };
                    }
                    return t;
                  }));
                }
              }
            }
          });
        }
      });
    }, 10000);

    return () => clearInterval(interval);
  }, [tournaments]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {currentUser && (
        <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-2">
                <Trophy className="w-8 h-8 text-yellow-500" />
                <span className="font-bold text-xl hidden sm:inline">Clash Tournaments</span>
              </div>

              <div className="hidden md:flex items-center gap-6">
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className="hover:text-yellow-500 transition"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setCurrentPage('create')}
                  className="hover:text-yellow-500 transition"
                >
                  Create Tournament
                </button>
                {currentUser.isStaff && (
                  <button
                    onClick={() => setCurrentPage('staff_dashboard')}
                    className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition"
                  >
                    Staff Dashboard
                  </button>
                )}
                <div className="text-sm text-gray-400">
                  {currentUser.username}
                  <div className="text-xs text-gray-500">{currentUser.clashTag}</div>
                  {currentUser.isStaff && <span className="ml-2 text-red-500">[STAFF]</span>}
                </div>
                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded transition"
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
                    setCurrentPage('create');
                    setMobileMenuOpen(false);
                  }}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-700 rounded"
                >
                  Create Tournament
                </button>
                {currentUser.isStaff && (
                  <button
                    onClick={() => {
                      setCurrentPage('staff_dashboard');
                      setMobileMenuOpen(false);
                    }}
                    className="block w-full text-left bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
                  >
                    Staff Dashboard
                  </button>
                )}
                <div className="px-4 py-2 text-sm text-gray-400 border-t border-gray-700 pt-3">
                  {currentUser.username}
                  {currentUser.isStaff && <span className="ml-2 text-red-500">[STAFF]</span>}
                </div>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </nav>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPage === 'login' && (
          <LoginPage onLogin={handleLogin} />
        )}

        {currentPage === 'dashboard' && currentUser && (
          <DashboardPage
            user={currentUser}
            tournaments={tournaments}
            onJoinTournament={handleJoinTournament}
            onStartTournament={handleStartTournament}
            setCurrentPage={setCurrentPage}
          />
        )}

        {currentPage === 'create' && currentUser && (
          <CreateTournamentPage
            onCreateTournament={handleCreateTournament}
            onCancel={() => setCurrentPage('dashboard')}
          />
        )}

        {currentPage === 'tournament' && currentUser && (
          <TournamentPage
            tournament={tournaments.find(t => t.id === currentUser.selectedTournament)}
            user={currentUser}
            onSelectMatch={() => setCurrentPage('match')}
            onReportMatch={handleReportMatch}
            onResolveDispute={handleResolveDispute}
            onPlayerReady={handlePlayerReady}
            setCurrentPage={setCurrentPage}
            tournaments={tournaments}
            onFlagMatch={(matchId) => {
              setFlagRelatedMatch(matchId);
              setFlagModalOpen(true);
            }}
          />
        )}

        {currentPage === 'match' && currentUser && (
          <MatchPage
            match={tournaments
              .flatMap(t => t.matches)
              .find(m => m.id === currentUser.selectedMatch)}
            user={currentUser}
            onReportWinner={(winner, screenshot) => {
              handleReportMatch(currentUser.selectedMatch, winner, screenshot);
              setCurrentPage('tournament');
            }}
            onCancel={() => setCurrentPage('tournament')}
          />
        )}

        {currentPage === 'staff_dashboard' && currentUser?.isStaff && (
          <StaffDashboard
            user={currentUser}
            setCurrentPage={setCurrentPage}
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

function LoginPage({ onLogin }) {
  const [isCreating, setIsCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clashTag, setClashTag] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [isStaff, setIsStaff] = useState(false);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState(() => {
    const saved = localStorage.getItem('accounts');
    return saved ? JSON.parse(saved) : [];
  });

  const STAFF_PASSWORD = 'clash2024';

  const saveAccounts = (newAccounts) => {
    localStorage.setItem('accounts', JSON.stringify(newAccounts));
    setAccounts(newAccounts);
  };

  const handleCreateAccount = (e) => {
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

    if (accounts.some(acc => acc.username === username)) {
      setError('Username already exists');
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

    const newAccount = {
      username,
      password,
      clashTag: clashTag.toUpperCase(),
      createdAt: new Date().toISOString(),
    };

    const newAccounts = [...accounts, newAccount];
    saveAccounts(newAccounts);

    onLogin({ username, password, isStaff: false, clashTag: clashTag.toUpperCase() });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    const account = accounts.find(acc => acc.username === username);

    if (!account) {
      setError('Account not found');
      return;
    }

    if (account.password !== password) {
      setError('Incorrect password');
      return;
    }

    if (isStaff && staffPassword !== STAFF_PASSWORD) {
      setError('Incorrect staff password');
      return;
    }

    onLogin({ 
      username, 
      password, 
      isStaff, 
      clashTag: account.clashTag 
    });
  };

  if (isCreating) {
    return (
      <div className="max-w-md mx-auto mt-20">
        <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
          <h1 className="text-3xl font-bold mb-8 text-center flex items-center justify-center gap-2">
            <Trophy className="w-8 h-8 text-yellow-500" />
            Create Account
          </h1>

          {error && (
            <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded text-red-300 text-sm">
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
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
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
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
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
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
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
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
                placeholder="e.g., #ABC123XYZ"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Find your tag in your Clash profile</p>
            </div>

            <button
              type="submit"
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-4 rounded transition"
            >
              Create Account
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
              }}
              className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded transition"
            >
              Back to Login
            </button>
          </form>

          <p className="text-xs text-gray-400 mt-6 text-center">
            {accounts.length} account(s) created
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
        <h1 className="text-3xl font-bold mb-8 text-center flex items-center justify-center gap-2">
          <Trophy className="w-8 h-8 text-yellow-500" />
          Clash Tournaments
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded text-red-300 text-sm">
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
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
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
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              placeholder="Enter password"
              required
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isStaff}
              onChange={(e) => setIsStaff(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Login as staff member</span>
          </label>

          {isStaff && (
            <div>
              <label className="block text-sm font-medium mb-2">Staff Password</label>
              <input
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                className="w-full bg-gray-700 border border-red-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-red-500"
                placeholder="Enter staff password"
                required
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-4 rounded transition"
          >
            Login
          </button>
        </form>

        <button
          onClick={() => {
            setIsCreating(true);
            setError('');
            setUsername('');
            setPassword('');
            setStaffPassword('');
            setIsStaff(false);
          }}
          className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition"
        >
          Create New Account
        </button>
      </div>
    </div>
  );
}

function DashboardPage({ user, tournaments, onJoinTournament, onStartTournament, setCurrentPage }) {
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
          value={tournaments
            .flatMap(t => t.matches)
            .filter(m => m.status === 'waiting_for_opponent' || m.status === 'pending' || m.status === 'scheduled')
            .filter(m => m.player1 === user.username || m.player2 === user.username).length}
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
                onView={() => {
                  setCurrentPage('tournament');
                  user.selectedTournament = tournament.id;
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function TournamentCard({ tournament, user, onJoin, onStart, onView }) {
  const isCreator = tournament.createdBy === user.username;
  const hasJoined = tournament.players.includes(user.username);

  return (
    <div className="bg-gray-700 rounded p-4 flex justify-between items-center">
      <div className="flex-1">
        <h3 className="font-bold text-lg">{tournament.name}</h3>
        <div className="text-sm text-gray-300 mt-1">
          <p>Creator: {tournament.createdBy}</p>
          <p>Players: {tournament.players.length} | Status: <span className="text-yellow-500">{tournament.status === 'loading_stats' ? 'Loading...' : tournament.status}</span></p>
        </div>
      </div>
      <div className="flex gap-2">
        {!hasJoined && !isCreator && tournament.status === 'signups_open' && (
          <button
            onClick={() => onJoin(tournament.id)}
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm transition"
          >
            Join
          </button>
        )}
        {isCreator && tournament.status === 'signups_open' && tournament.players.length >= 2 && (
          <button
            onClick={() => onStart(tournament.id)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm transition"
          >
            Start Tournament
          </button>
        )}
        {tournament.status === 'loading_stats' && (
          <div className="text-yellow-500 text-sm">Fetching player data...</div>
        )}
        <button
          onClick={onView}
          className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded text-sm transition"
        >
          View
        </button>
      </div>
    </div>
  );
}

function CreateTournamentPage({ onCreateTournament, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [format, setFormat] = useState('single_elimination');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onCreateTournament({ name, description, format });
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-8">
        <h2 className="text-2xl font-bold mb-6">Create Tournament</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Tournament Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              placeholder="e.g., Builder Base April Cup"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              placeholder="Details about your tournament"
              rows="4"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white focus:outline-none focus:border-yellow-500"
            >
              <option value="single_elimination">Single Elimination</option>
              <option value="double_elimination">Double Elimination (Coming Soon)</option>
            </select>
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-4 rounded transition"
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

function TournamentPage({ tournament, user, setCurrentPage, tournaments, onReportMatch, onPlayerReady, onFlagMatch }) {
  if (!tournament) {
    return (
      <div className="text-center">
        <p className="text-gray-400">Tournament not found</p>
      </div>
    );
  }

  const rounds = [...new Set(tournament.matches.map(m => m.round))].sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>
        <p className="text-gray-400">{tournament.description}</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-400">Status</p>
            <p className="text-lg font-bold text-yellow-500">{tournament.status === 'loading_stats' ? 'Loading...' : tournament.status}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Players</p>
            <p className="text-lg font-bold">{tournament.players.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Matches</p>
            <p className="text-lg font-bold">{tournament.matches.length}</p>
          </div>
          {tournament.champion && (
            <div>
              <p className="text-sm text-gray-400">Champion</p>
              <p className="text-lg font-bold text-yellow-500">{tournament.champion}</p>
            </div>
          )}
        </div>
      </div>

      {user.isStaff && tournament.matches.filter(m => m.status === 'disputed').length > 0 && (
        <DisputeReview tournament={tournament} user={user} setCurrentPage={setCurrentPage} />
      )}

      {rounds.map(round => (
        <div key={round} className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-xl font-bold mb-4">Round {round}</h2>
          <div className="space-y-3">
            {tournament.matches
              .filter(m => m.round === round)
              .map(match => (
                <MatchCard
                  key={match.id}
                  match={match}
                  user={user}
                  onSelectMatch={() => {
                    user.selectedMatch = match.id;
                    setCurrentPage('match');
                  }}
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
  const opponent = match.player1 === user.username ? match.player2 : match.player1;
  const timeDisplay = getTimeRemainingDisplay(match.scheduledStartTime);

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-900';
      case 'disputed':
        return 'bg-red-900';
      case 'active':
        return 'bg-blue-900';
      case 'scheduled':
        return 'bg-purple-900';
      case 'waiting_for_opponent':
        return 'bg-yellow-900';
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
            {match.player1Ready && match.status === 'pending' && <div className="text-xs text-green-400">✓ Ready</div>}
          </div>
          <span className="text-gray-400">vs</span>
          <div>
            <span className="font-bold">{match.player2}</span>
            <div className="text-xs text-gray-400">#{match.player2Tag}</div>
            {match.player2Ready && match.status === 'pending' && <div className="text-xs text-green-400">✓ Ready</div>}
          </div>
          {getStatusIcon(match.status)}
        </div>
        <div className="text-sm text-gray-300 mt-2">
          {match.status === 'pending' && (
            <p className="text-blue-300">
              {match.player1Ready && match.player2Ready ? '⏱️ Both players ready! Match will start soon.' : 'Waiting for both players to confirm ready...'}
            </p>
          )}
          {match.status === 'scheduled' && (
            <p className="text-purple-300">Match scheduled - coordinate timing with opponent</p>
          )}
          {match.status === 'active' && (
            <p className="text-yellow-300">🎮 Match is LIVE - Play now in-game and report results</p>
          )}
          {match.status === 'completed' && (
            <p>Winner: <span className="text-green-300 font-bold">{match.winner}</span></p>
          )}
          {match.status === 'disputed' && (
            <p className="text-red-300">Disputed • {match.player1} voted: {match.winner1Vote} | {match.player2} voted: {match.winner2Vote}</p>
          )}
          {match.status === 'waiting_for_opponent' && userIsPlayer && (
            <>
              <p>You voted for: <span className="text-yellow-300 font-bold">{userVote}</span></p>
              {userVote && (
                <div className="text-xs text-green-400 mt-1">
                  📸 Screenshot submitted
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">Waiting for opponent...</p>
            </>
          )}
          {(match.status === 'active' || match.status === 'scheduled') && match.scheduledStartTime && (
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
            className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-sm transition"
          >
            I'm Ready
          </button>
        )}
        {userIsPlayer && match.status === 'pending' && userReady && (
          <div className="text-sm text-green-400">✓ You're Ready</div>
        )}
        {userIsPlayer && (match.status === 'active' || match.status === 'scheduled') && !userVote && (
          <button
            onClick={onSelectMatch}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm transition"
          >
            Report Result
          </button>
        )}
        {userIsPlayer && userVote && match.status !== 'completed' && match.status !== 'disputed' && (
          <div className="text-sm text-yellow-300">Waiting for opponent...</div>
        )}
        {userIsPlayer && (match.status === 'active' || match.status === 'scheduled') && (
          <button
            onClick={onFlagMatch}
            className="bg-red-700 hover:bg-red-800 px-3 py-2 rounded text-sm transition"
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
      setMessages([
        ...messages,
        {
          sender: user.username,
          text: messageText,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setMessageText('');
    }
  };

  const handleScreenshotUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshot(event.target.result);
        setScreenshotPreview(event.target.result);
      };
      reader.readAsDataURL(file);
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
                <div className={`mt-1 ${msg.sender === user.username ? 'text-yellow-300' : 'text-gray-300'}`}>
                  {msg.text}
                </div>
                <div className="text-xs text-gray-500 mt-1">{msg.timestamp}</div>
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
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
            placeholder="Type your message..."
          />
          <button
            onClick={handleSendMessage}
            className="bg-yellow-500 hover:bg-yellow-600 p-2 rounded transition"
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
            <div className="border-2 border-dashed border-gray-600 rounded p-4 text-center cursor-pointer hover:border-yellow-500 transition">
              {screenshotPreview ? (
                <div>
                  <img src={screenshotPreview} alt="Preview" className="w-full h-auto rounded mb-2 max-h-48" />
                  <p className="text-xs text-green-400">✓ Screenshot uploaded</p>
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
                ? 'bg-green-600 text-white'
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
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600'
            } ${selectedWinner !== null && selectedWinner !== match.player2 ? 'opacity-50' : ''} ${!screenshot ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {match.player2} won
          </button>
        </div>

        {selectedWinner && (
          <div className="mt-4 p-3 bg-green-900 rounded text-green-300 text-sm text-center">
            ✓ Vote submitted! Waiting for opponent to confirm...
          </div>
        )}

        {!screenshot && selectedWinner === null && (
          <div className="mt-4 p-3 bg-yellow-900 rounded text-yellow-300 text-sm text-center">
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

function DisputeReview({ tournament, user, setCurrentPage }) {
  const [expandedDispute, setExpandedDispute] = useState(null);
  const disputes = tournament.matches.filter(m => m.status === 'disputed');
  const noReports = tournament.matches.filter(m => m.status === 'needs_staff_review');
  const allIssues = [...disputes, ...noReports];

  if (allIssues.length === 0) return null;

  return (
    <div className="bg-red-900 border border-red-700 rounded-lg p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <AlertCircle className="w-6 h-6" />
        Pending Staff Review ({allIssues.length})
      </h2>
      <div className="space-y-3">
        {disputes.map(dispute => (
          <div key={dispute.id} className="bg-red-800 rounded p-4">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div className="flex-1">
                <p className="font-bold mb-2">
                  {dispute.player1} <span className="text-gray-300">vs</span> {dispute.player2}
                </p>
                <p className="text-sm text-gray-300 mb-2">
                  {dispute.player1} voted: <span className="text-yellow-300 font-bold">{dispute.winner1Vote}</span>
                </p>
                <p className="text-sm text-gray-300 mb-3">
                  {dispute.player2} voted: <span className="text-yellow-300 font-bold">{dispute.winner2Vote}</span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {dispute.player1Screenshot && (
                    <button
                      onClick={() => setExpandedDispute(expandedDispute === `${dispute.id}-p1` ? null : `${dispute.id}-p1`)}
                      className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition"
                    >
                      📸 {dispute.player1}'s Screenshot
                    </button>
                  )}
                  {dispute.player2Screenshot && (
                    <button
                      onClick={() => setExpandedDispute(expandedDispute === `${dispute.id}-p2` ? null : `${dispute.id}-p2`)}
                      className="text-xs bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded transition"
                    >
                      📸 {dispute.player2}'s Screenshot
                    </button>
                  )}
                </div>
                {expandedDispute === `${dispute.id}-p1` && dispute.player1Screenshot && (
                  <img src={dispute.player1Screenshot} alt="Player 1 proof" className="mt-3 max-h-64 rounded border border-gray-600" />
                )}
                {expandedDispute === `${dispute.id}-p2` && dispute.player2Screenshot && (
                  <img src={dispute.player2Screenshot} alt="Player 2 proof" className="mt-3 max-h-64 rounded border border-gray-600" />
                )}
              </div>
              <div className="flex gap-2 ml-4">
                <button className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm transition">
                  Accept {dispute.winner1Vote}
                </button>
                <button className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm transition">
                  Accept {dispute.winner2Vote}
                </button>
              </div>
            </div>
          </div>
        ))}

        {noReports.map(match => (
          <div key={match.id} className="bg-orange-800 rounded p-4 border-l-4 border-orange-500">
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <p className="font-bold mb-2 text-orange-100">
                  {match.player1} <span className="text-gray-300">vs</span> {match.player2}
                </p>
                <p className="text-sm text-orange-200 mb-2">
                  🕐 No results reported within 16 hours
                </p>
                <p className="text-xs text-gray-300 mb-3">
                  Timed out: {new Date(match.timeoutAt).toLocaleString()}
                </p>
              </div>
              <button className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-sm transition">
                Review & Decide
              </button>
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
        <div className="text-yellow-500">{icon}</div>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function fetchClashPlayerData(playerTag) {
  try {
    const cleanTag = playerTag.startsWith('#') ? playerTag.slice(1) : playerTag;
    const response = await fetch(`https://api.clashofclans.com/v1/players/%23${cleanTag}`);
    
    if (!response.ok) {
      console.error('Player not found');
      return null;
    }

    const data = await response.json();
    
    return {
      name: data.name,
      tag: data.tag,
      bestBuilderBaseTrophies: data.bestBuildersHall || 0,
      builderBaseTrophies: data.builderBaseTrophies || 0,
      builderBaseHall: data.builderHallLevel || 0,
      townHallLevel: data.townHallLevel,
    };
  } catch (error) {
    console.error('Error fetching player data:', error);
    return null;
  }
}

function generateSeededBracket(players, playerStats) {
  const sorted = [...players].sort((a, b) => {
    const aStats = playerStats[a] || { bestBuilderBaseTrophies: 0 };
    const bStats = playerStats[b] || { bestBuilderBaseTrophies: 0 };
    return bStats.bestBuilderBaseTrophies - aStats.bestBuilderBaseTrophies;
  });

  const seeded = [];
  const top = [];
  const bottom = [];

  sorted.forEach((player, index) => {
    if (index % 2 === 0) {
      top.push(player);
    } else {
      bottom.unshift(player);
    }
  });

  seeded.push(...top, ...bottom);

  const pairs = [];
  for (let i = 0; i < seeded.length; i += 2) {
    if (i + 1 < seeded.length) {
      pairs.push([seeded[i], seeded[i + 1]]);
    } else {
      pairs.push([seeded[i], 'BYE']);
    }
  }

  return pairs;
}

function checkMatchTimeouts(tournaments, onTimeout) {
  const now = new Date().getTime();
  const TIMEOUT_MS = 16 * 60 * 60 * 1000;

  tournaments.forEach(tournament => {
    tournament.matches?.forEach(match => {
      if ((match.status === 'active' || match.status === 'scheduled') && match.scheduledStartTime) {
        const elapsed = now - match.scheduledStartTime;
        
        if (elapsed > TIMEOUT_MS) {
          const player1Reported = !!match.winner1Vote;
          const player2Reported = !!match.winner2Vote;
          
          if (!player1Reported && !player2Reported) {
            onTimeout(tournament.id, match.id, 'no_report');
          }
          else if (player1Reported && !player2Reported) {
            onTimeout(tournament.id, match.id, match.winner1Vote);
          } else if (player2Reported && !player1Reported) {
            onTimeout(tournament.id, match.id, match.winner2Vote);
          }
        }
      }
    });
  });
}

function getTimeRemaining(startTime) {
  if (!startTime) return null;
  const now = new Date().getTime();
  const elapsed = now - startTime;
  const TIMEOUT_MS = 16 * 60 * 60 * 1000;
  const remaining = TIMEOUT_MS - elapsed;
  
  if (remaining <= 0) return 'EXPIRED';
  
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  return `${hours}h ${minutes}m`;
}

function getTimeRemainingDisplay(startTime) {
  const remaining = getTimeRemaining(startTime);
  if (!remaining) return null;
  if (remaining === 'EXPIRED') return { text: 'TIMEOUT', color: 'text-red-400' };
  
  const hours = parseInt(remaining);
  if (hours <= 2) return { text: remaining, color: 'text-red-400' };
  if (hours <= 8) return { text: remaining, color: 'text-yellow-400' };
  return { text: remaining, color: 'text-green-400' };
}
