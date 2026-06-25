import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  subscribeToCommanderDamage,
  subscribeToPlayers,
  subscribeToSession,
} from '@/services/sessionService';
import type {
  CommanderDamageMap,
  Session,
  SessionPlayer,
} from '@/types';
import { displayName as getDisplayName } from '@/types';

/**
 * Public, read-only OBS overlay.
 * Designed to be embedded as a Browser Source in OBS.
 * Transparent background, large readable numbers, no controls.
 */
export default function OverlayPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<SessionPlayer[]>([]);
  const [cmdDamage, setCmdDamage] = useState<CommanderDamageMap>({});

  useEffect(() => {
    if (!sessionId) return;
    const u1 = subscribeToSession(sessionId, setSession);
    const u2 = subscribeToPlayers(sessionId, setPlayers);
    const u3 = subscribeToCommanderDamage(sessionId, setCmdDamage);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [sessionId]);

  const orderedPlayers = useMemo(() => {
    if (!session || session.turnOrder.length === 0) return players;
    const map = new Map(players.map((p) => [p.uid, p]));
    return session.turnOrder
      .map((uid) => map.get(uid))
      .filter((p): p is SessionPlayer => p !== undefined);
  }, [session, players]);

  const activePlayers = orderedPlayers.filter((p) => !p.eliminated && p.health > 0);
  const currentTurnUid = session && session.turnOrder.length > 0
    ? session.turnOrder[session.currentTurnIndex]
    : null;

  return (
    <div className="overlay-root">
      <div className={`overlay-grid overlay-grid-${activePlayers.length}`}>
        {orderedPlayers.map((player) => {
          const isCurrent = player.uid === currentTurnUid && session?.status !== 'completed';
          const isDead = player.eliminated || player.health <= 0;
          return (
            <div
              key={player.uid}
              className={`overlay-card ${isCurrent ? 'overlay-active' : ''} ${isDead ? 'overlay-dead' : ''}`}
            >
              {/* Commander thumbnail */}
              {player.commander?.imageUris?.small && (
                <img
                  src={player.commander.imageUris.small}
                  alt=""
                  className="overlay-cmd-img"
                />
              )}

              {/* Name */}
              <div className="overlay-name">
                {getDisplayName(player)}
                {player.placement && session?.status === 'completed' && (
                  <span className="overlay-placement"> #{player.placement}</span>
                )}
              </div>

              {/* Health */}
              <div className={`overlay-health ${player.health <= 10 ? 'overlay-low' : ''}`}>
                {player.health}
              </div>

              {/* Poison (only if > 0) */}
              {player.poison > 0 && (
                <div className="overlay-poison">☠ {player.poison}</div>
              )}

              {/* Commander damage (compact) */}
              {(() => {
                const dmg = cmdDamage[player.uid] ?? {};
                const entries = Object.entries(dmg).filter(([, v]) => v > 0);
                if (entries.length === 0) return null;
                return (
                  <div className="overlay-cmd-dmg">
                    {entries.map(([sourceUid, v]) => {
                      const source = orderedPlayers.find((p) => p.uid === sourceUid);
                      const label = source?.commander?.name?.split(',')[0] ?? '?';
                      return (
                        <span key={sourceUid} className={v >= 18 ? 'overlay-cmd-warn' : ''}>
                          {label}: {v}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}