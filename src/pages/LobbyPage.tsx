import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import { useAuth } from '@/context/AuthContext';
import {
  clearMyDiceRoll,
  computeTurnOrder,
  resetDiceRolls,
  rollDice,
  setPlayerBracket,
  setPlayerCommander,
  setPlayerDecklist,
  setPlayerReady,
  startGame,
  subscribeToPlayers,
  subscribeToSession,
} from '@/services/sessionService';
import {
  enrichDecklist,
  getCommanderFromEntry,
  importFromArchidekt,
  parseDecklistText,
  searchCommanders,
} from '@/lib/scryfall';
import type { CommanderInfo, Session, SessionPlayer } from '@/types';
import { displayName as getDisplayName } from '@/types';
import CommanderDetailModal from '@/components/CommanderDetailModal';
import '@/styles/commander-detail.css';
import '@/styles/lobby.css';

export default function LobbyPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const lastResetCount = useRef<number | null>(null);

  // Real-time subscriptions.
  useEffect(() => {
    if (!sessionId) return;
    const unsub1 = subscribeToSession(sessionId, setSession);
    const unsub2 = subscribeToPlayers(sessionId, setPlayers);
    setLoading(false);
    return () => {
      unsub1();
      unsub2();
    };
  }, [sessionId]);

  // React to host's dice-roll reset signal: when diceResetCount increments,
  // each client clears their own diceRoll locally (avoids cross-player writes).
  // On first observation, just store the value — don't trigger a clear.
  useEffect(() => {
    if (!sessionId || !user || !session) return;
    const currentCount = session.diceResetCount ?? 0;
    if (lastResetCount.current === null) {
      lastResetCount.current = currentCount;
      return;
    }
    if (currentCount > lastResetCount.current) {
      lastResetCount.current = currentCount;
      clearMyDiceRoll(sessionId, user.uid).catch(() => {});
    }
  }, [session?.diceResetCount, sessionId, user, session]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p className="text-muted">Loading lobby…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app-container text-center">
        <p className="text-muted mb-lg">Game session not found.</p>
        <Link to="/" className="btn btn-primary">Back to Home</Link>
      </div>
    );
  }

  if (!user) return null;

  const me = players.find((p) => p.uid === user.uid);
  const isHost = user.uid === session.hostUid;
  const joinUrl = `${window.location.origin}/join/${session.code}`;

  // Dynamic ordering: players who rolled are sorted highest→lowest (ties
  // alphabetical), then players who haven't rolled appear at the bottom.
  const sortedPlayers = [...players].sort((a, b) => {
    const aRolled = a.diceRoll != null;
    const bRolled = b.diceRoll != null;
    if (aRolled && bRolled) {
      const diff = (b.diceRoll ?? 0) - (a.diceRoll ?? 0);
      if (diff !== 0) return diff;
      return getDisplayName(a).localeCompare(getDisplayName(b));
    }
    if (aRolled && !bRolled) return -1;
    if (!aRolled && bRolled) return 1;
    if (a.isHost) return -1;
    if (b.isHost) return 1;
    return getDisplayName(a).localeCompare(getDisplayName(b));
  });

  const readyCount = players.filter((p) => p.isReady).length;
  const allReady = players.length >= 2 && players.every((p) => p.isReady);
  const turnOrder = computeTurnOrder(players);
  const anyRolled = players.some((p) => p.diceRoll != null);

  async function handleCopyCode() {
    await navigator.clipboard.writeText(session!.code);
  }
  async function handleCopyLink() {
    await navigator.clipboard.writeText(joinUrl);
  }

  async function handleStart() {
    if (!sessionId) return;
    setError('');
    try {
      await startGame(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game.');
    }
  }

  async function handleResetRolls() {
    if (!sessionId) return;
    setError('');
    setResetting(true);
    try {
      await resetDiceRolls(sessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reset dice rolls.';
      setError(msg.includes('permission')
        ? 'Permission denied — make sure Firestore rules are deployed: firebase deploy --only firestore:rules'
        : msg
      );
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="app-container lobby-container">
      {/* --- Header --- */}
      <div className="flex justify-between items-center mb-md">
        <Link to="/" className="btn btn-outline btn-sm">← Leave</Link>
        <h1 className="page-title" style={{ margin: 0 }}>Game Lobby</h1>
        <div style={{ width: 80 }} />
      </div>

      {error && <p className="form-error text-center mb-md">{error}</p>}

      {/* --- Sticky Game Code Bar --- */}
      <div className="lobby-sticky-bar">
        <div className="lobby-sticky-code">
          <span className="lobby-sticky-code-label">Code</span>
          <span className="lobby-sticky-code-value">{session.code}</span>
        </div>
        <div className="lobby-sticky-actions">
          <button onClick={handleCopyCode} className="btn btn-outline btn-sm">📋 Copy Code</button>
          <button onClick={handleCopyLink} className="btn btn-primary btn-sm">🔗 Invite Link</button>
        </div>
      </div>

      {/* --- Two-column grid --- */}
      <div className="lobby-grid">
        {/* LEFT: Your Setup (merged: commander + decklist + dice roll + ready) */}
        <div className="lobby-col-left">
          {me && (
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Your Setup</h3>

              {/* Commander + Decklist */}
              <MySetupPanel
                sessionId={sessionId!}
                player={me}
                bare={true}
              />

              {/* Dice Roll */}
              <div className="lobby-setup-section mt-md">
                <p className="lobby-setup-section-label">🎲 Roll for Turn Order</p>
                <DiceRollInline
                  sessionId={sessionId!}
                  uid={me.uid}
                  diceRoll={me.diceRoll ?? null}
                />
              </div>

              {/* Ready Toggle */}
              <div className="lobby-setup-section mt-md">
                <p className="lobby-setup-section-label">✓ Ready Check</p>
                <ReadyToggle
                  sessionId={sessionId!}
                  uid={me.uid}
                  isReady={me.isReady}
                  hasRolled={me.diceRoll != null}
                />
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Players + Host Controls */}
        <div className="lobby-col-right">
          {/* Players */}
          <div className="card">
            <div className="lobby-players-header">
              <h3 style={{ margin: 0 }}>
                Players ({players.length}/{session.maxPlayers})
              </h3>
              {anyRolled && (
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  Sorted by roll ↓
                </span>
              )}
            </div>
            <div className="flex flex-col gap-sm">
              <AnimatePresence mode="popLayout">
                {sortedPlayers.map((p, idx) => (
                  <motion.div
                    key={p.uid}
                    layout
                    layoutId={`player-${p.uid}`}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      layout: { type: 'spring', stiffness: 400, damping: 35 },
                      duration: 0.2,
                    }}
                  >
                    <PlayerRow player={p} rank={p.diceRoll != null ? idx + 1 : null} />
                  </motion.div>
                ))}
              </AnimatePresence>
              {players.length < session.maxPlayers && (
                <div className="text-center text-muted" style={{ padding: '1rem', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  Waiting for more players to join…
                </div>
              )}
            </div>

            {/* Turn order preview */}
            {turnOrder.length > 1 && (
              <div className="mt-md">
                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  Turn Order:
                </p>
                <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                  {turnOrder.map((uid, i) => {
                    const p = players.find((pl) => pl.uid === uid);
                    return p ? (
                      <span key={uid} className="turn-badge">
                        {i + 1}. {getDisplayName(p)}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Host Launch Controls */}
          {isHost && (
            <div className="card text-center">
              <div className="flex justify-between items-center mb-md">
                <h3 style={{ margin: 0 }}>Launch Game</h3>
                <span className={`badge ${allReady ? 'badge-ready' : 'badge-loss'}`} style={allReady ? {} : { background: 'var(--color-danger)', color: '#fff' }}>
                  {readyCount}/{players.length} ready
                </span>
              </div>
              {anyRolled && (
                <button
                  onClick={handleResetRolls}
                  className="btn btn-outline btn-sm"
                  disabled={resetting}
                  style={{ marginBottom: '1rem' }}
                >
                  {resetting ? 'Resetting…' : '↻ Reset All Dice Rolls'}
                </button>
              )}
              <button
                onClick={handleStart}
                className="btn btn-primary btn-lg btn-block"
                disabled={!allReady}
              >
                {allReady ? 'Start Game' : 'Waiting for all players to be ready…'}
              </button>
              {!allReady && (
                <p className="text-muted mt-sm" style={{ fontSize: '0.85rem' }}>
                  All players must hit "Ready" first.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------
 * Sub-components
 * -------------------------------------------------------- */

function PlayerRow({
  player,
  rank,
}: {
  player: SessionPlayer;
  rank: number | null;
}) {
  const name = getDisplayName(player);
  const hasDeck = !!player.decklist && player.decklist.length > 0;

  return (
    <div className="card" style={{ padding: '0.75rem 1rem' }}>
      <div className="flex items-center gap-md">
        {/* Commander image always on the left */}
        {player.commander?.imageUris ? (
          <img
            src={player.commander.imageUris.small}
            alt={player.commander.name}
            style={{ width: 40, height: 56, borderRadius: 4, flexShrink: 0 }}
          />
        ) : (
          <div style={{ width: 40, height: 56, borderRadius: 4, background: 'var(--bg-accent)', flexShrink: 0 }} />
        )}

        <div className="flex-1">
          <div className="flex items-center gap-sm">
            <p style={{ fontWeight: 600 }}>{name}</p>
            {player.isHost && <span className="badge badge-host">Host</span>}
            {player.isReady && <span className="badge badge-ready">✓ Ready</span>}
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            {player.commander?.name ?? 'No commander selected'}
          </p>
          {/* Deck name as hyperlink + bracket badge */}
          {hasDeck && (
            <p style={{ fontSize: '0.8rem', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {player.deckSourceUrl ? (
                <a
                  href={player.deckSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="deck-link"
                >
                  📜 {player.deckName ?? `${player.decklist!.length} cards`}
                </a>
              ) : (
                <span className="text-muted">📜 {player.decklist!.length} cards</span>
              )}
              {player.bracket != null && <BracketBadge bracket={player.bracket} />}
            </p>
          )}
        </div>

        {/* Rank and dice roll on the right side */}
        <div className="flex items-center gap-md" style={{ flexShrink: 0 }}>
          {player.diceRoll != null && (
            <>
              {rank !== null && (
                <div className="text-center">
                  <p className="text-muted" style={{ fontSize: '0.65rem', marginBottom: 0 }}>RANK</p>
                  <p
                    style={{
                      fontSize: '1.5rem',
                      fontWeight: 800,
                      color: 'var(--color-accent)',
                      lineHeight: 1,
                    }}
                  >
                    {rank}
                  </p>
                </div>
              )}
              <div className="text-center">
                <p className="text-muted" style={{ fontSize: '0.7rem', marginBottom: 0 }}>D20</p>
                <p
                  style={{
                    fontSize: '2rem',
                    fontWeight: 800,
                    color: 'var(--color-accent)',
                    lineHeight: 1,
                  }}
                >
                  {player.diceRoll}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Improved Commander Selector (visual card-style picker)
 * ============================================================ */

function CommanderPicker({
  sessionId,
  uid,
  currentCommander,
}: {
  sessionId: string;
  uid: string;
  currentCommander: CommanderInfo | null;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommanderInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [previewCommander, setPreviewCommander] = useState<CommanderInfo | null>(null);

  useEffect(() => {
    if (!query.trim() || currentCommander) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchCommanders(query);
        setResults(res.slice(0, 6));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, currentCommander]);

  async function handleSelect(c: CommanderInfo) {
    await setPlayerCommander(sessionId, uid, c);
    setQuery('');
    setResults([]);
    setPreviewCommander(null);
  }

  async function handleClear() {
    await setPlayerCommander(sessionId, uid, null);
    setQuery('');
  }

  // If commander is selected, show a beautiful card-style display
  if (currentCommander) {
    return (
      <div className="commander-card-display">
        <div className="commander-card-image">
          {currentCommander.imageUris?.normal ? (
            <img src={currentCommander.imageUris.normal} alt={currentCommander.name} />
          ) : (
            <div className="commander-card-placeholder">
              <span>No Image</span>
            </div>
          )}
        </div>
        <div className="commander-card-info">
          <p className="commander-card-name">{currentCommander.name}</p>
          {currentCommander.manaCost && (
            <p className="commander-card-mana">{currentCommander.manaCost}</p>
          )}
          <p className="commander-card-type text-muted">{currentCommander.typeLine}</p>
          <div className="commander-card-colors">
            {currentCommander.colors.map((c) => (
              <span key={c} className={`mana-pill mana-${c.toLowerCase()}`} />
            ))}
          </div>
          <button onClick={handleClear} className="btn btn-outline btn-sm mt-sm">
            Change Commander
          </button>
        </div>
      </div>
    );
  }

  // Search interface
  return (
    <div className="commander-picker">
      <div className="commander-search-box">
        <input
          type="text"
          className="form-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for your commander…"
          style={{ paddingLeft: '2.25rem' }}
        />
        <span className="commander-search-icon">🔍</span>
      </div>
      {searching && <p className="form-hint">Searching…</p>}
      {!searching && query && results.length === 0 && (
        <p className="form-hint">No commanders found.</p>
      )}
      {results.length > 0 && (
        <div className="commander-results-grid">
          {results.map((c) => (
            <button
              key={c.scryfallId}
              onClick={() => setPreviewCommander(c)}
              className="commander-grid-item"
            >
              {c.imageUris?.small ? (
                <img src={c.imageUris.small} alt={c.name} />
              ) : (
                <div className="commander-grid-no-img">{c.name}</div>
              )}
              <div className="commander-grid-name">
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                  {c.manaCost}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Commander detail / art picker modal */}
      {previewCommander && (
        <CommanderDetailModal
          commander={previewCommander}
          onClose={() => setPreviewCommander(null)}
          onChoose={handleSelect}
        />
      )}
    </div>
  );
}

/* ============================================================
 * My Setup Panel (Commander + Decklist only)
 * ============================================================ */

function MySetupPanel({
  sessionId,
  player,
  bare = false,
}: {
  sessionId: string;
  player: SessionPlayer;
  bare?: boolean;
}) {
  const { user } = useAuth();
  const [manualMode, setManualMode] = useState(false);
  const [decklistText, setDecklistText] = useState('');
  const [archidektUrl, setArchidektUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const uid = user!.uid;

  async function handleImportPaste() {
    if (!decklistText.trim()) return;
    setImporting(true);
    setImportError('');
    try {
      const parsed = parseDecklistText(decklistText);
      if (parsed.length === 0) {
        setImportError('No cards found in pasted text. Check the format.');
        return;
      }
      const enriched = await enrichDecklist(parsed);
      await setPlayerDecklist(sessionId, uid, enriched, null, null, null);

      // Auto-sync commander if the pasted decklist has a marked commander
      // and the player hasn't manually chosen one yet.
      const cmdEntry = enriched.find((e) => e.isCommander);
      if (cmdEntry && !player.commander) {
        const cmdInfo = await getCommanderFromEntry(cmdEntry);
        if (cmdInfo) await setPlayerCommander(sessionId, uid, cmdInfo);
      }

      setDecklistText('');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import decklist.');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportArchidekt() {
    if (!archidektUrl.trim()) return;
    setImporting(true);
    setImportError('');
    try {
      const imported = await importFromArchidekt(archidektUrl);
      const enriched = await enrichDecklist(imported.decklist);
      await setPlayerDecklist(
        sessionId,
        uid,
        enriched,
        imported.name,
        imported.sourceUrl,
        imported.bracket ?? null,
      );

      // Auto-sync commander from the decklist if the player hasn't picked
      // one manually yet. This is the "decklist same as commander" link.
      if (imported.commander && !player.commander) {
        const cmdEntry = enriched.find((e) => e.isCommander) ?? imported.commander;
        const cmdInfo = await getCommanderFromEntry(cmdEntry);
        if (cmdInfo) await setPlayerCommander(sessionId, uid, cmdInfo);
      }

      setArchidektUrl('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import from Archidekt.';
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  }

  async function handleClearDeck() {
    await setPlayerDecklist(sessionId, uid, null, null, null, null);
  }

  const inner = (
    <>
      {/* Commander — visual picker */}
      <div className="form-group">
        <label className="form-label">
          Your Commander <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span>
        </label>
        <CommanderPicker
          sessionId={sessionId}
          uid={uid}
          currentCommander={player.commander ?? null}
        />
      </div>

      {/* Decklist + Bracket */}
      <div className="form-group">
        <label className="form-label">
          Your Decklist <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span>
        </label>
        {player.decklist ? (
          <div className="flex justify-between items-center">
            <div>
              <p>{player.decklist.length} unique cards</p>
              {player.deckName && (
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>{player.deckName}</p>
              )}
              {player.bracket != null && (
                <p className="text-muted" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Bracket: <BracketBadge bracket={player.bracket} />
                </p>
              )}
            </div>
            <div className="flex flex-col gap-xs" style={{ alignItems: 'flex-start' }}>
              <BracketSelector
                sessionId={sessionId}
                uid={uid}
                bracket={player.bracket ?? null}
              />
              <button
                onClick={handleClearDeck}
                className="btn btn-outline btn-sm"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div>
            {importError && <p className="form-error mb-sm">{importError}</p>}

            {/* Mode switch */}
            <div className="flex items-center gap-sm mb-sm" style={{ fontSize: '0.8rem' }}>
              <span className="text-muted">Import mode:</span>
              <button
                type="button"
                onClick={() => setManualMode(false)}
                className={`btn btn-xs ${!manualMode ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
              >
                Archidekt URL
              </button>
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className={`btn btn-xs ${manualMode ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
              >
                Manual Text
              </button>
            </div>

            {/* URL mode (default) */}
            {!manualMode && (
              <input
                type="url"
                className="form-input mb-sm"
                value={archidektUrl}
                onChange={(e) => setArchidektUrl(e.target.value)}
                placeholder="Archidekt / decklist URL…"
              />
            )}

            {/* Manual mode */}
            {manualMode && (
              <textarea
                className="form-input mb-sm"
                value={decklistText}
                onChange={(e) => setDecklistText(e.target.value)}
                placeholder={"Paste decklist (one card per line):\n1 Sol Ring\n1 Arcane Signet\n…"}
                rows={5}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            )}

            <div className="flex gap-sm">
              {!manualMode ? (
                <button onClick={handleImportArchidekt} className="btn btn-primary btn-sm" disabled={importing || !archidektUrl.trim()}>
                  {importing ? (
                    <span className="flex items-center gap-sm">
                      <span className="spinner spinner-sm" /> Importing…
                    </span>
                  ) : 'Import URL'}
                </button>
              ) : (
                <button onClick={handleImportPaste} className="btn btn-primary btn-sm" disabled={importing || !decklistText.trim()}>
                  {importing ? (
                    <span className="flex items-center gap-sm">
                      <span className="spinner spinner-sm" /> Importing…
                    </span>
                  ) : 'Import Text'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (bare) return inner;

  return (
    <div className="card mb-lg">
      <h3 style={{ marginBottom: '1rem' }}>Your Setup</h3>
      {inner}
    </div>
  );
}

/* ============================================================
 * Bracket Badge & Selector
 * ============================================================ */

/** Display labels for the 1–5 bracket system. */
const BRACKET_LABELS: Record<number, string> = {
  1: 'Exhibition',
  2: 'Core',
  3: 'Upgraded',
  4: 'Optimized',
  5: 'High Power',
};

/** Small colored pill showing the deck's bracket / power tier. */
function BracketBadge({ bracket }: { bracket: number }) {
  const label = BRACKET_LABELS[bracket] ?? `Tier ${bracket}`;
  return (
    <span
      className="badge"
      title={`Bracket ${bracket} — ${label}`}
      style={{
        background: 'var(--color-accent)',
        color: '#fff',
        fontSize: '0.7rem',
        padding: '0.1rem 0.4rem',
        fontWeight: 700,
      }}
    >
      B{bracket}
    </span>
  );
}

/** A compact dropdown to let the player set their bracket manually. */
function BracketSelector({
  sessionId,
  uid,
  bracket,
}: {
  sessionId: string;
  uid: string;
  bracket: number | null | undefined;
}) {
  const [changing, setChanging] = useState(false);

  async function handleChange(value: number | null) {
    setChanging(true);
    try {
      await setPlayerBracket(sessionId, uid, value);
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">Deck Bracket / Power Level</label>
      <div className="flex items-center gap-sm">
        <select
          className="form-input"
          value={bracket ?? ''}
          disabled={changing}
          onChange={(e) => {
            const v = e.target.value;
            handleChange(v === '' ? null : parseInt(v, 10));
          }}
          style={{ maxWidth: 220 }}
        >
          <option value="">Not set</option>
          {Object.entries(BRACKET_LABELS).map(([num, label]) => (
            <option key={num} value={num}>
              {num} — {label}
            </option>
          ))}
        </select>
        {bracket != null && <BracketBadge bracket={bracket} />}
      </div>
      <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
        Auto-detected from Archidekt. Override manually if needed.
      </p>
    </div>
  );
}

/* ============================================================
 * Dice Roll Inline (embedded in setup panel)
 * ============================================================ */

function DiceRollInline({
  sessionId,
  uid,
  diceRoll,
}: {
  sessionId: string;
  uid: string;
  diceRoll: number | null;
}) {
  const [rolling, setRolling] = useState(false);
  const [displayNum, setDisplayNum] = useState<number | null>(null);
  // Randomized bounce keyframes — regenerated each roll for variety
  const [bounceKey, setBounceKey] = useState(0);

  // Generate chaotic bounce path for dice-tray physics
  function genBounces() {
    const bounces = [];
    let x = 0, y = 0;
    for (let i = 0; i < 10; i++) {
      // Each bounce: random position within tray bounds, decreasing amplitude
      const decay = 1 - i * 0.08;
      x = (Math.random() - 0.5) * 60 * decay;
      y = (Math.random() - 0.5) * 30 * decay;
      bounces.push({ x, y });
    }
    bounces.push({ x: 0, y: 0 }); // settle center
    return bounces;
  }

  const [bounces, setBounces] = useState(genBounces());
  const [rotations, setRotations] = useState<number[]>([]);

  // Sync display number when diceRoll arrives from Firestore
  useEffect(() => {
    if (diceRoll == null) return;
    if (rolling) {
      // Brief delay for dramatic landing effect
      const timer = setTimeout(() => {
        setDisplayNum(diceRoll);
        setRolling(false);
      }, 500);
      return () => clearTimeout(timer);
    }
    setDisplayNum(diceRoll);
  }, [diceRoll]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle random numbers during rolling for visual effect
  useEffect(() => {
    if (!rolling) return;
    const interval = setInterval(() => {
      setDisplayNum(Math.floor(Math.random() * 20) + 1);
    }, 70);
    return () => clearInterval(interval);
  }, [rolling]);

  async function handleRoll() {
    // Generate new chaotic bounce path + rotations for this roll
    setBounces(genBounces());
    setRotations([
      Math.random() * 720 - 360,
      Math.random() * 720 - 360,
      Math.random() * 720 - 360,
      Math.random() * 360 - 180,
      0,
    ]);
    setBounceKey((k) => k + 1);
    setRolling(true);
    setDisplayNum(Math.floor(Math.random() * 20) + 1);
    try {
      await rollDice(sessionId, uid);
      // Don't stop rolling here — wait for the subscription to deliver diceRoll.
    } catch {
      setRolling(false);
      setDisplayNum(null);
    }
  }

  // Initial state: show the roll button
  if (diceRoll == null && !rolling) {
    return (
      <div className="lobby-dice-inline">
        <button onClick={handleRoll} className="btn btn-accent btn-lg">
          🎲 Roll D20
        </button>
      </div>
    );
  }

  // Build keyframe arrays for framer-motion
  const xKeys = bounces.map((b) => b.x);
  const yKeys = bounces.map((b) => b.y);
  const rotKeys = rotations.length > 0 ? rotations : [0, 0, 0, 0, 0];
  const scaleKeys = [1, 1.15, 0.9, 1.1, 0.95, 1.05, 1];

  return (
    <div className="lobby-dice-inline">
      {/* Dice Tray — bounded area where the die tumbles */}
      <div className="dice-tray">
        {/* The D20 die — bounces around chaotically, tumbles in 3D */}
        <motion.div
          key={bounceKey}
          className="d20-die-wrapper"
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={
            rolling
              ? {
                  x: xKeys,
                  y: yKeys,
                  scale: scaleKeys,
                }
              : { x: 0, y: 0, scale: 1 }
          }
          transition={
            rolling
              ? {
                  duration: 1.8,
                  times: xKeys.map((_, i) => i / (xKeys.length - 1)),
                  ease: 'easeInOut',
                }
              : { type: 'spring', stiffness: 500, damping: 12 }
          }
        >
          <motion.div
            className="d20-die"
            initial={{ rotateX: 0, rotateY: 0, rotateZ: 0 }}
            animate={
              rolling
                ? { rotateX: rotKeys, rotateY: rotKeys, rotateZ: rotKeys }
                : { rotateX: 0, rotateY: 0, rotateZ: 0 }
            }
            transition={
              rolling
                ? { duration: 1.8, ease: 'easeOut' }
                : { type: 'spring', stiffness: 400, damping: 15 }
            }
            style={{ transformStyle: 'preserve-3d' }}
          >
            <div className="d20-face">
              <span className="d20-number">{displayNum ?? '?'}</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Tray floor shadow — scales/bounces with the die */}
        <motion.div
          className="dice-tray-shadow"
          animate={
            rolling
              ? { scaleX: [1, 1.3, 0.8, 1.2, 1], opacity: [0.4, 0.2, 0.5, 0.3, 0.4] }
              : { scaleX: 1, opacity: 0.4 }
          }
          transition={rolling ? { duration: 1.8, ease: 'easeInOut' } : {}}
        />
      </div>

      {rolling && (
        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
          Rolling…
        </p>
      )}

      {!rolling && displayNum != null && (
        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
          You rolled a {displayNum}. Ask the host to reset if needed.
        </p>
      )}
    </div>
  );
}

/* ============================================================
 * Ready Toggle (embedded in setup panel)
 * ============================================================ */

function ReadyToggle({
  sessionId,
  uid,
  isReady,
  hasRolled,
}: {
  sessionId: string;
  uid: string;
  isReady: boolean;
  hasRolled: boolean;
}) {
  const [toggling, setToggling] = useState(false);

  async function handleToggleReady() {
    setToggling(true);
    try {
      await setPlayerReady(sessionId, uid, !isReady);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleToggleReady}
        className={`btn btn-lg btn-block ${isReady ? 'btn-primary' : 'btn-outline'}`}
        disabled={toggling || !hasRolled}
      >
        {isReady ? '✓ Ready' : 'Mark as Ready'}
      </button>
      {!hasRolled && (
        <p className="text-muted text-center mt-sm" style={{ fontSize: '0.8rem' }}>
          Roll the dice first to enable ready.
        </p>
      )}
    </div>
  );
}
