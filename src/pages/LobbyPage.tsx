import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import { useAuth } from '@/context/AuthContext';
import {
  clearMyDiceRoll,
  computeTurnOrder,
  resetDiceRolls,
  rollDice,
  setPlayerCommander,
  setPlayerDecklist,
  setPlayerReady,
  startGame,
  subscribeToPlayers,
  subscribeToSession,
} from '@/services/sessionService';
import {
  enrichDecklist,
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
          {/* Deck name as hyperlink */}
          {hasDeck && (
            <p style={{ fontSize: '0.8rem', marginTop: '0.15rem' }}>
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
  const [showDeckImport, setShowDeckImport] = useState(false);
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
      await setPlayerDecklist(sessionId, uid, enriched, null, null);
      setShowDeckImport(false);
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
      await setPlayerDecklist(sessionId, uid, enriched, imported.name, imported.sourceUrl);
      setShowDeckImport(false);
      setArchidektUrl('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to import from Archidekt.';
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  }

  async function handleClearDeck() {
    await setPlayerDecklist(sessionId, uid, null, null, null);
  }

  const inner = (
    <>
      {/* Commander — visual picker */}
      <div className="form-group">
        <label className="form-label">Your Commander</label>
        <CommanderPicker
          sessionId={sessionId}
          uid={uid}
          currentCommander={player.commander ?? null}
        />
      </div>

      {/* Decklist */}
      <div className="form-group">
        <label className="form-label">Your Decklist</label>
        {player.decklist ? (
          <div className="flex justify-between items-center">
            <div>
              <p>{player.decklist.length} unique cards</p>
              {player.deckName && (
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>{player.deckName}</p>
              )}
            </div>
            <button
              onClick={handleClearDeck}
              className="btn btn-outline btn-sm"
            >
              Remove
            </button>
          </div>
        ) : showDeckImport ? (
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
                🔗 URL
              </button>
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className={`btn btn-xs ${manualMode ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}
              >
                ✍️ Manual Text
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
              <button onClick={() => setShowDeckImport(false)} className="btn btn-outline btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowDeckImport(true)} className="btn btn-outline btn-sm">
            + Add Decklist
          </button>
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

  async function handleRoll() {
    setRolling(true);
    try {
      await rollDice(sessionId, uid);
    } finally {
      setRolling(false);
    }
  }

  return (
    <div className="lobby-dice-inline">
      {diceRoll != null ? (
        <div>
          <p className="lobby-dice-result">{diceRoll}</p>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
            You rolled a {diceRoll}. Ask the host to reset if needed.
          </p>
        </div>
      ) : (
        <button onClick={handleRoll} className="btn btn-accent btn-lg" disabled={rolling}>
          {rolling ? 'Rolling…' : '🎲 Roll D20'}
        </button>
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
