import React from 'react';
import PlayerName from '../PlayerName';
import { useMyGems } from './LivePage';
import { Gems } from './shared';

// The Live section's own top bar - separate from the tournament nav, since
// Live is its own part of the site reached from the landing page.
export default function LiveHeader({ user, onHome, onLogin, onLogout, onStaffDashboard }) {
  const gems = useMyGems(user.uid);
  return (
    <nav className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-2 sm:gap-4">
          <button onClick={onHome} className="flex items-center gap-2 shrink-0" aria-label="Home">
            <span className="font-display font-bold text-lg tracking-tight whitespace-nowrap">LIVE</span>
          </button>
          <div className="flex items-center gap-2 sm:gap-3 text-sm whitespace-nowrap min-w-0">
            <button onClick={onHome} className="hover:text-neutral-300 transition">
              Home
            </button>
            {user.isStaff && (
              <button
                onClick={onStaffDashboard}
                className="border border-white text-white hover:bg-white hover:text-black px-2 sm:px-3 py-1 rounded transition"
              >
                Staff<span className="hidden sm:inline"> Dashboard</span>
              </button>
            )}
            {user.isGuest ? (
              <button
                onClick={onLogin}
                className="border-2 border-white text-white hover:bg-white hover:text-black px-3 py-1.5 rounded transition"
              >
                Log In
              </button>
            ) : (
              <>
                <div className="text-gray-400 min-w-0 max-w-[4.5rem] sm:max-w-[11rem]">
                  <div className="truncate">
                    <PlayerName name={user.username} />
                    {user.isStaff && <span className="text-white font-bold ml-2 hidden sm:inline">[STAFF]</span>}
                  </div>
                  <div className="text-xs text-gray-300"><Gems amount={gems} /></div>
                </div>
                <button
                  onClick={onLogout}
                  className="border-2 border-white text-white hover:bg-white hover:text-black px-2 sm:px-3 py-1.5 rounded transition shrink-0"
                >
                  Logout
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
