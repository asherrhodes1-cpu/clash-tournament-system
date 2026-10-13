import React, { useEffect, useRef, useState } from 'react';
import { saveOverlays, subscribeToOverlays } from '../api/overlays';
import Fold from './Fold';
import { useLeagueControl } from '../league/LeagueControl';
import {
  MAX_GAMES, MAX_STARS, OVERLAYS, TROOPS, blankAttack, blankMatch, blankPlayer, isOnSide, matchLabel, seriesWinner, soundLibrary, soundMatch,
  wins, withPlayer, withSavedMatch, withSavedPlayer, withoutMatch, withoutPlayer,
} from './overlayState';

// How long after the last keystroke a change is sent to the overlays.
const SAVE_AFTER_MS = 400;

const CARD = 'bg-gray-800 rounded-lg border border-gray-700 p-5';
// On the Live tab everything is packed tighter, to fit beside a broadcast.
const LIVE_CARD = 'bg-gray-800 rounded-lg border border-gray-700 p-3';
const LIVE_TITLE = 'text-base font-bold mb-2';
const INPUT = 'w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:border-white focus:outline-none';
const BUTTON = 'px-3 py-2 rounded border border-gray-500 bg-gray-700 hover:bg-gray-600 text-sm font-bold disabled:opacity-40 disabled:hover:bg-gray-700';
// The buttons pressed mid-broadcast: big enough to hit without looking twice.
const BIG = 'px-3 py-2 rounded-lg border-2 bg-gray-700 hover:bg-gray-600 font-bold text-base disabled:opacity-40 disabled:hover:bg-gray-700';
const ON = 'bg-white text-black hover:bg-white';
const RED = 'border-red-500';
const BLUE = 'border-sky-400';
const LABEL = 'block text-xs uppercase tracking-wide text-gray-400 mb-1';

function Field({ label, value, onChange, placeholder, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className={LABEL}>{label}</span>
      <input className={INPUT} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// The troop cards built into the overlays, as pictures: public/overlays/troops.
const troopPicture = (number) => `/overlays/troops/${number}.webp`;

// A row of troop slots and, under it, every troop card to pick from. Picking
// one fills the next empty slot; clicking a filled slot empties it and closes
// the gap. No menus: a whole army is as many clicks as it has troops.
function TroopSlots({ label, slots, onChange }) {
  const filled = slots.filter(Boolean);
  const set = (next) => onChange(slots.map((_, i) => next[i] ?? ''));
  return (
    <div>
      <span className={LABEL}>{label}</span>
      <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label={label}>
        {slots.map((_, i) => {
          const troop = filled[i];
          const name = TROOPS[Number(troop) - 1];
          return troop ? (
            <button key={i} type="button" title={`${name ?? 'Custom image'}: click to remove`} aria-label={`Remove ${name ?? 'custom image'} from slot ${i + 1}`} className="w-12 h-16 rounded border-2 border-white bg-gray-900 overflow-hidden hover:border-red-500" onClick={() => set(filled.filter((__, j) => j !== i))}>
              {/* An image address typed into the overlay itself is kept as it is. */}
              {name ? <img src={troopPicture(troop)} alt={name} className="w-full h-full object-cover" /> : <span className="text-[10px] leading-tight">Custom</span>}
            </button>
          ) : (
            <span key={i} aria-label={`Slot ${i + 1}: empty`} className="w-12 h-16 rounded border-2 border-dashed border-gray-600 bg-gray-900" />
          );
        })}
        <button type="button" className={`${BUTTON} self-center`} disabled={!filled.length} onClick={() => set([])}>Clear</button>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Troops to add to ${label}`}>
        {TROOPS.map((name, n) => (
          <button key={name} type="button" title={name} aria-label={`Add ${name}`} className="w-11 h-[3.75rem] rounded border border-gray-600 bg-gray-900 overflow-hidden hover:border-white disabled:opacity-40" disabled={filled.length >= slots.length} onClick={() => set([...filled, String(n + 1)])}>
            <img src={troopPicture(n + 1)} alt={name} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}

// Everything about one player, for the overlays that show a player.
function PlayerFields({ player, onChange }) {
  const set = (key) => (value) => onChange({ ...player, [key]: value });
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field className="col-span-2" label="Name" value={player.name} onChange={set('name')} />
        <Field label="Seed" value={player.seed} onChange={set('seed')} placeholder="Seed #1" />
        <Field label="Trophies" value={player.trophies} onChange={set('trophies')} />
        <Field className="col-span-2" label="Best finish" value={player.best} onChange={set('best')} placeholder="2nd Place" />
        <Field label="Stage 1 hit rate %" value={player.stage1} onChange={set('stage1')} />
        <Field label="Stage 2 hit rate %" value={player.stage2} onChange={set('stage2')} />
      </div>
      <div className="mt-3">
        <TroopSlots label="Favorite army" slots={player.army} onChange={set('army')} />
      </div>
    </>
  );
}

// The address OBS should be given for an overlay, on whatever site this is.
const overlayUrl = (file) => `${window.location.origin}/overlays/${file}.html`;

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={BUTTON}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (err) {
          window.prompt('Copy this address:', text);
        }
      }}
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}

// An overlay as OBS shows it, as large as the page allows. The frame is the
// size it is shown at, and the overlay fits itself to that, so it is drawn at
// the screen's full sharpness rather than drawn big and squeezed. It reads
// the same saved match, so it changes as the buttons are pressed.
function Preview({ file }) {
  return (
    <div className="relative w-full overflow-hidden rounded bg-black" style={{ aspectRatio: '16 / 9' }}>
      <iframe title={`${file} preview`} src={`/overlays/${file}.html`} className="absolute inset-0 w-full h-full border-0 pointer-events-none" />
    </div>
  );
}

// Which overlay is being looked at, and the overlay itself.
function Overlays({ shown, onShow }) {
  return (
    <section className={LIVE_CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Overlay shown below">
          {OVERLAYS.map((overlay) => (
            <button key={overlay.file} type="button" aria-pressed={shown === overlay.file} className={`${BUTTON} ${shown === overlay.file ? ON : ''}`} onClick={() => onShow(overlay.file)}>{overlay.label}</button>
          ))}
        </div>
        <a className={BUTTON} href={`/overlays/${shown}.html`} target="_blank" rel="noreferrer">Open full size</a>
      </div>
      <Preview key={shown} file={shown} />
    </section>
  );
}

const TABS = [['live', 'Live'], ['prepare', 'Prepare'], ['obs', 'OBS setup']];
const tabFromAddress = () => TABS.map(([key]) => key).find((key) => window.location.hash === `#${key}`) ?? 'live';

export default function OverlayControl() {
  // { match, library }: what is on screen and what has been prepared. null
  // until it has arrived.
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [shown, setShown] = useState(OVERLAYS[0].file);
  const [tab, setTab] = useState(tabFromAddress);
  // The prepared player being edited on the Prepare tab, and a name for the
  // match about to be saved.
  const [editing, setEditing] = useState(null);
  const [saveAs, setSaveAs] = useState('');
  // Changes not yet sent, so one arriving from the database (this page's own
  // save echoing back, or another member of staff) doesn't undo typing.
  const pending = useRef(null);
  const timer = useRef(null);

  useEffect(() => subscribeToOverlays(
    (saved) => { if (!pending.current) setData(saved); },
    () => setStatus('Could not load what was saved.'),
  ), []);

  const send = async () => {
    const sending = pending.current;
    if (!sending) return;
    try {
      await saveOverlays(sending);
      if (pending.current === sending) {
        pending.current = null;
        setStatus('Saved - the overlays are up to date.');
      }
    } catch (err) {
      setStatus('Could not save: are you still signed in as staff?');
    }
  };

  // `now` sends at once: for a button pressed mid-broadcast, where the
  // overlay should change the moment it is clicked.
  const change = (next, now = false) => {
    const sound = { match: soundMatch(next.match), library: soundLibrary(next.library) };
    setData(sound);
    pending.current = sound;
    setStatus('Saving…');
    clearTimeout(timer.current);
    if (now) send();
    else timer.current = setTimeout(send, SAVE_AFTER_MS);
  };

  // Anything still waiting is sent if the page is left mid-wait.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => () => {
    clearTimeout(timer.current);
    sendRef.current();
  }, []);

  // The finals section's controls sit on the same tabs as the overlays':
  // its buttons on Live, its preparation on Prepare. The overlays' vote bar
  // follows the real vote totals.
  const sideNames = { red: { name: data?.match.red.name ?? '' }, blue: { name: data?.match.blue.name ?? '' } };
  const followVotes = (red, blue) => {
    const now = pending.current ?? data;
    if (!now || (now.match.redVotes === String(red) && now.match.blueVotes === String(blue))) return;
    change({ match: { ...now.match, redVotes: String(red), blueVotes: String(blue) }, library: now.library }, true);
  };
  const finals = useLeagueControl(sideNames, followVotes);

  if (!data) return <div className="min-h-screen bg-gray-900 text-white p-8">{status || 'Loading…'}</div>;

  const { match, library } = data;
  const openTab = (next) => {
    setTab(next);
    window.history.replaceState(null, '', next === 'live' ? window.location.pathname : `#${next}`);
  };
  const setMatch = (next, now) => change({ match: next, library }, now);
  const setLibrary = (next) => change({ match, library: next });
  const set = (key) => (value) => setMatch({ ...match, [key]: value });
  const press = (next) => setMatch(next, true);
  const winner = seriesWinner(match);
  const setCaster = (i, key) => (value) => setMatch({ ...match, casters: match.casters.map((c, j) => (j === i ? { ...c, [key]: value } : c)) });
  const setAttack = (key, now) => (value) => setMatch({ ...match, attack: { ...match.attack, [key]: value } }, now);
  const attacker = match.attack.side === 'b' ? match.blue : match.red;
  const editingPlayer = editing && (library.players.find((p) => p.id === editing.id) ? editing : editing.fresh ? editing : null);

  const score = (
    <>
      <span className={LABEL}>
        Best of {match.bestOf}: {match.red.name} {wins(match, 'r')} - {wins(match, 'b')} {match.blue.name}
        {winner && ` · ${winner === 'r' ? match.red.name : match.blue.name} wins the series`}
      </span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${BIG} ${RED}`} disabled={match.games.length >= match.bestOf} onClick={() => press({ ...match, games: [...match.games, 'r'] })}>Red wins a game</button>
        <button type="button" className={`${BIG} ${BLUE}`} disabled={match.games.length >= match.bestOf} onClick={() => press({ ...match, games: [...match.games, 'b'] })}>Blue wins a game</button>
        <button type="button" className={`${BIG} border-gray-500`} disabled={!match.games.length} onClick={() => press({ ...match, games: match.games.slice(0, -1) })}>Undo last game</button>
        <button type="button" className={`${BIG} border-gray-500`} disabled={!match.games.length} onClick={() => press({ ...match, games: [] })}>New series</button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Stream overlays</h1>
            <p className="text-gray-400">Staff only. Prepare players and matches ahead of time, then run the broadcast with clicks.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400" role="status">{status}</span>
            <a className={BUTTON} href="/">Back to the site</a>
          </div>
        </header>

        <nav className="flex gap-2 border-b border-gray-700" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={`px-5 py-3 font-bold rounded-t border border-b-0 ${tab === key ? 'bg-gray-800 border-gray-700 text-white' : 'border-transparent text-gray-400 hover:text-white'}`} onClick={() => openTab(key)}>{label}</button>
          ))}
        </nav>

        {/* ---- Live: everything here is one click, nothing to type ---- */}
        {tab === 'live' && (
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <div className="space-y-4">
              <section className={LIVE_CARD}>
                <h2 className={LIVE_TITLE}>Matches</h2>
                {library.matches.length === 0 && <p className="text-sm text-gray-400">None prepared yet. Save some on the Prepare tab.</p>}
                <div className="flex flex-wrap gap-2">
                  {library.matches.map((entry) => (
                    <button key={entry.id} type="button" aria-pressed={matchLabel(match) === matchLabel(entry.match)} className={`${BIG} border-gray-500 ${matchLabel(match) === matchLabel(entry.match) ? ON : ''}`} onClick={() => press(entry.match)}>{entry.label}</button>
                  ))}
                </div>
              </section>

              <section className={LIVE_CARD}>
                <h2 className={LIVE_TITLE}>Players</h2>
                {library.players.length === 0 && <p className="text-sm text-gray-400">None prepared yet. Add some on the Prepare tab.</p>}
                {[['r', 'Red', RED], ['b', 'Blue', BLUE]].map(([side, name, colour]) => library.players.length > 0 && (
                  <div key={side} className="mb-2 last:mb-0" role="group" aria-label={`${name} player`}>
                    <span className={LABEL}>{name}: {(side === 'b' ? match.blue : match.red).name}</span>
                    <div className="flex flex-wrap gap-2">
                      {library.players.map((player) => (
                        <button key={player.id} type="button" aria-pressed={isOnSide(match, side, player)} className={`${BIG} ${colour} ${isOnSide(match, side, player) ? ON : ''}`} onClick={() => press(withPlayer(match, side, player))}>{player.name}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>

              <section className={LIVE_CARD}>
                <h2 className={LIVE_TITLE}>Score</h2>
                {score}
              </section>

              <section className={LIVE_CARD}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h2 className="text-base font-bold">Attack overview</h2>
                  <button type="button" className={BUTTON} onClick={() => press({ ...match, attack: { ...blankAttack(), side: match.attack.side } })}>Clear for the next attack</button>
                </div>
                <span className={LABEL}>Attacker: {attacker.name}</span>
                <div className="flex flex-wrap gap-2 mb-3">
                  <button type="button" aria-pressed={match.attack.side === 'r'} className={`${BIG} ${RED} ${match.attack.side === 'r' ? ON : ''}`} onClick={() => setAttack('side', true)('r')}>Red attacks</button>
                  <button type="button" aria-pressed={match.attack.side === 'b'} className={`${BIG} ${BLUE} ${match.attack.side === 'b' ? ON : ''}`} onClick={() => setAttack('side', true)('b')}>Blue attacks</button>
                </div>
                <span className={LABEL}>Stars</span>
                <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Stars">
                  {Array.from({ length: MAX_STARS + 1 }, (_, n) => n).map((n) => (
                    <button key={n} type="button" aria-pressed={match.attack.stars === n} className={`${BIG} border-gray-500 ${match.attack.stars === n ? ON : ''}`} onClick={() => setAttack('stars', true)(n)}>{n}</button>
                  ))}
                </div>
                <Field className="mb-3" label="Destruction % (out of 200)" value={match.attack.percent} onChange={setAttack('percent')} placeholder="187.5" />
                <TroopSlots label="Troops used" slots={match.attack.troops} onChange={setAttack('troops', true)} />
              </section>
            </div>

            <div className="space-y-4">
              {finals.live}
              <Overlays shown={shown} onShow={setShown} />
            </div>
          </div>
        )}

        {/* ---- Prepare: the typing, done before the broadcast ---- */}
        {tab === 'prepare' && (
          <div className="grid lg:grid-cols-2 gap-6 items-start">
            <div className="space-y-6">
              <Fold id="players" title="Players" action={<button type="button" className={BUTTON} onClick={() => setEditing({ ...blankPlayer(), id: '', fresh: true })}>Add a player</button>}>
                <p className="text-sm text-gray-400 mb-3">Everyone who might appear. Each one becomes a button on the Live tab.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {library.players.map((player) => (
                    <button key={player.id} type="button" aria-pressed={editing?.id === player.id} className={`${BUTTON} ${editing?.id === player.id ? ON : ''}`} onClick={() => setEditing(player)}>{player.name}</button>
                  ))}
                </div>
                {editingPlayer && (
                  <div className="border-t border-gray-700 pt-3">
                    <PlayerFields player={editingPlayer} onChange={setEditing} />
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        className={`${BUTTON} border-white`}
                        onClick={() => {
                          const { fresh, ...player } = editingPlayer;
                          const next = withSavedPlayer(library, player);
                          setLibrary(next);
                          setEditing(next.players.find((p) => p.id === player.id) ?? next.players[next.players.length - 1]);
                        }}
                      >
                        {editingPlayer.fresh ? 'Save player' : 'Save changes'}
                      </button>
                      {!editingPlayer.fresh && (
                        <button type="button" className={`${BUTTON} border-red-500`} onClick={() => { if (window.confirm(`Delete ${editingPlayer.name}?`)) { setLibrary(withoutPlayer(library, editingPlayer.id)); setEditing(null); } }}>Delete</button>
                      )}
                      <button type="button" className={BUTTON} onClick={() => setEditing(null)}>Close</button>
                    </div>
                  </div>
                )}
              </Fold>

              <Fold id="matches" title="Saved matches">
                <p className="text-sm text-gray-400 mb-3">Set the match up on the right, then save it here. Each one becomes a button on the Live tab.</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  <input className={`${INPUT} flex-1 min-w-[12rem]`} aria-label="Name for this match" value={saveAs} placeholder={matchLabel(match)} onChange={(e) => setSaveAs(e.target.value)} />
                  <button type="button" className={`${BUTTON} border-white`} onClick={() => { setLibrary(withSavedMatch(library, match, saveAs)); setSaveAs(''); }}>Save this match</button>
                </div>
                <ul className="space-y-2">
                  {library.matches.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-700 pt-2">
                      <span className="font-bold">{entry.label}</span>
                      <span className="flex gap-2">
                        <button type="button" className={BUTTON} onClick={() => setMatch(entry.match)}>Load</button>
                        <button type="button" className={`${BUTTON} border-red-500`} onClick={() => { if (window.confirm(`Delete "${entry.label}"?`)) setLibrary(withoutMatch(library, entry.id)); }}>Delete</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </Fold>
            </div>

            <div className="space-y-6">
              <Fold id="on-screen" title="The match on screen">
                <p className="text-sm text-gray-400 mb-3">Typing here changes the overlays as you go.</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Event title" value={match.title} onChange={set('title')} />
                  <Field label="Round" value={match.round} onChange={set('round')} placeholder="Quarterfinal" />
                </div>
                <div className="mt-4">
                  <span className={LABEL}>Best of</span>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Best of">
                    {Array.from({ length: MAX_GAMES }, (_, i) => i + 1).filter((n) => n % 2).map((n) => (
                      <button key={n} type="button" aria-pressed={match.bestOf === n} className={`${BUTTON} ${match.bestOf === n ? ON : ''}`} onClick={() => setMatch({ ...match, bestOf: n })}>{n}</button>
                    ))}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field label="Audience votes: red" value={match.redVotes} onChange={set('redVotes')} />
                  <Field label="Audience votes: blue" value={match.blueVotes} onChange={set('blueVotes')} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {match.casters.map((caster, i) => (
                    <React.Fragment key={i}>
                      <Field label={`Caster ${i + 1} name`} value={caster.name} onChange={setCaster(i, 'name')} />
                      <Field label={`Caster ${i + 1} channel`} value={caster.channel} onChange={setCaster(i, 'channel')} />
                    </React.Fragment>
                  ))}
                </div>
              </Fold>

              {[['r', 'Red player', 'red', RED], ['b', 'Blue player', 'blue', BLUE]].map(([side, title, key, colour]) => (
                <Fold key={side} id={`${key}-player`} title={title} className={`border-2 ${colour}`} action={<button type="button" className={BUTTON} onClick={() => setLibrary(withSavedPlayer(library, { ...match[key], id: library.players.find((p) => p.name === match[key].name)?.id ?? '' }))}>Save to players</button>}>
                  <PlayerFields player={match[key]} onChange={set(key)} />
                </Fold>
              ))}

              {finals.prepare}

              <button type="button" className={`${BUTTON} border-red-500`} onClick={() => { if (window.confirm('Clear the match on screen? Prepared players and matches are kept.')) setMatch(blankMatch()); }}>Clear the match on screen</button>
            </div>
          </div>
        )}

        {/* ---- OBS setup: done once ---- */}
        {tab === 'obs' && (
          <div className="space-y-6">
            <Overlays shown={shown} onShow={setShown} />
            <section className={CARD}>
              <h2 className="text-xl font-bold mb-1">Adding them to OBS</h2>
              <p className="text-sm text-gray-400 mb-3">Sources → + → Browser, then paste a link. You only do this once: after that the overlays follow this page.</p>
              <p className="text-sm text-gray-300 mb-3">For smooth sparkle: in the same Properties, tick <b>Use custom frame rate</b> and set FPS to match your stream (usually 60). OBS runs Browser sources at 30 otherwise.</p>
              <p className="text-sm font-bold text-white bg-red-900 border border-red-500 rounded p-3 mb-3">Set Width to 1920 and Height to 1080 in the source's Properties. OBS starts every Browser source at 800 × 600, which makes the overlay blurry and its small text unreadable.</p>
              <ul className="space-y-3">
                {OVERLAYS.map((overlay) => (
                  <li key={overlay.file} className="flex flex-wrap items-start justify-between gap-2 border-t border-gray-700 pt-3">
                    <div className="min-w-0">
                      <p className="font-bold">{overlay.label}</p>
                      <p className="text-sm text-gray-400">{overlay.about}</p>
                      <p className="text-xs text-gray-400 break-all">{overlayUrl(overlay.file)}</p>
                      {overlay.under.map((line) => <p key={line} className="text-xs text-gray-300">Under it: {line}</p>)}
                    </div>
                    <CopyButton text={overlayUrl(overlay.file)} />
                  </li>
                ))}
                <li className="flex flex-wrap items-start justify-between gap-2 border-t border-gray-700 pt-3">
                  <div>
                    <p className="font-bold">Stinger transition</p>
                    <p className="text-sm text-gray-400">Scene Transitions → + → Stinger. Transition Point Type: Time (milliseconds). Transition Point: 720. Tick Preload Video to RAM.</p>
                  </div>
                  <a className={BUTTON} href="/overlays/transition.webm" download>Download</a>
                </li>
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
