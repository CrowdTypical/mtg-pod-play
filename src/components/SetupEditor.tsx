import { useEffect, useState } from 'react';

import {
  setPlayerCommander,
  setPlayerDecklist,
} from '@/services/sessionService';
import {
  enrichDecklist,
  importFromArchidekt,
  parseDecklistText,
  searchCommanders,
} from '@/lib/scryfall';
import type { CommanderInfo, SessionPlayer } from '@/types';
import CommanderDetailModal from './CommanderDetailModal';

/**
 * A compact setup editor for the playboard — lets a player set or change
 * their commander and decklist after the game has started.
 * Rendered inside a modal overlay.
 */
export default function SetupEditor({
  sessionId,
  player,
  onClose,
}: {
  sessionId: string;
  player: SessionPlayer;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content setup-editor-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div className="flex justify-between items-center mb-md">
          <h3 style={{ margin: 0 }}>Edit Your Setup</h3>
          <button onClick={onClose} className="btn btn-outline btn-sm">✕</button>
        </div>

        <CommanderSection sessionId={sessionId} player={player} />
        <DecklistSection sessionId={sessionId} player={player} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CommanderSection({
  sessionId,
  player,
}: {
  sessionId: string;
  player: SessionPlayer;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommanderInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<CommanderInfo | null>(null);
  const uid = player.uid;

  useEffect(() => {
    if (!query.trim() || player.commander) {
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
  }, [query, player.commander]);

  async function handleSelect(c: CommanderInfo) {
    await setPlayerCommander(sessionId, uid, c);
    setQuery('');
    setResults([]);
    setPreview(null);
  }

  async function handleClear() {
    await setPlayerCommander(sessionId, uid, null);
  }

  return (
    <div className="form-group">
      <label className="form-label">Commander</label>
      {player.commander ? (
        <div className="flex items-center gap-md">
          {player.commander.imageUris?.small && (
            <img
              src={player.commander.imageUris.small}
              alt={player.commander.name}
              style={{ width: 48, height: 67, borderRadius: 4 }}
            />
          )}
          <div className="flex-1">
            <p style={{ fontWeight: 600 }}>{player.commander.name}</p>
            <p className="text-muted" style={{ fontSize: '0.8rem' }}>
              {player.commander.typeLine}
            </p>
          </div>
          <button onClick={handleClear} className="btn btn-outline btn-sm">Change</button>
        </div>
      ) : (
        <div>
          <input
            type="text"
            className="form-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for commander…"
          />
          {searching && <p className="form-hint">Searching…</p>}
          {!searching && query && results.length === 0 && (
            <p className="form-hint">No commanders found.</p>
          )}
          {results.length > 0 && (
            <div className="commander-results-grid" style={{ marginTop: '0.5rem' }}>
              {results.map((c) => (
                <button
                  key={c.scryfallId}
                  onClick={() => setPreview(c)}
                  className="commander-grid-item"
                >
                  {c.imageUris?.small ? (
                    <img src={c.imageUris.small} alt={c.name} />
                  ) : (
                    <div className="commander-grid-no-img">{c.name}</div>
                  )}
                  <div className="commander-grid-name">
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {preview && (
        <CommanderDetailModal
          commander={preview}
          onClose={() => setPreview(null)}
          onChoose={handleSelect}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DecklistSection({
  sessionId,
  player,
}: {
  sessionId: string;
  player: SessionPlayer;
}) {
  const uid = player.uid;
  const [showImport, setShowImport] = useState(!player.decklist || player.decklist.length === 0);
  const [manualMode, setManualMode] = useState(false);
  const [decklistText, setDecklistText] = useState('');
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  async function handleImportUrl() {
    if (!url.trim()) return;
    setImporting(true);
    setError('');
    try {
      const imported = await importFromArchidekt(url);
      const enriched = await enrichDecklist(imported.decklist);
      await setPlayerDecklist(sessionId, uid, enriched, imported.name, imported.sourceUrl);
      setShowImport(false);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import.');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportText() {
    if (!decklistText.trim()) return;
    setImporting(true);
    setError('');
    try {
      const parsed = parseDecklistText(decklistText);
      if (parsed.length === 0) {
        setError('No cards found. Check format.');
        return;
      }
      const enriched = await enrichDecklist(parsed);
      await setPlayerDecklist(sessionId, uid, enriched, null, null);
      setShowImport(false);
      setDecklistText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import.');
    } finally {
      setImporting(false);
    }
  }

  async function handleClear() {
    await setPlayerDecklist(sessionId, uid, null, null, null);
    setShowImport(true);
  }

  return (
    <div className="form-group">
      <label className="form-label">Decklist</label>
      {player.decklist && player.decklist.length > 0 && !showImport ? (
        <div className="flex justify-between items-center">
          <div>
            <p>{player.decklist.length} unique cards</p>
            {player.deckName && (
              <p className="text-muted" style={{ fontSize: '0.8rem' }}>{player.deckName}</p>
            )}
          </div>
          <div className="flex gap-sm">
            <button onClick={() => setShowImport(true)} className="btn btn-outline btn-sm">Change</button>
            <button onClick={handleClear} className="btn btn-outline btn-sm">Remove</button>
          </div>
        </div>
      ) : (
        <div>
          {error && <p className="form-error mb-sm">{error}</p>}

          <div className="flex items-center gap-sm mb-sm" style={{ fontSize: '0.8rem' }}>
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

          {!manualMode ? (
            <input
              type="url"
              className="form-input mb-sm"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Archidekt / decklist URL…"
            />
          ) : (
            <textarea
              className="form-input mb-sm"
              value={decklistText}
              onChange={(e) => setDecklistText(e.target.value)}
              placeholder={"1 Sol Ring\n1 Arcane Signet\n…"}
              rows={5}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          )}

          <div className="flex gap-sm">
            {!manualMode ? (
              <button onClick={handleImportUrl} className="btn btn-primary btn-sm" disabled={importing || !url.trim()}>
                {importing ? (
                  <span className="flex items-center gap-sm">
                    <span className="spinner spinner-sm" /> Importing…
                  </span>
                ) : 'Import URL'}
              </button>
            ) : (
              <button onClick={handleImportText} className="btn btn-primary btn-sm" disabled={importing || !decklistText.trim()}>
                {importing ? (
                  <span className="flex items-center gap-sm">
                    <span className="spinner spinner-sm" /> Importing…
                  </span>
                ) : 'Import Text'}
              </button>
            )}
            {player.decklist && player.decklist.length > 0 && (
              <button onClick={() => setShowImport(false)} className="btn btn-outline btn-sm">Cancel</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}