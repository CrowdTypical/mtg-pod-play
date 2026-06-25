import type { Timestamp } from 'firebase/firestore';

/* ============================================================
 * USER & PROFILE
 * ============================================================ */

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  nickname: string | null; // Optional; falls back to displayName. null for Firestore.
  createdAt: Timestamp | null;

  // Aggregate stats (computed from matchHistory subcollection)
  gamesPlayed?: number;
  wins?: number;
  avgPlacement?: number | null;
}

/** The name shown in lobbies — nickname if set, else displayName. */
export function displayName(
  user: Pick<UserProfile, 'displayName' | 'nickname'>,
): string {
  return user.nickname?.trim() || user.displayName;
}

/* ============================================================
 * SCRYFALL / CARDS
 * ============================================================ */

export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  type_line: string;
  oracle_text?: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    png: string;
  };
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity?: string[];
  cmc: number;
  // For double-faced / modal cards, card_faces contains the per-face data.
  card_faces?: Array<Omit<ScryfallCard, 'card_faces'>>;
  scryfall_uri?: string;
}

export interface CommanderInfo {
  scryfallId: string;
  name: string;
  manaCost?: string;
  typeLine: string;
  imageUris?: {
    small: string;
    normal: string;
    large: string;
  };
  colors: string[];
  partner?: boolean; // For partner commanders
}

/** A single entry in a decklist. */
export interface DecklistEntry {
  count: number;
  name: string;
  scryfallId?: string;
  imageUrl?: string;
  isCommander?: boolean;
}

export type Decklist = DecklistEntry[];

export interface DeckSummary {
  id?: string;
  name: string;
  commanderName: string;
  commanderId?: string;
  cardCount: number;
  // Stored as a lightweight list of {count, name} for history.
  entries: DecklistEntry[];
  firstPlayed?: Timestamp | null;
  lastPlayed?: Timestamp | null;
  gamesPlayed: number;
}

/* ============================================================
 * SESSIONS (GAME LOBBY + MATCH)
 * ============================================================ */

export type SessionStatus = 'lobby' | 'in_progress' | 'completed';

export interface SessionPlayer {
  uid: string;
  displayName: string;
  nickname: string | null; // null for Firestore compatibility
  isHost: boolean;
  isReady: boolean;
  joinedAt: Timestamp | null;

  // Pre-game setup
  commander?: CommanderInfo | null;
  decklist?: Decklist | null;
  deckName?: string | null;
  deckSourceUrl?: string | null;

  // Dice roll for turn order
  diceRoll?: number | null;

  // In-match state
  health: number;
  poison: number;
  // Counters beyond the defaults (energy, experience, etc.)
  customCounters?: Record<string, number>;

  // Match result
  placement?: number | null; // 1 = winner
  eliminated?: boolean;
  eliminatedAt?: Timestamp | null;
}

export interface CommanderDamageRecord {
  // The player TAKING the damage.
  targetUid: string;
  // The commander dealing the damage (by player UID).
  sourceUid: string;
  damage: number;
}

export type CommanderDamageMap = Record<string, Record<string, number>>;
// Outer key: targetUid. Inner key: sourceUid. Value: damage total.

export interface SessionEvent {
  id?: string;
  type:
    | 'player_joined'
    | 'player_left'
    | 'player_ready'
    | 'dice_rolled'
    | 'game_started'
    | 'damage_dealt'
    | 'player_eliminated'
    | 'health_changed'
    | 'poison_changed'
    | 'game_ended';
  uid?: string;
  message: string;
  timestamp: Timestamp | null;
}

export interface Session {
  id?: string;
  code: string; // Human-readable join code, e.g. "AB12CD"
  hostUid: string;
  maxPlayers: number;
  status: SessionStatus;
  turnOrder: string[]; // Array of UIDs in turn order
  currentTurnIndex: number;
  startingLife: number;
  createdAt: Timestamp | null;
  startedAt?: Timestamp | null;
  endedAt?: Timestamp | null;
  /** Incremented by host to signal all players should clear their diceRoll.
   *  Clients watch this counter and reset locally when it changes. */
  diceResetCount?: number;
}

/* ============================================================
 * MATCH HISTORY (user profile subcollection)
 * ============================================================ */

export interface MatchHistoryEntry {
  matchId: string;
  sessionId: string;
  placement: number | null;
  playerCount: number;
  commanderName: string;
  commanderId: string | null;
  date: Timestamp | null;
  deckName: string | null;
}
