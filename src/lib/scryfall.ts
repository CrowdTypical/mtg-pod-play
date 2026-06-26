import type { CommanderInfo, Decklist, DecklistEntry, ScryfallCard, ScryfallRuling } from '@/types';

/**
 * Scryfall API client.
 * Docs: https://scryfall.com/docs/api
 * No API key required. Rate limit: ~10 requests/second — be courteous.
 */

const SCRYFALL_BASE = 'https://api.scryfall.com';

/** Small delay helper to respect Scryfall's 50-100ms requested delay. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scryfallFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${SCRYFALL_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { details?: string }).details || res.statusText;
    throw new Error(`Scryfall API error (${res.status}): ${msg}`);
  }
  return res.json() as Promise<T>;
}

/* --------------------------------------------------------
 * Commander search
 * -------------------------------------------------------- */

export async function searchCommanders(query: string): Promise<CommanderInfo[]> {
  if (!query.trim()) return [];
  // is:commander covers Legendary Creatures with legal commander types,
  // plus the backgrounds, backgrounds-companions, etc. This is the most
  // reliable single filter for the format.
  const q = encodeURIComponent(`${query} (is:commander)`);
  const data = await scryfallFetch<ScryfallSearchResponse>(
    `/cards/search?q=${q}&order=name&unique=cards`,
  );
  return data.data.map(cardToCommander).filter((c): c is CommanderInfo => c !== null);
}

interface ScryfallSearchResponse {
  data: ScryfallCard[];
  has_more: boolean;
}

function cardToCommander(card: ScryfallCard): CommanderInfo | null {
  const img = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  if (!card.type_line) return null;
  return {
    scryfallId: card.id,
    name: card.name,
    manaCost: card.mana_cost ?? card.card_faces?.[0]?.mana_cost,
    typeLine: card.type_line,
    imageUris: img
      ? {
          small: img.small,
          normal: img.normal,
          large: img.large,
        }
      : undefined,
    colors: card.color_identity ?? [],
    partner: (card.oracle_text ?? '').toLowerCase().includes('partner'),
  };
}

/* --------------------------------------------------------
 * Single card by name (used for decklist resolution)
 * -------------------------------------------------------- */

export async function getCardByName(name: string): Promise<ScryfallCard | null> {
  const q = encodeURIComponent(`!"${name}"`);
  try {
    const data = await scryfallFetch<ScryfallCard>(`/cards/named?fuzzy=${q}`);
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch full details for a single card by its Scryfall ID.
 * Used by the card-focus modal to show all card info (oracle text,
 * prices, legalities, etc.).
 */
export async function getCardById(scryfallId: string): Promise<ScryfallCard | null> {
  try {
    return await scryfallFetch<ScryfallCard>(`/cards/${scryfallId}`);
  } catch {
    return null;
  }
}

/**
 * Fetch all prints (different art editions) of a card by its Scryfall ID.
 * Used by the commander picker to let users choose their preferred art.
 * Returns the full ScryfallCard objects so we can grab image URIs + set info.
 */
export async function getCardPrints(scryfallId: string): Promise<ScryfallCard[]> {
  try {
    const data = await scryfallFetch<ScryfallSearchResponse>(
      `/cards/${scryfallId}/prints`,
    );
    return data.data;
  } catch {
    return [];
  }
}

/**
 * Fetch official rulings (notes/rules clarifications) for a card.
 * Returns objects with a `comment` field containing the ruling text.
 */
export async function getCardRulings(scryfallId: string): Promise<ScryfallRuling[]> {
  try {
    const data = await scryfallFetch<{ data: ScryfallRuling[] }>(
      `/cards/${scryfallId}/rulings`,
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

/** Bulk-resolve card names to images using Scryfall's /cards/collection endpoint. */
export async function resolveCardCollection(
  entries: { name: string }[],
): Promise<Map<string, ScryfallCard>> {
  const result = new Map<string, ScryfallCard>();
  // Scryfall's collection endpoint accepts up to 75 identifiers per request.
  const CHUNK_SIZE = 75;
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    const identifiers = chunk.map((e) => ({ name: e.name }));
    try {
      const res = await fetch(`${SCRYFALL_BASE}/cards/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers }),
      });
      const data = (await res.json()) as { data?: ScryfallCard[]; not_found?: { name: string }[] };
      data.data?.forEach((card) => result.set(card.name.toLowerCase(), card));
    } catch {
      // Network/parse error on a chunk — skip it, caller handles missing images.
    }
    if (i + CHUNK_SIZE < entries.length) await delay(100);
  }
  return result;
}

/* --------------------------------------------------------
 * Decklist parsing (paste-in format)
 * -------------------------------------------------------- */

/**
 * Parse a pasted decklist into structured entries.
 * Supports common formats:
 *   "4 Lightning Bolt"
 *   "4x Lightning Bolt"
 *   "Lightning Bolt"
 *   "// Sideboard" (comments ignored)
 */
export function parseDecklistText(text: string): Decklist {
  const lines = text.split(/\r?\n/);
  const entries: Decklist = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('//') || line.startsWith('#')) continue; // comment
    // Section headers like "Sideboard:" — we keep them as comments (skip).
    if (/^(sideboard|commander|main|deck|maybeboard)\b:?/i.test(line)) continue;

    // Match optional count prefix.
    const match = line.match(/^(?:(\d+)\s*[xX]?\s+)?(.+)$/);
    if (!match) continue;
    const count = match[1] ? parseInt(match[1], 10) : 1;
    let name = match[2].trim();
    // Strip trailing set code, e.g. "Lightning Bolt (XLN) 149".
    name = name.replace(/\s*\([A-Z0-9]{3,4}\)\s*\d*$/, '').trim();

    if (name) {
      entries.push({ count, name });
    }
  }
  return entries;
}

/**
 * Given a parsed decklist (names only), resolve images & scryfall IDs.
 * Mutates a copy with imageUrl/scryfallId populated.
 */
export async function enrichDecklist(entries: DecklistEntry[]): Promise<DecklistEntry[]> {
  // De-duplicate names for the collection lookup.
  const uniqueNames = Array.from(new Set(entries.map((e) => e.name)));
  const cardMap = await resolveCardCollection(uniqueNames.map((n) => ({ name: n })));

  return entries.map((entry) => {
    const card = cardMap.get(entry.name.toLowerCase());
    if (!card) return entry;
    const img = card.image_uris ?? card.card_faces?.[0]?.image_uris;
    return {
      ...entry,
      scryfallId: card.id,
      imageUrl: img?.normal ?? img?.small,
    };
  });
}

/* --------------------------------------------------------
 * Commander extraction from decklist
 * -------------------------------------------------------- */

/**
 * Build a CommanderInfo from a decklist entry by fetching full card data
 * from Scryfall. Returns null if the card can't be found.
 *
 * Used to auto-sync a player's commander from an imported decklist.
 */
export async function getCommanderFromEntry(
  entry: DecklistEntry,
): Promise<CommanderInfo | null> {
  if (!entry.scryfallId && !entry.name) return null;
  const card = entry.scryfallId
    ? await getCardById(entry.scryfallId)
    : await getCardByName(entry.name);
  if (!card) return null;
  return cardToCommander(card);
}


/** Result of importing a deck from an external source. */
export interface DeckImportResult {
  decklist: Decklist;
  name: string | null;
  sourceUrl: string | null;
  /** Deck power level (1–5) / bracket, if the source provides it. */
  bracket?: number | null;
  /** The commander entry found in the decklist, if any. */
  commander?: DecklistEntry | null;
}

/**
 * Fetch a decklist from an Archidekt deck URL.
 * Archidekt provides a public JSON API: https://archidekt.com/api/decks/{id}/
 * The deck ID is the numeric portion of the URL.
 *
 * Uses a serverless proxy (/api/archidekt-proxy) to avoid CORS issues.
 * The path is passed as a query parameter: ?path=decks/{id}/
 */
export async function importFromArchidekt(url: string): Promise<DeckImportResult> {
  const idMatch = url.match(/archidekt\.com\/decks\/(\d+)/);
  if (!idMatch) throw new Error('Invalid Archidekt URL. Expected archidekt.com/decks/{id}');
  const deckId = idMatch[1];

  const apiUrl = `/api/archidekt-proxy?path=decks/${deckId}/`;
  let res: Response;
  try {
    res = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new Error(
      'Network error contacting Archidekt proxy. The service may be down.',
    );
  }
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Archidekt deck (${res.status}). Check that the deck is public.`,
    );
  }
  const data = (await res.json()) as ArchidektDeck;

  const entries: Decklist = [];
  for (const cardEntry of data.cards) {
    // The 'categories' array tells us which board the card is in.
    // e.g. ["Creature"], ["Commander"], ["Maybeboard"], ["Sideboard"]
    const cats = cardEntry.categories ?? [];
    const catLower = cats.map((c) => c.toLowerCase());

    // Skip sideboard and maybeboard cards.
    if (catLower.includes('maybeboard') || catLower.includes('sideboard')) continue;

    const isCommander = catLower.includes('commander');
    const card = cardEntry.card;

    entries.push({
      count: cardEntry.quantity,
      name: card.oracleCard?.name ?? card.name,
      scryfallId: card.uid,
      isCommander,
    });
  }
  if (entries.length === 0) {
    throw new Error('No cards found. Is the deck public?');
  }

  // Extract the commander entry (first card flagged as commander).
  const commanderEntry = entries.find((e) => e.isCommander) ?? null;

  // Archidekt exposes a deck-level `powerLevel` (1–5, optional).
  // Clamp to a sane range; null if missing/invalid.
  const rawPower = typeof data.powerLevel === 'number' ? data.powerLevel : null;
  const bracket =
    rawPower !== null && rawPower >= 1 && rawPower <= 5 ? Math.round(rawPower) : null;

  return {
    decklist: entries,
    name: data.name ?? null,
    sourceUrl: `https://archidekt.com/decks/${deckId}`,
    bracket,
    commander: commanderEntry,
  };
}

interface ArchidektDeck {
  name?: string;
  /** Deck power level (1–5), optional on Archidekt. */
  powerLevel?: number;
  cards: Array<{
    quantity: number;
    categories: string[];
    card: {
      name: string;
      uid: string;
      oracleCard?: {
        name: string;
        manaCost?: string;
        cmc?: number;
        type?: string;
        text?: string;
      };
    };
  }>;
}
