import React, { useState, useEffect } from 'react';
import { MessageCircle, Users, Trophy, LogOut, Menu, X, Send, CheckCircle, AlertCircle } from 'lucide-react';

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
export default function TournamentApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPage, setCurrentPage] = useState('login');
  const [tournaments, setTournaments] = useState([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize with mock data (will connect to Firebase)
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

  const handleStartTournament = (tournamentId) => {
    setTournaments(prev => prev.map(t => {
      if (t.id === tournamentId) {
        const bracket = generateBracket(t.players);
        const firstRoundMatches = bracket.map((pair, idx) => ({
          id: `${tournamentId}-${idx}`,
          tournamentId,
          player1: pair[0],
          player2: pair[1],
          round: 1,
          status: 'pending',
          winner1Vote: null,
          winner2Vote: null,
        }));
        return {
          ...t,
          status: 'in_progress',
          bracket,
          matches: firstRoundMatches,
        };
      }
      return t;
    }));
    saveData(tournaments);
  };

  const handleReportMatch = (matchId, selectedWinner) => {
    setTournaments(prev => prev.map(t => {
      const updatedMatches = t.matches.map(m => {
        if (m.id === matchId) {
          const isPlayer1 = currentUser.username === m.player1;
          const updatedMatch = {
            ...m,
            [isPlayer1 ? 'winner1Vote' : 'winner2Vote']: selectedWinner,
          };

          // Check if both voted
          if (updatedMatch.winner1Vote && updatedMatch.winner2Vote) {
            if (updatedMatch.winner1Vote === updatedMatch.winner2Vote) {
              updatedMatch.status = 'completed';
              updatedMatch.winner = updatedMatch.winner1Vote;
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

  const handleAdvanceWinner = (matchId) => {
    const match = tournaments
      .flatMap(t => t.matches)
      .find(m => m.id === matchId);
    
    if (!match) return;

    const tournament = tournaments.find(t => t.id === match.tournamentId);
    const nextRound = match.round + 1;
    
    // Check if this is the final
    const completedThisRound = tournament.matches.filter(m => m.round === match.round && m.status === 'completed').length;
    const totalThisRound = tournament.matches.filter(m => m.round === match.round).length;

    if (completedThisRound * 2 === totalThisRound) {
      // Can generate next round
      const winners = tournament.matches
        .filter(m => m.round === match.round && m.status === 'completed')
        .map(m => m.winner);

      if (winners.length === 1) {
        // Tournament is over
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
            nextRoundMatches.push({
              id: `${tournament.id}-r${nextRound}-${i / 2}`,
              tournamentId: tournament.id,
              player1: winners[i],
              player2: winners[i + 1],
              round: nextRound,
              status: 'pending',
              winner1Vote: null,
              winner2Vote: null,
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
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navigation */}
      {currentUser && (
        <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-2">
                <Trophy className="w-8 h-8 text-yellow-500" />
                <span className="font-bold text-xl hidden sm:inline">Clash Tournaments</span>
              </div>

              {/* Desktop Menu */}
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
                <div className="text-sm text-gray-400">
                  {currentUser.username}
                  {currentUser.isStaff && <span className="ml-2 text-red-500">[STAFF]</span>}
                </div>
                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded transition"
                >
                  Logout
                </button>
              </div>

              {/* Mobile Menu Button */}
              <button
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>

            {/* Mobile Menu */}
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

      {/* Page Content */}
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
            onViewTournament={() => setCurrentPage('tournament')}
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
            onAdvanceWinner={handleAdvanceWinner}
            setCurrentPage={setCurrentPage}
            tournaments={tournaments}
          />
        )}

        {currentPage === 'match' && currentUser && (
          <MatchPage
            match={tournaments
              .flatMap(t => t.matches)
              .find(m => m.id === currentUser.selectedMatch)}
            user={currentUser}
            onReportWinner={(winner) => {
              handleReportMatch(currentUser.selectedMatch, winner);
              setCurrentPage('tournament');
            }}
            onCancel={() => setCurrentPage('tournament')}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PAGE COMPONENTS
// ============================================================================

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isStaff, setIsStaff] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin({ username, password, isStaff });
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <div className="bg-gray-800 rounded-lg p-8 border border-gray-700">
        <h1 className="text-3xl font-bold mb-8 text-center flex items-center justify-center gap-2">
          <Trophy className="w-8 h-8 text-yellow-500" />
          Clash Tournaments
        </h1>

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
            <label className="block text-sm font-medium mb-2">Password (optional)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-500"
              placeholder="Enter password"
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

          <button
            type="submit"
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-4 rounded transition"
          >
            Login
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-6 text-center">
          Demo Mode: Use any username to get started. Check "Staff" to access dispute resolution.
        </p>
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
            .filter(m => m.status === 'waiting_for_opponent' || m.status === 'pending')
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
          <p>Players: {tournament.players.length} | Status: <span className="text-yellow-500">{tournament.status}</span></p>
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

function TournamentPage({ tournament, user, setCurrentPage, tournaments, onReportMatch }) {
  if (!tournament) {
    return (
      <div className="text-center">
        <p className="text-gray-400">Tournament not found</p>
      </div>
    );
  }

  const userMatches = tournament.matches.filter(
    m => m.player1 === user.username || m.player2 === user.username
  );

  const rounds = [...new Set(tournament.matches.map(m => m.round))].sort((a, b) => a - b);

  return (
    <div className="space-y-8">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h1 className="text-3xl font-bold mb-2">{tournament.name}</h1>
        <p className="text-gray-400">{tournament.description}</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-400">Status</p>
            <p className="text-lg font-bold text-yellow-500">{tournament.status}</p>
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
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchCard({ match, user, onSelectMatch }) {
  const userIsPlayer = match.player1 === user.username || match.player2 === user.username;
  const userVote = match.player1 === user.username ? match.winner1Vote : match.winner2Vote;
  const opponent = match.player1 === user.username ? match.player2 : match.player1;

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-900';
      case 'disputed':
        return 'bg-red-900';
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
    <div className={`${getStatusColor(match.status)} rounded p-4 flex items-center justify-between`}>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold">{match.player1}</span>
          <span className="text-gray-400">vs</span>
          <span className="font-bold">{match.player2}</span>
          {getStatusIcon(match.status)}
        </div>
        <div className="text-sm text-gray-300 mt-2">
          {match.status === 'completed' && (
            <p>Winner: <span className="text-green-300 font-bold">{match.winner}</span></p>
          )}
          {match.status === 'disputed' && (
            <p className="text-red-300">Disputed • {match.player1} voted: {match.winner1Vote} | {match.player2} voted: {match.winner2Vote}</p>
          )}
          {match.status === 'waiting_for_opponent' && userIsPlayer && (
            <p>You voted for: <span className="text-yellow-300 font-bold">{userVote}</span> • Waiting for opponent...</p>
          )}
        </div>
      </div>
      {userIsPlayer && match.status === 'pending' && (
        <button
          onClick={onSelectMatch}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded ml-4 transition"
        >
          Play Match
        </button>
      )}
      {userIsPlayer && match.status === 'waiting_for_opponent' && (
        <div className="text-sm text-yellow-300 ml-4">Waiting...</div>
      )}
    </div>
  );
}

function MatchPage({ match, user, onReportWinner, onCancel }) {
  const [selectedWinner, setSelectedWinner] = useState(null);
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

  const handleReportWinner = (winner) => {
    setSelectedWinner(winner);
    // Simulate a small delay for UX
    setTimeout(() => {
      onReportWinner(winner);
    }, 500);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-screen md:h-auto">
      {/* Chat Section */}
      <div className="lg:col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-6 flex flex-col">
        <h2 className="text-xl font-bold mb-4">Match Chat</h2>
        <div className="flex-1 mb-4 bg-gray-700 rounded p-4 overflow-y-auto space-y-3 max-h-96">
          {messages.length === 0 ? (
            <p className="text-gray-400 text-center text-sm mt-20">
              Chat with your opponent here. Discuss the match, agree on terms, etc.
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

      {/* Match Result Section */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 h-fit">
        <h3 className="font-bold text-lg mb-4">Report Match Result</h3>

        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">You're playing against:</p>
          <p className="text-lg font-bold">{opponent}</p>
        </div>

        <p className="text-sm text-gray-300 mb-4">
          Play your match in-game now. When finished, select who won:
        </p>

        <div className="space-y-2">
          <button
            onClick={() => handleReportWinner(match.player1)}
            disabled={selectedWinner !== null}
            className={`w-full p-3 rounded font-bold transition ${
              selectedWinner === match.player1
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600'
            } ${selectedWinner !== null && selectedWinner !== match.player1 ? 'opacity-50' : ''}`}
          >
            {match.player1} won
          </button>
          <button
            onClick={() => handleReportWinner(match.player2)}
            disabled={selectedWinner !== null}
            className={`w-full p-3 rounded font-bold transition ${
              selectedWinner === match.player2
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600'
            } ${selectedWinner !== null && selectedWinner !== match.player2 ? 'opacity-50' : ''}`}
          >
            {match.player2} won
          </button>
        </div>

        {selectedWinner && (
          <div className="mt-4 p-3 bg-green-900 rounded text-green-300 text-sm text-center">
            ✓ Vote submitted! Waiting for opponent to confirm...
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
  const disputes = tournament.matches.filter(m => m.status === 'disputed');

  if (disputes.length === 0) return null;

  return (
    <div className="bg-red-900 border border-red-700 rounded-lg p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <AlertCircle className="w-6 h-6" />
        Disputes Pending Staff Review
      </h2>
      <div className="space-y-3">
        {disputes.map(dispute => (
          <div key={dispute.id} className="bg-red-800 rounded p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-bold mb-2">
                  {dispute.player1} <span className="text-gray-300">vs</span> {dispute.player2}
                </p>
                <p className="text-sm text-gray-300">
                  {dispute.player1} voted: <span className="text-yellow-300">{dispute.winner1Vote}</span>
                </p>
                <p className="text-sm text-gray-300">
                  {dispute.player2} voted: <span className="text-yellow-300">{dispute.winner2Vote}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm transition">
                  Accept P1
                </button>
                <button className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm transition">
                  Accept P2
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
        <div className="text-yellow-500">{icon}</div>
        <div>
          <p className="text-sm text-gray-400">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

function generateBracket(players) {
  // Shuffle players
  const shuffled = [...players].sort(() => Math.random() - 0.5);

  // Pair them up
  const pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    } else {
      // Odd player gets a bye (auto-advances)
      pairs.push([shuffled[i], 'BYE']);
    }
  }

  return pairs;
}
