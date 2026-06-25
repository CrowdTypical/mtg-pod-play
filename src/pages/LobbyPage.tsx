import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import {
  computeTurnOrder,
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

export default function LobbyPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // If the game moves to in_progress, switch to match view
  useEffect(() => {
    if (session?.status === 'in_progress' && sessionId) {
      navigate(`/match/${sessionId}`, { replace: true });
    }
    if (session?.status === 'completed' && sessionId) {
      navigate(`/match/${sessionId}`, { replace: true });
    }
  }, [session?.status, sessionId, navigate]);

  // Real-time subscriptions
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
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.isHost) return -1;
    if (b.isHost) return 1;
    return getDisplayName(a).localeCompare(getDisplayName(b));
  });
  const allReady = players.length >= 2 && players.every((p) => p.isReady);
  const turnOrder = computeTurnOrder(players);

  async function handleCopyCode() {
    await navigator.clipboard.writeText(session!.code);
  }
  async function handleCopyLink() {
    await navigator.clipboard.writeText(joinUrl);
  }

  async function handleStart() {
    if (!sessionId) return;
    try {
      await startGame(sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start game.');
    }
  }

  return (
    <div className="app-container">
      <div className="flex justify-between items-center mb-lg">
        <div>
          <Link to="/" className="btn btn-outline btn-sm">← Leave</Link>
        </div>
        <h1 className="page-title" style={{ margin: 0 }}>Game Lobby</h1>
        <div style={{ width: 80 }} />
      </div>

      {error && <p className="form-error text-center mb-md">{error}</p>}

      {/* Invite section */}
      <div className="card mb-lg">
        <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Game Code</p>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '0.15em' }}>{session.code}</p>
          </div>
          <div className="flex gap-sm">
            <button onClick={handleCopyCode} className="btn btn-outline btn-sm">Copy Code</button>
            <button onClick={handleCopyLink} className="btn btn-primary btn-sm">Copy Invite Link</button>
          </div>
        </div>
        <div className="mt-md">
          <p className="text-muted" style={{ fontSize: '0.8rem' }}>Share this link or code with your pod:</p>
          <code className="text-muted" style={{ fontSize: '0.8rem' }}>{joinUrl}</code>
        </div>
      </div>

      <div className="grid grid-2">
        {/* Player list */}
        <div>
          <h3 style={{ marginBottom: '0.75rem' }}>
            Players ({players.length}/{session.maxPlayers})
          </h3>
          <div className="flex flex-col gap-sm">
            {sortedPlayers.map((p) => (
              <PlayerRow key={p.uid} player={p} />
            ))}
            {players.length < session.maxPlayers && (
              <div className="card text-center text-muted" style={{ padding: '1rem', borderStyle: 'dashed' }}>
                Waiting for more players to join…
              </div>
            )}
          </div>
        </div>

        {/* My setup */}
        <div>
          {me && (
            <MySetupPanel
              sessionId={sessionId!}
              player={me}
            />
          )}
        </div>
      </div>

      {/* Dice & turn order */}
      {players.some((p) => p.diceRoll != null) && (
        <div className="card mt-lg">
          <h3 style={{ marginBottom: '0.75rem' }}>Dice Rolls & Turn Order</h3>
          <div className="flex gap-md" style={{ flexWrap: 'wrap', marginBottom: '1rem' }}>
            {sortedPlayers.map((p) => (
              <div key={p.uid} className="text-center" style={{ minWidth: 80 }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{getDisplayName(p)}</p>
                <p style={{ fontSize: '2rem', fontWeight: 800, color: p.diceRoll ? 'var(--color-accent)' : 'var(--text-muted)' }}>
                  {p.diceRoll ?? '—'}
                </p>
              </div>
            ))}
          </div>
          {turnOrder.length > 0 && (
            <div>
              <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Turn Order:</p>
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
      )}

      {/* Start button (host only) */}
      {isHost && (
        <div className="card mt-lg text-center">
          <button
            onClick={handleStart}
            className="btn btn-primary btn-lg"
            disabled={!allReady}
          >
            {allReady ? 'Start Game' : 'Waiting for all players to be ready…'}
          </button>
          {!allReady && (
            <p className="text-muted mt-sm" style={{ fontSize: '0.85rem' }}>
              All players must hit "Ready" and roll the dice first.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------
 * Sub-components
 * -------------------------------------------------------- */

function PlayerRow({ player }: { player: SessionPlayer }) {
  const name = getDisplayName(player);
  return (
    <div className="card" style={{ padding: '0.75rem 1rem' }}>
      <div className="flex items-center gap-md">
        {player.commander?.imageUris ? (
          <img
            src={player.commander.imageUris.small}
            alt={player.commander.name}
            style={{ width: 40, height: 56, borderRadius: 4 }}
          />
        ) : (
          <div style={{ width: 40, height: 56, borderRadius: 4, background: 'var(--bg-accent)' }} />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-sm">
            <p style={{ fontWeight: 600 }}>{name}</p>
            {player.isHost && <span className="badge badge-host">Host</span>}
            {player.isReady && <span className="badge badge-ready">✓ Ready</span>}
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            {player.commander?.name ?? 'No commander selected'}
            {player.decklist ? ` · ${player.decklist.length} cards` : ''}
          </p>
        </div>
        {player.diceRoll && (
          <div className="text-center">
            <p className="text-muted" style={{ fontSize: '0.7rem' }}>Roll</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-accent)' }}>
              {player.diceRoll}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MySetupPanel({
  sessionId,
  player,
}: {
  sessionId: string;
  player: SessionPlayer;
}) {
  const { user } = useAuth();
  const [commanderQuery, setCommanderQuery] = useState('');
  const [commanderResults, setCommanderResults] = useState<CommanderInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDeckImport, setShowDeckImport] = useState(false);
  const [decklistText, setDecklistText] = useState('');
  const [archidektUrl, setArchidektUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [togglingReady, setTogglingReady] = useState(false);

  const uid = user!.uid;

  useEffect(() => {
    if (!commanderQuery.trim() || player.commander) {
      setCommanderResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchCommanders(commanderQuery);
        setCommanderResults(results.slice(0, 6));
      } catch {
        setCommanderResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [commanderQuery, player.commander]);

  async function handleSetCommander(c: CommanderInfo | null) {
    await setPlayerCommander(sessionId, uid, c);
    setCommanderQuery('');
  }

  async function handleImportPaste() {
    if (!decklistText.trim()) return;
    setImporting(true);
    try {
      const parsed = parseDecklistText(decklistText);
      const enriched = await enrichDecklist(parsed);
      await setPlayerDecklist(sessionId, uid, enriched);
      setShowDeckImport(false);
      setDecklistText('');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportArchidekt() {
    if (!archidektUrl.trim()) return;
    setImporting(true);
    try {
      const imported = await importFromArchidekt(archidektUrl);
      const enriched = await enrichDecklist(imported);
      await setPlayerDecklist(sessionId, uid, enriched);
      setShowDeckImport(false);
      setArchidektUrl('');
    } finally {
      setImporting(false);
    }
  }

  async function handleRoll() {
    setRolling(true);
    try {
      await rollDice(sessionId, uid);
    } finally {
      setRolling(false);
    }
  }

  async function handleToggleReady() {
    setTogglingReady(true);
    try {
      await setPlayerReady(sessionId, uid, !player.isReady);
    } finally {
      setTogglingReady(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>Your Setup</h3>

      {/* Commander */}
      <div className="form-group">
        <label className="form-label">Your Commander</label>
        {player.commander ? (
          <div className="flex items-center gap-md">
            {player.commander.imageUris && (
              <img src={player.commander.imageUris.small} alt="" style={{ width: 48, height: 67, borderRadius: 4 }} />
            )}
            <div className="flex-1">
              <p style={{ fontWeight: 600 }}>{player.commander.name}</p>
              <p className="text-muted" style={{ fontSize: '0.8rem' }}>{player.commander.typeLine}</p>
            </div>
            <button onClick={() => handleSetCommander(null)} className="btn btn-outline btn-sm">Change</button>
          </div>
        ) : (
          <>
            <input
              type="text"
              className="form-input"
              value={commanderQuery}
              onChange={(e) => setCommanderQuery(e.target.value)}
              placeholder="Search commanders…"
            />
            {searching && <p className="form-hint">Searching…</p>}
            {commanderResults.length > 0 && (
              <div className="commander-results">
                {commanderResults.map((c) => (
                  <button key={c.scryfallId} onClick={() => handleSetCommander(c)} className="commander-result">
                    {c.imageUris && <img src={c.imageUris.small} alt={c.name} />}
                    <div>
                      <p style={{ fontWeight: 600 }}>{c.name}</p>
                      <p className="text-muted" style={{ fontSize: '0.8rem' }}>{c.typeLine}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Decklist */}
      <div className="form-group">
        <label className="form-label">Your Decklist</label>
        {player.decklist ? (
          <div className="flex justify-between items-center">
            <p>{player.decklist.length} unique cards</p>
            <button
              onClick={() => setPlayerDecklist(sessionId, uid, null)}
              className="btn btn-outline btn-sm"
            >
              Remove
            </button>
          </div>
        ) : showDeckImport ? (
          <div>
            <div className="flex gap-sm mb-sm">
              <textarea
                className="form-input"
                value={decklistText}
                onChange={(e) => setDecklistText(e.target.value)}
                placeholder="Paste decklist…"
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>
            <input
              type="url"
              className="form-input mb-sm"
              value={archidektUrl}
              onChange={(e) => setArchidektUrl(e.target.value)}
              placeholder="…or Archidekt URL"
            />
            <div className="flex gap-sm">
              <button onClick={handleImportPaste} className="btn btn-primary btn-sm" disabled={importing || !decklistText.trim()}>
                Import Text
              </button>
              <button onClick={handleImportArchidekt} className="btn btn-primary btn-sm" disabled={importing || !archidektUrl.trim()}>
                Import URL
              </button>
              <button onClick={() => setShowDeckImport(false)} className="btn btn-outline btn-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowDeckImport(true)} className="btn btn-outline btn-sm">
            + Add Decklist
          </button>
        )}
      </div>

      {/* Dice roll */}
      <div className="divider" />
      <div className="form-group text-center">
        <label className="form-label">Roll for Turn Order</label>
        {player.diceRoll ? (
          <div>
            <p style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--color-accent)' }}>
              {player.diceRoll}
            </p>
            <button onClick={handleRoll} className="btn btn-outline btn-sm" disabled={rolling}>
              Roll Again
            </button>
          </div>
        ) : (
          <button onClick={handleRoll} className="btn btn-accent btn-lg" disabled={rolling}>
            {rolling ? 'Rolling…' : '🎲 Roll D20'}
          </button>
        )}
      </div>

      {/* Ready */}
      <div className="divider" />
      <button
        onClick={handleToggleReady}
        className={`btn btn-lg btn-block ${player.isReady ? 'btn-primary' : 'btn-outline'}`}
        disabled={togglingReady}
      >
        {player.isReady ? '✓ Ready' : 'Mark as Ready'}
      </button>
    </div>
  );
}