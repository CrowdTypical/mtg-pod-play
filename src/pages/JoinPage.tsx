import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import {
  getSessionByCode,
  joinSession,
  setPlayerCommander,
  setPlayerDecklist,
} from '@/services/sessionService';
import {
  enrichDecklist,
  importFromArchidekt,
  parseDecklistText,
  searchCommanders,
} from '@/lib/scryfall';
import type { CommanderInfo, Decklist } from '@/types';
import CommanderDetailModal from '@/components/CommanderDetailModal';
import '@/styles/commander-detail.css';

type ImportMode = 'paste' | 'archidekt' | 'none';

export default function JoinPage() {
  const navigate = useNavigate();
  const { code: codeParam } = useParams<{ code?: string }>();
  const { user, profile } = useAuth();

  const [code, setCode] = useState(codeParam ?? '');
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [commanderQuery, setCommanderQuery] = useState('');
  const [commanderResults, setCommanderResults] = useState<CommanderInfo[]>([]);
  const [selectedCommander, setSelectedCommander] = useState<CommanderInfo | null>(null);
  const [previewCommander, setPreviewCommander] = useState<CommanderInfo | null>(null);
  const [searching, setSearching] = useState(false);

  const [importMode, setImportMode] = useState<ImportMode>('none');
  const [decklistText, setDecklistText] = useState('');
  const [archidektUrl, setArchidektUrl] = useState('');
  const [decklist, setDecklist] = useState<Decklist | null>(null);
  const [deckName, setDeckName] = useState<string | null>(null);
  const [deckSourceUrl, setDeckSourceUrl] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const displayName = nickname.trim() || profile?.displayName || 'Player';

  // Debounced commander search
  useEffect(() => {
    if (!commanderQuery.trim() || selectedCommander) {
      setCommanderResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchCommanders(commanderQuery);
        setCommanderResults(results.slice(0, 8));
      } catch {
        setCommanderResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [commanderQuery, selectedCommander]);

  async function handleImportPaste() {
    if (!decklistText.trim()) return;
    setImporting(true);
    setError('');
    try {
      const parsed = parseDecklistText(decklistText);
      const enriched = await enrichDecklist(parsed);
      setDecklist(enriched);
      setDeckName(null);
      setDeckSourceUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse decklist.');
    } finally {
      setImporting(false);
    }
  }

  async function handleImportArchidekt() {
    if (!archidektUrl.trim()) return;
    setImporting(true);
    setError('');
    try {
      const imported = await importFromArchidekt(archidektUrl);
      const enriched = await enrichDecklist(imported.decklist);
      setDecklist(enriched);
      setDeckName(imported.name);
      setDeckSourceUrl(imported.sourceUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import from Archidekt.');
    } finally {
      setImporting(false);
    }
  }

  async function handleJoin() {
    if (!user || !profile) return;
    if (!code.trim()) {
      setError('Enter a join code.');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const session = await getSessionByCode(code.trim().toUpperCase());
      if (!session?.id) {
        setError('No game found with that code.');
        setJoining(false);
        return;
      }
      // Join with core identity first, then write commander/decklist as
      // separate updates. This avoids a race condition where a single
      // large setDoc can be overwritten by the real-time subscription's
      // initial snapshot before all fields propagate.
      await joinSession(session.id, {
        uid: user.uid,
        displayName: profile.displayName,
        nickname: nickname.trim() || undefined,
        startingLife: session.startingLife,
      });

      // Write commander and decklist as explicit follow-up updates.
      if (selectedCommander) {
        await setPlayerCommander(session.id, user.uid, selectedCommander);
      }
      if (decklist) {
        await setPlayerDecklist(session.id, user.uid, decklist, deckName, deckSourceUrl);
      }

      navigate(`/session/${session.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game.');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="app-container">
      <div className="mb-lg">
        <Link to="/" className="btn btn-outline btn-sm">← Back</Link>
      </div>

      <h1 className="page-title">Join a Game</h1>

      <div className="card" style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Join code */}
        <div className="form-group">
          <label className="form-label">Game Code</label>
          <input
            type="text"
            className="form-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={8}
            style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
          />
        </div>

        <div className="divider" />

        {/* Nickname */}
        <div className="form-group">
          <label className="form-label">Nickname (optional)</label>
          <input
            type="text"
            className="form-input"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={profile?.displayName ?? 'Your display name'}
          />
          <p className="form-hint">
            You'll appear as <strong>{displayName}</strong> in the game.
          </p>
        </div>

        <div className="divider" />

        {/* Commander selection */}
        <div className="form-group">
          <label className="form-label">Commander</label>
          {selectedCommander ? (
            <div className="flex items-center gap-md" style={{ flexWrap: 'wrap' }}>
              {selectedCommander.imageUris && (
                <img
                  src={selectedCommander.imageUris.small}
                  alt={selectedCommander.name}
                  style={{ width: 60, height: 84, borderRadius: 6 }}
                />
              )}
              <div className="flex-1">
                <p style={{ fontWeight: 600 }}>{selectedCommander.name}</p>
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                  {selectedCommander.manaCost} · {selectedCommander.typeLine}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedCommander(null);
                  setCommanderQuery('');
                }}
                className="btn btn-outline btn-sm"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                className="form-input"
                value={commanderQuery}
                onChange={(e) => setCommanderQuery(e.target.value)}
                placeholder="Search for a commander…"
              />
              {searching && <p className="form-hint">Searching…</p>}
              {commanderResults.length > 0 && (
                <div className="commander-results">
                  {commanderResults.map((c) => (
                    <button
                      key={c.scryfallId}
                      onClick={() => setPreviewCommander(c)}
                      className="commander-result"
                    >
                      {c.imageUris && (
                        <img src={c.imageUris.small} alt={c.name} />
                      )}
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

        <div className="divider" />

        {/* Decklist import */}
        <div className="form-group">
          <label className="form-label">Decklist (optional)</label>
          {decklist ? (
            <div className="card-accent" style={{ padding: '0.75rem' }}>
              <p style={{ fontWeight: 600 }}>
                {decklist.length} unique cards loaded
              </p>
              <button
                onClick={() => setDecklist(null)}
                className="btn btn-outline btn-sm mt-sm"
              >
                Clear decklist
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-sm mb-md" style={{ flexWrap: 'wrap' }}>
                <button
                  onClick={() => setImportMode('paste')}
                  className={`btn btn-sm ${importMode === 'paste' ? 'btn-primary' : 'btn-outline'}`}
                >
                  Paste Text
                </button>
                <button
                  onClick={() => setImportMode('archidekt')}
                  className={`btn btn-sm ${importMode === 'archidekt' ? 'btn-primary' : 'btn-outline'}`}
                >
                  Archidekt URL
                </button>
              </div>

              {importMode === 'paste' && (
                <>
                  <textarea
                    className="form-input"
                    value={decklistText}
                    onChange={(e) => setDecklistText(e.target.value)}
                    placeholder={'4 Lightning Bolt\n4 Counterspell\n…'}
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                  />
                  <button
                    onClick={handleImportPaste}
                    className="btn btn-primary btn-sm mt-sm"
                    disabled={importing || !decklistText.trim()}
                  >
                    {importing ? 'Importing…' : 'Import Decklist'}
                  </button>
                </>
              )}

              {importMode === 'archidekt' && (
                <>
                  <input
                    type="url"
                    className="form-input"
                    value={archidektUrl}
                    onChange={(e) => setArchidektUrl(e.target.value)}
                    placeholder="https://archidekt.com/decks/12345"
                  />
                  <button
                    onClick={handleImportArchidekt}
                    className="btn btn-primary btn-sm mt-sm"
                    disabled={importing || !archidektUrl.trim()}
                  >
                    {importing ? 'Importing…' : 'Import from Archidekt'}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          onClick={handleJoin}
          className="btn btn-primary btn-lg btn-block mt-lg"
          disabled={joining || !code.trim()}
        >
          {joining ? 'Joining…' : 'Join Game'}
        </button>
      </div>

      {/* Commander detail / art picker modal */}
      {previewCommander && (
        <CommanderDetailModal
          commander={previewCommander}
          onClose={() => setPreviewCommander(null)}
          onChoose={(c) => {
            setSelectedCommander(c);
            setPreviewCommander(null);
            setCommanderQuery('');
            setCommanderResults([]);
          }}
        />
      )}
    </div>
  );
}
