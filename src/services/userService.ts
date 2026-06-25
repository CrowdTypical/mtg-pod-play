import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  type Unsubscribe,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '@/config/firebase';
import type { MatchHistoryEntry, SessionPlayer, DeckSummary } from '@/types';

/* --------------------------------------------------------
 * Match history
 * -------------------------------------------------------- */

/** Record a completed match to a player's profile. */
export async function recordMatchToProfile(
  uid: string,
  player: SessionPlayer,
  sessionId: string,
  playerCount: number,
): Promise<void> {
  const entry: Omit<MatchHistoryEntry, 'date'> = {
    matchId: sessionId,
    sessionId,
    placement: player.placement ?? null,
    playerCount,
    commanderName: player.commander?.name ?? 'Unknown',
    commanderId: player.commander?.scryfallId ?? null,
    deckName: null,
  };
  await addDoc(collection(db, 'users', uid, 'matchHistory'), {
    ...entry,
    date: serverTimestamp(),
  });

  // Also record/update the deck played.
  if (player.decklist && player.decklist.length > 0 && player.commander) {
    await upsertDeckHistory(uid, {
      name: player.commander.name + ' Deck',
      commanderName: player.commander.name,
      commanderId: player.commander.scryfallId,
      cardCount: player.decklist.reduce((sum, e) => sum + e.count, 0),
      entries: player.decklist.map((e) => ({ count: e.count, name: e.name })),
      gamesPlayed: 1,
    });
  }
}

export function subscribeToMatchHistory(
  uid: string,
  cb: (history: MatchHistoryEntry[]) => void,
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'matchHistory'));
  return onSnapshot(q, (snap) => {
    const entries = snap.docs.map((d) => d.data() as MatchHistoryEntry);
    // Sort by date descending (most recent first).
    entries.sort((a, b) => {
      const aTime = a.date?.toMillis?.() ?? 0;
      const bTime = b.date?.toMillis?.() ?? 0;
      return bTime - aTime;
    });
    cb(entries);
  });
}

export async function getMatchHistory(uid: string): Promise<MatchHistoryEntry[]> {
  const snap = await getDocs(query(collection(db, 'users', uid, 'matchHistory')));
  return snap.docs.map((d) => d.data() as MatchHistoryEntry);
}

/* --------------------------------------------------------
 * Decks history
 * -------------------------------------------------------- */

/**
 * Add or update a deck in the user's history.
 * Deduplicates by commander name; increments gamesPlayed.
 */
export async function upsertDeckHistory(uid: string, deck: Omit<DeckSummary, 'id'>): Promise<void> {
  const existing = await getDocs(query(collection(db, 'users', uid, 'decks')));
  const match = existing.docs.find(
    (d) => (d.data() as DeckSummary).commanderName === deck.commanderName,
  );

  if (match) {
    const existingDeck = match.data() as DeckSummary;
    await updateDoc(doc(db, 'users', uid, 'decks', match.id), {
      entries: deck.entries,
      cardCount: deck.cardCount,
      gamesPlayed: (existingDeck.gamesPlayed ?? 0) + 1,
      lastPlayed: serverTimestamp(),
    });
  } else {
    await addDoc(collection(db, 'users', uid, 'decks'), {
      ...deck,
      firstPlayed: serverTimestamp(),
      lastPlayed: serverTimestamp(),
    });
  }
}

export function subscribeToDecks(uid: string, cb: (decks: DeckSummary[]) => void): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'decks'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DeckSummary, 'id'>) })));
  });
}

export async function getDeck(uid: string, deckId: string): Promise<DeckSummary | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'decks', deckId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<DeckSummary, 'id'>) };
}