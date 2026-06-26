import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import {
  adjustCommanderDamage,
  adjustPlayerHealth,
  adjustPlayerPoison,
  advanceTurn,
  eliminatePlayer,
  revivePlayer,
  transferHost,
  subscribeToCommanderDamage,
  subscribeToEvents,
  subscribeToPlayers,
  subscribeToSession,
} from '@/services/sessionService';
import { getCardById, getCardByName, getCardRulings } from '@/lib/scryfall';
import FormatLegalities from '@/components/FormatLegalities';
import SetupEditor from '@/components/SetupEditor';
import type {
  CommanderDamageMap,
  Decklist,
  ScryfallCard,
  ScryfallRuling,
  Session,
  SessionEvent,
  SessionPlayer,
} from '@/types';
import { displayName as getDisplayName } from '@/types';
import '@/styles/playboard.css';
import '@/styles/commander-detail.css';

export default function MatchPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [cmdDamage, setCmdDamage] = useState<CommanderDamageMap>({});
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [selectedDeckUid, setSelectedDeckUid] = useState<string | null>(null);
  const [focusedCard, setFocusedCard] = useState<{
    scryfallId?: string;
    name: string;
    imageUrl?: string;
  } | null>(null);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [editingSetupUid, setEditingSetupUid] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const u1 = subscribeToSession(sessionId, setSession);
    const u2 = subscribeToPlayers(sessionId, setPlayers);
    const u3 = subscribeToCommanderDamage(sessionId, setCmdDamage);
    const u4 = subscribeToEvents(sessionId, (e) => setEvents(e.slice(-30).reverse()));
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

  // Guard: session loaded but players not yet populated.
  if (players.length === 0) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p className="text-muted">Loading match data…</p>
      </div>
    );
  }

  const isHost = user?.uid === session.hostUid;
  const matchMode = session.matchMode ?? 'normal';
  const currentTurnPlayer =
    orderedPlayers[session.currentTurnIndex] ?? orderedPlayers[0] ?? players[0];
  // Derive a display turn number from the turn index (0-based → 1-based)
  const turnNumber = (session.currentTurnIndex ?? 0) + 1;

  /** Whether the current user can edit this player's stats. */
  function canControl(player: SessionPlayer): boolean {
    if (!user) return false;
    if (matchMode === 'host_driven') return isHost;
    return user.uid === player.uid; // normal mode: only self
  }

  return (
    <div className={`match-container ${isCompleted ? 'match-completed' : ''}`}>
      {/* Header bar */}
      <div className="match-header">
        <Link to="/" className="btn btn-outline btn-sm">← Exit</Link>
        <div className="turn-indicator">
          {session.turnOrder.length > 0 && !isCompleted && currentTurnPlayer && (
            <div className="turn-pill">
              {currentTurnPlayer.commander?.imageUris?.small && (
                <img
                  src={currentTurnPlayer.commander.imageUris.small}
                  alt=""
                  className="turn-thumb"
                />
              )}
              <div className="turn-text">
                <span className="turn-label">Turn {turnNumber}</span>
                <strong>{getDisplayName(currentTurnPlayer)}</strong>
              </div>
            </div>
          )}
          {isCompleted && (
            <div className="turn-pill">
              <span className="turn-text">
                <span className="turn-label">Game Over</span>
                <strong>🏁 Final</strong>
              </span>
            </div>
          )}
        </div>
        {!isCompleted && isHost && (
          <button
            onClick={() => sessionId && advanceTurn(sessionId)}
            className="btn btn-primary btn-sm"
          >
            Next Turn →
          </button>
        )}
        <div />
      </div>

      {/* Host info banner */}
      {isHost && !isCompleted && (
        <div className="host-banner">
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>
            {matchMode === 'host_driven'
              ? '🎛️ Host-Driven Mode — you control all players'
              : '👤 Player-Driven Mode — each player controls their own board'}
          </span>
        </div>
      )}

      {/* Player grid — scales to 7 players */}
      <div className={`player-grid player-grid-${orderedPlayers.length}`}>
        {orderedPlayers.map((player, idx) => (
          <PlayerPanel
            key={player.uid}
            player={player}
            isCurrentTurn={!isCompleted && idx === session.currentTurnIndex}
            isMe={user?.uid === player.uid}
            canControl={canControl(player)}
            isHost={isHost}
            matchMode={matchMode}
            cmdDamageFrom={cmdDamage[player.uid] ?? {}}
            players={orderedPlayers}
            sessionId={sessionId!}
            startingLife={session.startingLife}
            onViewDeck={() => setSelectedDeckUid(player.uid)}
            onAdvanceTurn={() => sessionId && advanceTurn(sessionId)}
            onEditSetup={() => setEditingSetupUid(player.uid)}
          />
        ))}
      </div>

      {/* Event log (collapsible) */}
      <div className={`match-log ${logCollapsed ? 'collapsed' : ''}`}>
        <div className="match-log-header" onClick={() => setLogCollapsed((v) => !v)}>
          <h4>Recent Activity</h4>
          <span className="match-log-toggle">▼</span>
        </div>
        <div className="match-log-body">
          {events.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>No events yet.</p>
          ) : (
            <div className="event-list">
              {events.map((e) => (
                <div key={e.id} className={`event-item ${getEventClass(e.message)}`}>
                  <span className="event-icon">{getEventIcon(e.message)}</span>
                  <span className="event-msg">{e.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* OBS overlay link */}
      <div className="match-footer">
        <Link
          to={`/overlay/${sessionId}`}
          target="_blank"
          className="text-muted"
          style={{ fontSize: '0.8rem' }}
        >
          📺 Open OBS Overlay
        </Link>
      </div>

      {/* Decklist modal */}
      {selectedDeckUid && (
        <DecklistModal
          player={orderedPlayers.find((p) => p.uid === selectedDeckUid)!}
          onClose={() => setSelectedDeckUid(null)}
          onCardClick={setFocusedCard}
        />
      )}

      {/* Card detail modal */}
      {focusedCard && (
        <CardDetailModal card={focusedCard} onClose={() => setFocusedCard(null)} />
      )}

      {/* Setup editor modal (change commander/decklist mid-game) */}
      {editingSetupUid && (
        <SetupEditor
          sessionId={sessionId!}
          player={orderedPlayers.find((p) => p.uid === editingSetupUid)!}
          onClose={() => setEditingSetupUid(null)}
        />
      )}
    </div>
  );
}

/** Helper: assign an icon based on event message content */
function getEventIcon(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('eliminated') || lower.includes('died')) return '💀';
  if (lower.includes('damage') || lower.includes('lost')) return '⚔️';
  if (lower.includes('healed') || lower.includes('gained')) return '💚';
  if (lower.includes('poison')) return '☠';
  if (lower.includes('turn')) return '🔄';
  if (lower.includes('revived')) return '♻️';
  return '•';
}

/** Helper: assign a CSS class based on event message content */
function getEventClass(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('eliminated') || lower.includes('died')) return 'event-danger';
  if (lower.includes('damage') || lower.includes('lost')) return 'event-damage';
  if (lower.includes('healed') || lower.includes('gained')) return 'event-heal';
  if (lower.includes('poison')) return 'event-poison';
  return '';
}

/* ============================================================
 * Player Panel — Redesigned with progress bars and better hierarchy
 * ============================================================ */

function PlayerPanel({
  player,
  isCurrentTurn,
  isMe,
  canControl,
  isHost,
  matchMode,
  cmdDamageFrom,
  players,
  sessionId,
  startingLife,
  onViewDeck,
  onAdvanceTurn,
  onEditSetup,
}: {
  player: SessionPlayer;
  isCurrentTurn: boolean;
  isMe: boolean;
  canControl: boolean;
  isHost: boolean;
  matchMode: 'normal' | 'host_driven';
  cmdDamageFrom: Record<string, number>;
  players: SessionPlayer[];
  sessionId: string;
  startingLife: number;
  onViewDeck: () => void;
  onAdvanceTurn: () => void;
  onEditSetup: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [showHostMenu, setShowHostMenu] = useState(false);
  const prevHealth = useRef(player.health);
  const [flashType, setFlashType] = useState<'up' | 'down' | null>(null);

  // Detect health changes to trigger flash animation
  useEffect(() => {
    if (player.health !== prevHealth.current) {
      setFlashType(player.health > prevHealth.current ? 'up' : 'down');
      prevHealth.current = player.health;
      const timer = setTimeout(() => setFlashType(null), 600);
      return () => clearTimeout(timer);
    }
  }, [player.health]);

  async function handleHealth(delta: number) {
    if (!canControl) return;
    setBusy(true);
    try {
      await adjustPlayerHealth(sessionId, player.uid, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handlePoison(delta: number) {
    if (!canControl) return;
    setBusy(true);
    try {
      await adjustPlayerPoison(sessionId, player.uid, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handleCmdDamage(sourceUid: string, delta: number) {
    if (!canControl) return;
    setBusy(true);
    try {
      await adjustCommanderDamage(sessionId, player.uid, sourceUid, delta);
    } finally {
      setBusy(false);
    }
  }

  async function handleEliminate() {
    if (!canControl) return;
    if (!confirm(`Eliminate ${getDisplayName(player)}?`)) return;
    await eliminatePlayer(sessionId, player.uid);
  }

  async function handleRevive() {
    if (!isHost) return;
    if (!confirm(`Revive ${getDisplayName(player)}?`)) return;
    await revivePlayer(sessionId, player.uid);
  }

  async function handleTransferHost() {
    if (!isHost) return;
    if (!confirm(`Transfer host to ${getDisplayName(player)}?`)) return;
    await transferHost(sessionId, player.uid);
    setShowHostMenu(false);
  }

  const name = getDisplayName(player);
  const isDead = player.eliminated || player.health <= 0;

  // Health visual states
  const healthRatio = player.health / (startingLife || 40);
  let healthClass = '';
  if (healthRatio <= 0.15) healthClass = 'health-critical';
  else if (healthRatio <= 0.35) healthClass = 'health-low';

  // Poison progress (lethal at 10)
  const poisonPct = Math.min((player.poison / 10) * 100, 100);

  // Color identity for the top strip
  const colors = player.commander?.colors ?? [];
  const colorMap: Record<string, string> = {
    W: 'var(--color-w)',
    U: 'var(--color-u)',
    B: 'var(--color-b)',
    R: 'var(--color-r)',
    G: 'var(--color-g)',
  };

  // Commander art for panel background
  const cmdArtUrl = player.commander?.imageUris?.normal ?? player.commander?.imageUris?.large;

  // Pass turn button shows on the current turn player's panel.
  const showPassTurn =
    isCurrentTurn &&
    !isDead &&
    ((matchMode === 'normal' && isMe) || (matchMode === 'host_driven' && isHost));

  return (
    <div
      className={`player-panel ${isCurrentTurn ? 'current-turn' : ''} ${isDead ? 'eliminated' : ''} ${isMe ? 'is-me' : ''}`}
    >
      {/* Color identity strip */}
      {colors.length > 0 && (
        <div className="panel-color-strip">
          {colors.map((c, i) => (
            <span key={i} style={{ background: colorMap[c] ?? 'var(--color-border)' }} />
          ))}
        </div>
      )}

      {/* Commander art background */}
      {cmdArtUrl && (
        <div className="panel-art-bg" style={{ backgroundImage: `url(${cmdArtUrl})` }} />
      )}
      <div className="panel-art-overlay" />

      {/* Eliminated overlay */}
      {isDead && (
        <div className="eliminated-overlay">
          <span className="eliminated-icon">💀</span>
          <span className="eliminated-text">ELIMINATED</span>
          {player.placement && (
            <span className="eliminated-placement">#{player.placement}</span>
          )}
        </div>
      )}

      {/* Content wrapper */}
      <div className="panel-content">
        {/* Header */}
        <div className="panel-header">
          {player.commander?.imageUris ? (
            <img src={player.commander.imageUris.small} alt="" className="panel-cmd-img" />
          ) : (
            <div className="panel-cmd-img panel-cmd-placeholder">?</div>
          )}
          <div className="panel-name">
            <div className="flex items-center gap-sm">
              <strong>{name}</strong>
              {player.isHost && <span className="badge badge-host">HOST</span>}
              {player.bracket != null && (
                <span
                  className="badge"
                  title={`Bracket ${player.bracket}`}
                  style={{ background: 'var(--color-accent)', color: '#fff', fontSize: '0.65rem', padding: '0.1rem 0.35rem', fontWeight: 700 }}
                >
                  B{player.bracket}
                </span>
              )}
            </div>
            <span className="panel-cmd-name">{player.commander?.name ?? 'Unknown'}</span>
          </div>
          {/* Active turn badge */}
          {isCurrentTurn && !isDead && (
            <span className="active-badge">● ACTIVE</span>
          )}
        </div>

        {/* Pass Turn button (prominent, current player only) */}
        {showPassTurn && (
          <button
            onClick={onAdvanceTurn}
            className="btn btn-primary btn-block btn-sm pass-turn-btn"
          >
            ⏭️ Pass Turn
          </button>
        )}

        {/* Health — centerpiece */}
        <div className={`stat-health ${flashType ? `flash-${flashType}` : ''}`}>
          {canControl ? (
            <button
              onClick={() => handleHealth(-1)}
              className="stat-btn stat-btn-lg stat-btn-minus"
              disabled={busy || isDead}
            >
              −
            </button>
          ) : (
            <div className="stat-btn-spacer stat-btn-lg" />
          )}
          <div className="health-display">
            <span className={`health-number ${healthClass}`}>{player.health}</span>
            <span className="health-label">Life</span>
            {/* Health bar */}
            <div className="health-bar-track">
              <div
                className={`health-bar-fill ${healthClass}`}
                style={{ width: `${Math.max(healthRatio * 100, 2)}%` }}
              />
            </div>
          </div>
          {canControl ? (
            <button
              onClick={() => handleHealth(1)}
              className="stat-btn stat-btn-lg"
              disabled={busy || isDead}
            >
              +
            </button>
          ) : (
            <div className="stat-btn-spacer stat-btn-lg" />
          )}
        </div>

        {/* Quick damage buttons — only for controllable players */}
        {canControl && !isDead && (
          <div className="quick-dmg">
            <button onClick={() => handleHealth(-5)} className="quick-dmg-btn" disabled={busy}>−5</button>
            <button onClick={() => handleHealth(-3)} className="quick-dmg-btn" disabled={busy}>−3</button>
            <button onClick={() => handleHealth(-2)} className="quick-dmg-btn" disabled={busy}>−2</button>
            <button onClick={() => handleHealth(-1)} className="quick-dmg-btn" disabled={busy}>−1</button>
            <button onClick={() => handleHealth(1)} className="quick-dmg-btn quick-dmg-heal" disabled={busy}>+1</button>
          </div>
        )}

        {/* Poison & Commander damage — redesigned with progress bars */}
        <div className="panel-stats">
          {/* Poison */}
          <div className="stat-bar-row">
            <div className="stat-bar-header">
              <span className="stat-label">☠ Poison</span>
              <span className={`stat-value ${player.poison >= 8 ? 'stat-warning' : ''}`}>
                {player.poison}/10
              </span>
            </div>
            <div className="progress-track">
              <div
                className={`progress-fill progress-poison ${player.poison >= 8 ? 'progress-danger' : ''}`}
                style={{ width: `${poisonPct}%` }}
              />
            </div>
            {canControl && !isDead && (
              <div className="stat-bar-controls">
                <button onClick={() => handlePoison(-1)} disabled={busy || isDead}>−</button>
                <button onClick={() => handlePoison(1)} disabled={busy || isDead}>+</button>
              </div>
            )}
          </div>

          {/* Commander damage received */}
          <div className="cmd-dmg-section">
            <p className="stat-label" style={{ marginBottom: '0.35rem' }}>⚔ Commander Damage</p>
            {players
              .filter((p) => p.uid !== player.uid && p.commander)
              .map((source) => {
                const dmg = cmdDamageFrom[source.uid] ?? 0;
                const dmgPct = Math.min((dmg / 21) * 100, 100);
                const sourceColor = source.commander?.colors?.[0] ?? '';
                return (
                  <div key={source.uid} className="cmd-dmg-bar-row">
                    <div className="cmd-dmg-bar-header">
                      <span className="cmd-dmg-name text-muted">
                        {source.commander?.name?.split(',')[0] ?? getDisplayName(source)}
                      </span>
                      <span className={`stat-value ${dmg >= 18 ? 'stat-warning' : ''}`}>
                        {dmg}/21
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className={`progress-fill ${dmg >= 18 ? 'progress-danger' : ''}`}
                        style={{
                          width: `${dmgPct}%`,
                          background: dmg >= 18 ? '' : (colorMap[sourceColor] ?? 'var(--color-primary)'),
                        }}
                      />
                    </div>
                    {canControl && !isDead && (
                      <div className="stat-bar-controls">
                        <button onClick={() => handleCmdDamage(source.uid, -1)} disabled={busy || isDead}>−</button>
                        <button onClick={() => handleCmdDamage(source.uid, 1)} disabled={busy || isDead}>+</button>
                      </div>
                    )}
                  </div>
                );
              })}
            {players.filter((p) => p.uid !== player.uid && p.commander).length === 0 && (
              <p className="text-muted" style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>
                No opponent commanders
              </p>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="panel-footer">
          {player.decklist && player.decklist.length > 0 && (
            <button onClick={onViewDeck} className="btn btn-outline btn-sm">
              📜 Deck ({player.decklist.length})
            </button>
          )}

          {/* Edit Setup (commander/decklist) — available to controlling user */}
          {canControl && (
            <button onClick={onEditSetup} className="btn btn-outline btn-sm">
              ✏️ Edit Setup
            </button>
          )}

          {/* Eliminate / Revive */}
          {!isDead && canControl && (
            <button
              onClick={handleEliminate}
              className="btn btn-outline btn-sm btn-danger-outline"
            >
              Eliminate
            </button>
          )}
          {isDead && isHost && (
            <button onClick={handleRevive} className="btn btn-outline btn-sm btn-accent-outline">
              ♻️ Revive
            </button>
          )}

          {/* Host menu (transfer host) */}
          {isHost && !isMe && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowHostMenu((v) => !v)}
                className="btn btn-outline btn-sm"
                title="Host options"
              >
                ⚙️
              </button>
              {showHostMenu && (
                <div className="host-menu">
                  <button onClick={handleTransferHost} className="host-menu-item">
                    👑 Make Host
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Decklist Modal
 * ============================================================ */

function DecklistModal({
  player,
  onClose,
  onCardClick,
}: {
  player: SessionPlayer;
  onClose: () => void;
  onCardClick: (card: { scryfallId?: string; name: string; imageUrl?: string }) => void;
}) {
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
            <div
              key={i}
              className="decklist-entry decklist-entry-clickable"
              onClick={() =>
                onCardClick({
                  scryfallId: entry.scryfallId,
                  name: entry.name,
                  imageUrl: entry.imageUrl,
                })
              }
            >
              {entry.imageUrl ? (
                <img
                  src={entry.imageUrl}
                  alt={entry.name}
                  className="decklist-thumb"
                  loading="lazy"
                />
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

/* ============================================================
 * Card Detail Modal
 * ============================================================ */

function CardDetailModal({
  card,
  onClose,
}: {
  card: { scryfallId?: string; name: string; imageUrl?: string };
  onClose: () => void;
}) {
  const [details, setDetails] = useState<ScryfallCard | null>(null);
  const [rulings, setRulings] = useState<ScryfallRuling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRulings([]);
    (async () => {
      let result: ScryfallCard | null = null;
      if (card.scryfallId) {
        result = await getCardById(card.scryfallId);
      }
      if (!result) {
        result = await getCardByName(card.name);
      }
      if (!cancelled) {
        setDetails(result);
        setLoading(false);
        // Fetch rulings using the canonical Scryfall ID for accuracy.
        const id = result?.id ?? card.scryfallId;
        if (id) {
          const r = await getCardRulings(id);
          if (!cancelled) setRulings(r);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [card.scryfallId, card.name]);

  // Use the best available image.
  const primaryImage =
    details?.image_uris?.large ??
    details?.image_uris?.normal ??
    card.imageUrl ??
    details?.card_faces?.[0]?.image_uris?.large;

  const hasFaces = details?.card_faces && details.card_faces.length > 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content card-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{details?.name ?? card.name}</h3>
          <button onClick={onClose} className="btn btn-outline btn-sm">✕</button>
        </div>

        {loading && (
          <div className="text-center" style={{ padding: '2rem' }}>
            <div className="spinner" />
            <p className="text-muted mt-md">Loading card details…</p>
          </div>
        )}

        {!loading && details && (
          <div className="card-detail-body">
            {/* Left: image(s) */}
            <div className="card-detail-images">
              {primaryImage && (
                <img
                  src={primaryImage}
                  alt={details.name}
                  className="card-detail-img"
                />
              )}
              {hasFaces && details.card_faces![1]?.image_uris?.large && (
                <img
                  src={details.card_faces![1].image_uris.large}
                  alt={details.card_faces![1].name}
                  className="card-detail-img"
                />
              )}
            </div>

            {/* Right: text details */}
            <div className="card-detail-info">
              {details.mana_cost && (
                <p className="card-detail-mana">{details.mana_cost}</p>
              )}
              <p className="text-muted card-detail-type">{details.type_line}</p>
              {details.power && details.toughness && (
                <p style={{ fontWeight: 600 }}>{details.power}/{details.toughness}</p>
              )}
              {details.loyalty && (
                <p style={{ fontWeight: 600 }}>Loyalty: {details.loyalty}</p>
              )}

              {hasFaces ? (
                details.card_faces!.map((face, i) => (
                  <div key={i} className="card-face-block">
                    <p className="card-face-name">
                      {face.name}
                      {face.mana_cost && <span className="card-detail-mana"> {face.mana_cost}</span>}
                    </p>
                    <p className="text-muted" style={{ fontSize: '0.85rem' }}>{face.type_line}</p>
                    <p className="card-detail-oracle">{face.oracle_text}</p>
                  </div>
                ))
              ) : (
                <p className="card-detail-oracle">{details.oracle_text}</p>
              )}

              {details.flavor_text && (
                <p className="card-detail-flavor text-muted">{details.flavor_text}</p>
              )}

              <div className="card-detail-meta">
                <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                  {details.set_name} ({details.set?.toUpperCase()}) ·{' '}
                  {details.rarity} · #{details.collector_number}
                </p>
              </div>

              {/* Prices */}
              {details.prices && (details.prices.usd || details.prices.usd_foil) && (
                <div className="card-detail-prices">
                  {details.prices.usd && (
                    <span className="badge">Regular: ${details.prices.usd}</span>
                  )}
                  {details.prices.usd_foil && (
                    <span className="badge">Foil: ${details.prices.usd_foil}</span>
                  )}
                </div>
              )}

              {/* Legalities — compact pill badge layout */}
              {details.legalities && (
                <FormatLegalities legalities={details.legalities} />
              )}

              {/* Rulings / Notes */}
              {rulings.length > 0 && (
                <div className="card-detail-section">
                  <p className="card-detail-section-title">📝 Rulings & Notes</p>
                  <div className="rulings-list">
                    {rulings.map((r) => (
                      <div key={r.oracle_id} className="ruling-item">
                        <div className="ruling-date">
                          {r.published_at}
                          <span className="ruling-source">{r.source}</span>
                        </div>
                        {r.comment}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {details.scryfall_uri && (
                <a
                  href={details.scryfall_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted"
                  style={{ fontSize: '0.8rem', display: 'inline-block', marginTop: '0.5rem' }}
                >
                  View on Scryfall →
                </a>
              )}
            </div>
          </div>
        )}

        {!loading && !details && (
          <div className="text-center" style={{ padding: '2rem' }}>
            {primaryImage ? (
              <img src={primaryImage} alt={card.name} className="card-detail-img" />
            ) : (
              <p className="text-muted">Could not load details for "{card.name}".</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}