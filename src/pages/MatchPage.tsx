import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import {
  adjustCommanderDamage,
  adjustPlayerHealth,
  adjustPlayerPoison,
  advanceTurn,
  eliminatePlayer,
  subscribeToCommanderDamage,
  subscribeToEvents,
  subscribeToPlayers,
  subscribeToSession,
} from '@/services/sessionService';
import type {
  CommanderDamageMap,
  Decklist,
  Session,
  SessionEvent,
  SessionPlayer,
} from '@/types';
import { displayName as getDisplayName } from '@/types';

export default function MatchPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [cmdDamage, setCmdDamage] = useState<CommanderDamageMap>({});
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [selectedDeckUid, setSelectedDeckUid] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const u1 = subscribeToSession(sessionId, setSession);
    const u2 = subscribeToPlayers(sessionId, setPlayers);
    const u3 = subscribeToCommanderDamage(sessionId, setCmdDamage);
    const u4 = subscribeToEvents(sessionId, (e) => setEvents(e.slice(-20).reverse()));
    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [sessionId]);

  // Order players by turn order
  const orderedPlayers = useMemo(() => {
    if (!session || session.turnOrder.length === 0) return players;
    const map = new Map(players.map((p) => [p.uid, p]));
    return session.turnOrder
      .map((uid) => map.get(uid))
      .filter((p): p is SessionPlayer => p !== undefined);
  }, [session, players]);

  const isCompleted = session?.status === 'completed';

  if (!session) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
      </div>
    );
  }

  // Guard against race condition: session doc loaded (status: in_progress)
  // but players array hasn't populated yet. Without this guard,
  // getDisplayName(undefined) throws a TypeError and React shows a black screen.
  if (players.length === 0) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p className="text-muted">Loading match data…</p>
      </div>
    );
  }

  // Safe accessor — the current turn player may not exist yet if index is stale.
  const currentTurnPlayer =
    orderedPlayers[session.currentTurnIndex] ?? orderedPlayers[0] ?? players[0];

  return (
    <div className={`match-container ${isCompleted ? 'match-completed' : ''}`}>
      {/* Header bar */}
      <div className="match-header">
        <Link to="/" className="btn btn-outline btn-sm">← Exit</Link>
        <div className="turn-indicator">
          {session.turnOrder.length > 0 && !isCompleted && currentTurnPlayer && (
            <>
              <span className="text-muted">Turn: </span>
              <strong>{getDisplayName(currentTurnPlayer)}</strong>
            </>
          )}
          {isCompleted && <strong>Game Over</strong>}
        </div>
        {!isCompleted && user?.uid === session.hostUid && (
          <button
            onClick={() => sessionId && advanceTurn(sessionId)}
            className="btn btn-primary btn-sm"
          >
            Next Turn →
          </button>
        )}
        <div style={{ width: isCompleted ? 0 : 0 }} />
      </div>

      {/* Player grid — scales to 7 players */}
      <div className={`player-grid player-grid-${orderedPlayers.length}`}>
        {orderedPlayers.map((player, idx) => (
          <PlayerPanel
            key={player.uid}
            player={player}
            isCurrentTurn={!isCompleted && idx === session.currentTurnIndex}
            isMe={user?.uid === player.uid}
            cmdDamageFrom={cmdDamage[player.uid] ?? {}}
            players={orderedPlayers}
            sessionId={sessionId!}
            onViewDeck={() => setSelectedDeckUid(player.uid)}
          />
        ))}
      </div>

      {/* Event log */}
      <div className="match-log">
        <h4 style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Recent Activity</h4>
        {events.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>No events yet.</p>
        ) : (
          <div className="event-list">
            {events.map((e) => (
              <div key={e.id} className="event-item">
                <span className="event-msg">{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* OBS overlay link */}
      <div className="match-footer">
        <Link to={`/overlay/${sessionId}`} target="_blank" className="text-muted" style={{ fontSize: '0.8rem' }}>
          📺 Open OBS Overlay
        </Link>
      </div>

      {/* Decklist modal */}
      {selectedDeckUid && (
        <DecklistModal
          player={orderedPlayers.find((p) => p.uid === selectedDeckUid)!}
          onClose={() => setSelectedDeckUid(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
 * Player Panel
 * ============================================================ */

function PlayerPanel({
  player,
  isCurrentTurn,
  isMe,
  cmdDamageFrom,
  players,
  sessionId,
  onViewDeck,
}: {
  player: SessionPlayer;
  isCurrentTurn: boolean;
  isMe: boolean;
  cmdDamageFrom: Record<string, number>;
  players: SessionPlayer[];
  sessionId: string;
  onViewDeck: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleHealth(delta: number) {
    setBusy(true);
    try {
      await adjustPlayerHealth(sessionId, player.uid, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handlePoison(delta: number) {
    setBusy(true);
    try {
      await adjustPlayerPoison(sessionId, player.uid, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handleCmdDamage(sourceUid: string, delta: number) {
    setBusy(true);
    try {
      await adjustCommanderDamage(sessionId, player.uid, sourceUid, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handleEliminate() {
    if (!confirm(`Eliminate ${getDisplayName(player)}?`)) return;
    await eliminatePlayer(sessionId, player.uid);
  }

  const name = getDisplayName(player);
  const isDead = player.eliminated || player.health <= 0;

  return (
    <div
      className={`player-panel ${isCurrentTurn ? 'current-turn' : ''} ${isDead ? 'eliminated' : ''} ${isMe ? 'is-me' : ''}`}
    >
      {/* Header */}
      <div className="panel-header">
        {player.commander?.imageUris ? (
          <img src={player.commander.imageUris.small} alt="" className="panel-cmd-img" />
        ) : (
          <div className="panel-cmd-img panel-cmd-placeholder" />
        )}
        <div className="panel-name">
          <div className="flex items-center gap-sm">
            <strong>{name}</strong>
            {player.placement && <span className="placement-badge">#{player.placement}</span>}
          </div>
          <span className="text-muted panel-cmd-name">{player.commander?.name ?? 'Unknown'}</span>
        </div>
      </div>

      {/* Health */}
      <div className="stat-health">
        <button
          onClick={() => handleHealth(-1)}
          className="stat-btn"
          disabled={busy || isDead}
        >−</button>
        <div className="health-display">
          <span className="health-number">{player.health}</span>
          <span className="health-label">Life</span>
        </div>
        <button
          onClick={() => handleHealth(1)}
          className="stat-btn"
          disabled={busy || isDead}
        >+</button>
      </div>

      {/* Quick damage buttons */}
      <div className="quick-dmg">
        {[-5, -3, -2, -1].map((n) => (
          <button
            key={n}
            onClick={() => handleHealth(n)}
            className="quick-dmg-btn"
            disabled={busy || isDead}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Poison & Commander damage */}
      <div className="panel-stats">
        <div className="stat-row">
          <span className="stat-label">☠ Poison</span>
          <div className="stat-controls">
            <button onClick={() => handlePoison(-1)} disabled={busy || isDead}>−</button>
            <span className={`stat-value ${player.poison >= 8 ? 'stat-warning' : ''}`}>{player.poison}</span>
            <button onClick={() => handlePoison(1)} disabled={busy || isDead}>+</button>
          </div>
        </div>

        {/* Commander damage received */}
        <div className="cmd-dmg-section">
          <p className="stat-label" style={{ marginBottom: '0.25rem' }}>⚔ Commander Damage</p>
          {players
            .filter((p) => p.uid !== player.uid && p.commander)
            .map((source) => {
              const dmg = cmdDamageFrom[source.uid] ?? 0;
              return (
                <div key={source.uid} className="cmd-dmg-row">
                  <span className="cmd-dmg-name text-muted">
                    {source.commander?.name?.split(',')[0] ?? getDisplayName(source)}
                  </span>
                  <div className="stat-controls">
                    <button
                      onClick={() => handleCmdDamage(source.uid, -1)}
                      disabled={busy || isDead}
                    >−</button>
                    <span className={`stat-value ${dmg >= 18 ? 'stat-warning' : ''}`}>{dmg}</span>
                    <button
                      onClick={() => handleCmdDamage(source.uid, 1)}
                      disabled={busy || isDead}
                    >+</button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Footer actions */}
      <div className="panel-footer">
        {player.decklist && player.decklist.length > 0 && (
          <button onClick={onViewDeck} className="btn btn-outline btn-sm">
            📜 Deck ({player.decklist.length})
          </button>
        )}
        {!isDead && (
          <button onClick={handleEliminate} className="btn btn-outline btn-sm btn-danger-outline">
            Eliminate
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Decklist Modal
 * ============================================================ */

function DecklistModal({ player, onClose }: { player: SessionPlayer; onClose: () => void }) {
  const decklist: Decklist = player.decklist ?? [];
  const [filter, setFilter] = useState('');

  const filtered = filter
    ? decklist.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
    : decklist;

  const totalCards = decklist.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{getDisplayName(player)}'s Decklist</h3>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              {player.commander?.name} · {decklist.length} unique · {totalCards} total
            </p>
          </div>
          <button onClick={onClose} className="btn btn-outline btn-sm">✕</button>
        </div>

        <input
          type="text"
          className="form-input mb-md"
          placeholder="Filter cards…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        <div className="decklist-grid">
          {filtered.map((entry, i) => (
            <div key={i} className="decklist-entry">
              {entry.imageUrl ? (
                <img src={entry.imageUrl} alt={entry.name} className="decklist-thumb" loading="lazy" />
              ) : (
                <div className="decklist-thumb decklist-thumb-placeholder" />
              )}
              <div className="decklist-info">
                <span className="decklist-count">{entry.count}×</span>
                <span className="decklist-name">{entry.name}</span>
                {entry.isCommander && <span className="badge badge-commander">CMDR</span>}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-muted text-center">No cards match "{filter}"</p>
        )}
      </div>
    </div>
  );
}