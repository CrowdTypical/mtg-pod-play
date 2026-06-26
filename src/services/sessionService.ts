import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import type {
  CommanderDamageMap,
  CommanderInfo,
  Decklist,
  MatchMode,
  Session,
  SessionEvent,
  SessionPlayer,
} from '@/types';
import { displayName as getDisplayName } from '@/types';

const DEFAULT_STARTING_LIFE = 40;

/* --------------------------------------------------------
 * Join code generation
 * -------------------------------------------------------- */

/** Generate a 6-char alphanumeric join code (no ambiguous chars). */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I,O,0,1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Ensure the generated code doesn't collide with an active session. */
async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    const q = query(collection(db, 'sessions'), where('code', '==', code));
    const snap = await getDocs(q);
    if (snap.empty) return code;
  }
  // Extremely unlikely fallback — append a timestamp suffix.
  return generateJoinCode() + Date.now().toString(36).slice(-2).toUpperCase();
}

/* --------------------------------------------------------
 * Session lifecycle
 * -------------------------------------------------------- */

export interface CreateSessionInput {
  hostUid: string;
  hostDisplayName: string;
  hostNickname?: string | null;
  maxPlayers: number; // 2–7
  startingLife?: number;
  matchMode?: MatchMode;
}

export async function createSession(input: CreateSessionInput): Promise<string> {
  const maxPlayers = Math.min(7, Math.max(2, input.maxPlayers));
  const startingLife = input.startingLife ?? DEFAULT_STARTING_LIFE;
  const matchMode = input.matchMode ?? 'normal';
  const code = await generateUniqueCode();

  const sessionRef = doc(collection(db, 'sessions'));
  const sessionId = sessionRef.id;

  const session: Omit<Session, 'createdAt'> = {
    id: sessionId,
    code,
    hostUid: input.hostUid,
    maxPlayers,
    status: 'lobby',
    matchMode,
    turnOrder: [],
    currentTurnIndex: 0,
    startingLife,
  };

  await setDoc(sessionRef, { ...session, createdAt: serverTimestamp() });

  // Host auto-joins as first player.
  await joinSession(sessionId, {
    uid: input.hostUid,
    displayName: input.hostDisplayName,
    nickname: input.hostNickname,
    isHost: true,
    startingLife,
  });

  await addEvent(sessionId, {
    type: 'player_joined',
    uid: input.hostUid,
    message: `${input.hostNickname || input.hostDisplayName} created the game.`,
  });

  return sessionId;
}

export interface JoinSessionInput {
  uid: string;
  displayName: string;
  nickname?: string | null;
  isHost?: boolean;
  startingLife?: number;
  commander?: CommanderInfo | null;
  decklist?: Decklist | null;
  deckName?: string | null;
  deckSourceUrl?: string | null;
}

export async function joinSession(sessionId: string, input: JoinSessionInput): Promise<void> {
  const startingLife = input.startingLife ?? DEFAULT_STARTING_LIFE;
  const player: SessionPlayer = {
    uid: input.uid,
    displayName: input.displayName,
    nickname: input.nickname ?? null,
    isHost: input.isHost ?? false,
    isReady: false,
    joinedAt: null,
    commander: input.commander ?? null,
    decklist: input.decklist ?? null,
    deckName: input.deckName ?? null,
    deckSourceUrl: input.deckSourceUrl ?? null,
    diceRoll: null,
    health: startingLife,
    poison: 0,
    customCounters: {},
    placement: null,
    eliminated: false,
    eliminatedAt: null,
  };

  await setDoc(doc(db, 'sessions', sessionId, 'players', input.uid), {
    ...player,
    joinedAt: serverTimestamp(),
  });

  if (!input.isHost) {
    await addEvent(sessionId, {
      type: 'player_joined',
      uid: input.uid,
      message: `${input.nickname || input.displayName} joined the game.`,
    });
  }
}

export async function leaveSession(sessionId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), {
    eliminated: true,
    placement: 99, // Mark as left/forfeit
  });
  await addEvent(sessionId, {
    type: 'player_left',
    uid,
    message: `A player left the game.`,
  });
}

/**
 * Transfer host privileges to another player in the session.
 * The current host calls this. Updates the session's hostUid and
 * flips the isHost flags on both player docs.
 */
export async function transferHost(sessionId: string, newHostUid: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Session not found');
  const oldHostUid = session.hostUid;

  await updateDoc(doc(db, 'sessions', sessionId), { hostUid: newHostUid });

  // Update isHost flags on both players.
  await updateDoc(doc(db, 'sessions', sessionId, 'players', oldHostUid), { isHost: false });
  await updateDoc(doc(db, 'sessions', sessionId, 'players', newHostUid), { isHost: true });

  await addEvent(sessionId, {
    type: 'player_joined',
    uid: newHostUid,
    message: `Host privileges were transferred.`,
  });
}

/* --------------------------------------------------------
 * Session queries
 * -------------------------------------------------------- */

/** Find a session by its 6-char join code. */
export async function getSessionByCode(code: string): Promise<Session | null> {
  const q = query(collection(db, 'sessions'), where('code', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as Session;
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const snap = await getDoc(doc(db, 'sessions', sessionId));
  if (!snap.exists()) return null;
  return snap.data() as Session;
}

export async function getSessionPlayers(sessionId: string): Promise<SessionPlayer[]> {
  const snap = await getDocs(collection(db, 'sessions', sessionId, 'players'));
  return snap.docs.map((d) => d.data() as SessionPlayer);
}

/**
 * Find all active (non-completed) sessions the user is currently in.
 * Uses a collection group query on the 'players' subcollection to find
 * session IDs, then fetches the full session docs.
 *
 * Returns sessions sorted by most recently created first.
 */
export async function getActiveSessions(uid: string): Promise<Session[]> {
  // Collection group: find all player docs belonging to this user.
  const playerQuery = query(collectionGroup(db, 'players'), where('uid', '==', uid));
  const playerSnap = await getDocs(playerQuery);

  if (playerSnap.empty) return [];

  // Extract session IDs from the paths: sessions/{sessionId}/players/{uid}
  const sessionIds = playerSnap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean) as string[];

  // Fetch each session doc in parallel.
  const sessionSnaps = await Promise.all(
    sessionIds.map((id) => getDoc(doc(db, 'sessions', id))),
  );

  // Filter to active sessions only (lobby or in_progress).
  return sessionSnaps
    .filter((snap) => snap.exists())
    .map((snap) => ({ ...snap.data(), id: snap.id }) as Session)
    .filter((s) => s.status === 'lobby' || s.status === 'in_progress')
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime; // newest first
    });
}

/* --------------------------------------------------------
 * Player setup (commander, decklist, ready)
 * -------------------------------------------------------- */

export async function setPlayerCommander(
  sessionId: string,
  uid: string,
  commander: CommanderInfo | null,
): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), { commander });
}

export async function setPlayerDecklist(
  sessionId: string,
  uid: string,
  decklist: Decklist | null,
  deckName: string | null = null,
  deckSourceUrl: string | null = null,
  bracket: number | null = null,
): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), {
    decklist,
    deckName,
    deckSourceUrl,
    bracket,
  });
}

/** Update only the player's deck bracket/power level. */
export async function setPlayerBracket(
  sessionId: string,
  uid: string,
  bracket: number | null,
): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), { bracket });
}

export async function setPlayerReady(
  sessionId: string,
  uid: string,
  ready: boolean,
): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), { isReady: ready });
  await addEvent(sessionId, {
    type: 'player_ready',
    uid,
    message: `Player ${ready ? 'is ready' : 'is not ready'}.`,
  });
}

export async function updatePlayerNickname(
  sessionId: string,
  uid: string,
  nickname: string,
): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), { nickname });
}

/* --------------------------------------------------------
 * Dice roll & turn order
 * -------------------------------------------------------- */

export async function rollDice(sessionId: string, uid: string): Promise<number> {
  const roll = Math.floor(Math.random() * 20) + 1; // D20: 1–20
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), {
    diceRoll: roll,
    nudgesUsed: 0,
  });
  await addEvent(sessionId, {
    type: 'dice_rolled',
    uid,
    message: `rolled a ${roll}.`,
  });
  return roll;
}

/**
 * "Nudge" reroll — allows a player to re-roll their D20 up to MAX_NUDGES times.
 * Increments the nudgesUsed counter and writes a new random roll.
 */
export const MAX_NUDGES = 3;

export async function nudgeDice(sessionId: string, uid: string): Promise<number> {
  const roll = Math.floor(Math.random() * 20) + 1;
  const playerSnap = await getDoc(doc(db, 'sessions', sessionId, 'players', uid));
  if (!playerSnap.exists()) throw new Error('Player not found');
  const current = (playerSnap.data() as SessionPlayer).nudgesUsed ?? 0;
  if (current >= MAX_NUDGES) throw new Error('No nudges remaining');

  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), {
    diceRoll: roll,
    nudgesUsed: current + 1,
  });
  await addEvent(sessionId, {
    type: 'dice_rolled',
    uid,
    message: `nudged and rolled a ${roll}.`,
  });
  return roll;
}

/**
 * Clear a single player's dice roll. Called by each client when the host
 * increments the session-level diceResetCount signal.
 */
export async function clearMyDiceRoll(sessionId: string, uid: string): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), {
    diceRoll: null,
    nudgesUsed: 0,
  });
}

/**
 * Reset all dice rolls by incrementing a counter on the session doc.
 * Each client watches this counter via real-time subscription and
 * clears its own diceRoll when it changes (see LobbyPage).
 *
 * This approach only requires the host's session-doc update permission
 * (which is always allowed), avoiding permission-denied errors that
 * occur when the host tries to write other players' docs directly.
 */
export async function resetDiceRolls(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) throw new Error('Session not found');

  // Increment the reset counter — clients react to this.
  await updateDoc(doc(db, 'sessions', sessionId), {
    diceResetCount: (session.diceResetCount ?? 0) + 1,
  });

  // Also clear the host's own roll immediately (they have permission).
  const hostUid = session.hostUid;
  await updateDoc(doc(db, 'sessions', sessionId, 'players', hostUid), {
    diceRoll: null,
    nudgesUsed: 0,
  });

  await addEvent(sessionId, {
    type: 'dice_rolled',
    message: 'Host reset all dice rolls.',
  });
}

/**
 * Compute turn order from current dice rolls.
 * Sort: highest roll first; ties broken alphabetically by display name.
 */
export function computeTurnOrder(players: SessionPlayer[]): string[] {
  return [...players]
    .filter((p) => p.diceRoll != null)
    .sort((a, b) => {
      const rollDiff = (b.diceRoll ?? 0) - (a.diceRoll ?? 0);
      if (rollDiff !== 0) return rollDiff;
      return getDisplayName(a).localeCompare(getDisplayName(b));
    })
    .map((p) => p.uid);
}

export async function finalizeTurnOrder(sessionId: string): Promise<void> {
  const players = await getSessionPlayers(sessionId);
  const order = computeTurnOrder(players);
  await updateDoc(doc(db, 'sessions', sessionId), {
    turnOrder: order,
    currentTurnIndex: 0,
  });
}

/* --------------------------------------------------------
 * Game start / in-match state
 * -------------------------------------------------------- */

export async function startGame(sessionId: string): Promise<void> {
  const players = await getSessionPlayers(sessionId);
  const session = await getSession(sessionId);
  if (!session) throw new Error('Session not found');

  // If turn order hasn't been computed yet, compute it now.
  let turnOrder = session.turnOrder;
  if (turnOrder.length === 0) {
    turnOrder = computeTurnOrder(players);
  }

  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'in_progress',
    turnOrder,
    currentTurnIndex: 0,
    startedAt: serverTimestamp(),
  });
  await addEvent(sessionId, {
    type: 'game_started',
    message: 'The game has begun!',
  });
}

/** Advance to the next turn. */
export async function advanceTurn(sessionId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session || session.turnOrder.length === 0) return;
  const next = (session.currentTurnIndex + 1) % session.turnOrder.length;
  await updateDoc(doc(db, 'sessions', sessionId), { currentTurnIndex: next });
}

/* --------------------------------------------------------
 * Health, poison, commander damage
 * -------------------------------------------------------- */

export async function setPlayerHealth(
  sessionId: string,
  uid: string,
  health: number,
): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), { health });
  if (health <= 0) {
    await eliminatePlayer(sessionId, uid);
  }
}

export async function adjustPlayerHealth(
  sessionId: string,
  uid: string,
  delta: number,
): Promise<void> {
  const players = await getSessionPlayers(sessionId);
  const player = players.find((p) => p.uid === uid);
  if (!player) return;
  const newHealth = Math.max(0, player.health + delta);
  await setPlayerHealth(sessionId, uid, newHealth);
}

export async function setPlayerPoison(
  sessionId: string,
  uid: string,
  poison: number,
): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), { poison });
  if (poison >= 10) {
    await eliminatePlayer(sessionId, uid);
  }
}

export async function adjustPlayerPoison(
  sessionId: string,
  uid: string,
  delta: number,
): Promise<void> {
  const players = await getSessionPlayers(sessionId);
  const player = players.find((p) => p.uid === uid);
  if (!player) return;
  const newPoison = Math.max(0, player.poison + delta);
  await setPlayerPoison(sessionId, uid, newPoison);
}

export async function setCommanderDamage(
  sessionId: string,
  targetUid: string,
  sourceUid: string,
  damage: number,
): Promise<void> {
  const ref = doc(db, 'sessions', sessionId, 'commanderDamage', `${targetUid}_${sourceUid}`);
  await setDoc(ref, { targetUid, sourceUid, damage }, { merge: true });
  // 21 commander damage = elimination.
  if (damage >= 21) {
    await eliminatePlayer(sessionId, targetUid);
  }
}

export async function adjustCommanderDamage(
  sessionId: string,
  targetUid: string,
  sourceUid: string,
  delta: number,
): Promise<void> {
  const ref = doc(db, 'sessions', sessionId, 'commanderDamage', `${targetUid}_${sourceUid}`);
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data() as { damage: number }).damage : 0;
  const next = Math.max(0, current + delta);
  await setCommanderDamage(sessionId, targetUid, sourceUid, next);
}

export async function getCommanderDamageMap(sessionId: string): Promise<CommanderDamageMap> {
  const snap = await getDocs(collection(db, 'sessions', sessionId, 'commanderDamage'));
  const map: CommanderDamageMap = {};
  snap.docs.forEach((d) => {
    const rec = d.data() as { targetUid: string; sourceUid: string; damage: number };
    if (!map[rec.targetUid]) map[rec.targetUid] = {};
    map[rec.targetUid][rec.sourceUid] = rec.damage;
  });
  return map;
}

export async function eliminatePlayer(sessionId: string, uid: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  const players = await getSessionPlayers(sessionId);
  const activePlayers = players.filter((p) => !p.eliminated);
  // Placement = number of remaining active players (last to be eliminated = 2nd place, etc.)
  const placement = activePlayers.length;

  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), {
    eliminated: true,
    eliminatedAt: serverTimestamp(),
    placement,
  });
  await addEvent(sessionId, {
    type: 'player_eliminated',
    uid,
    message: `A player has been eliminated (placed ${placement}).`,
  });

  // If only one player remains, end the game.
  const remaining = activePlayers.filter((p) => p.uid !== uid);
  if (remaining.length <= 1 && session.status === 'in_progress') {
    if (remaining.length === 1) {
      await updateDoc(doc(db, 'sessions', sessionId, 'players', remaining[0].uid), {
        placement: 1,
      });
    }
    await endGame(sessionId);
  }
}

/* --------------------------------------------------------
 * End game & record history
 * -------------------------------------------------------- */

export async function endGame(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'sessions', sessionId), {
    status: 'completed',
    endedAt: serverTimestamp(),
  });
  await addEvent(sessionId, {
    type: 'game_ended',
    message: 'The game has ended.',
  });
}

/**
 * Revive a previously eliminated player (undo elimination).
 * Clears eliminated flag and placement. Does NOT restart an ended game —
 * if the game is already 'completed', the host should use a different flow.
 */
export async function revivePlayer(sessionId: string, uid: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  // If game is already over, we need to flip it back to in_progress.
  if (session.status === 'completed') {
    await updateDoc(doc(db, 'sessions', sessionId), {
      status: 'in_progress',
      endedAt: null,
    });
  }
  await updateDoc(doc(db, 'sessions', sessionId, 'players', uid), {
    eliminated: false,
    eliminatedAt: null,
    placement: null,
  });
  await addEvent(sessionId, {
    type: 'player_joined',
    uid,
    message: `A player was revived.`,
  });
}

/* --------------------------------------------------------
 * Events (audit log / OBS feed)
 * -------------------------------------------------------- */

export async function addEvent(
  sessionId: string,
  event: Omit<SessionEvent, 'id' | 'timestamp'>,
): Promise<void> {
  await addDoc(collection(db, 'sessions', sessionId, 'events'), {
    ...event,
    timestamp: serverTimestamp(),
  });
}

/* --------------------------------------------------------
 * Real-time subscriptions (the magic of Firestore)
 * -------------------------------------------------------- */

export function subscribeToSession(sessionId: string, cb: (s: Session | null) => void): Unsubscribe {
  return onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
    cb(snap.exists() ? (snap.data() as Session) : null);
  });
}

export function subscribeToPlayers(
  sessionId: string,
  cb: (players: SessionPlayer[]) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'sessions', sessionId, 'players'), (snap) => {
    cb(snap.docs.map((d) => d.data() as SessionPlayer));
  });
}

export function subscribeToCommanderDamage(
  sessionId: string,
  cb: (map: CommanderDamageMap) => void,
): Unsubscribe {
  return onSnapshot(collection(db, 'sessions', sessionId, 'commanderDamage'), (snap) => {
    const map: CommanderDamageMap = {};
    snap.docs.forEach((d) => {
      const rec = d.data() as { targetUid: string; sourceUid: string; damage: number };
      if (!map[rec.targetUid]) map[rec.targetUid] = {};
      map[rec.targetUid][rec.sourceUid] = rec.damage;
    });
    cb(map);
  });
}

export function subscribeToEvents(
  sessionId: string,
  cb: (events: SessionEvent[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'sessions', sessionId, 'events'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SessionEvent, 'id'>) })));
  });
}