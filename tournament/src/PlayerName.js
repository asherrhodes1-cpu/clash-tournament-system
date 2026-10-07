import React, { useSyncExternalStore } from 'react';
import { subscribeToGoldNames } from './api/nameStyles';

// Golden names: a shimmering gold style staff award to a player, shown
// wherever <PlayerName> draws their name (see api/nameStyles.js for where
// it's stored, and .gold-name in index.css for the look).

// One shared subscription, however many names are on screen.
let goldNames = new Set();
let unsubscribe = null;
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  if (!unsubscribe) {
    unsubscribe = subscribeToGoldNames((names) => {
      goldNames = new Set(names);
      listeners.forEach((l) => l());
    });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}

// The set of usernames (lowercase) that have a golden name.
export function useGoldNames() {
  return useSyncExternalStore(subscribe, () => goldNames);
}

export function hasGoldName(names, username) {
  return !!username && names.has(String(username).toLowerCase());
}

// A player's name, golden if staff have awarded them that. `children` lets a
// caller draw something other than the bare name in the same style.
export default function PlayerName({ name, className = '', children }) {
  const gold = hasGoldName(useGoldNames(), name);
  return <span className={`${gold ? 'gold-name' : ''} ${className}`.trim() || undefined}>{children ?? name}</span>;
}
