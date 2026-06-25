import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { getMatchHistory } from '@/services/userService';
import { updateUserNickname } from '@/services/authService';
import type { MatchHistoryEntry } from '@/types';

export default function ProfilePage() {
  const { user, profile, logOut } = useAuth();
  const [history, setHistory] = useState<MatchHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setNickname(profile?.nickname ?? '');
    getMatchHistory(user.uid)
      .then(setHistory)
      .finally(() => setLoadingHistory(false));
  }, [user, profile]);

  if (!profile || !user) {
    return (
      <div className="app-container text-center">
        <p className="text-muted">Profile not found.</p>
        <Link to="/" className="btn btn-primary">Back to Home</Link>
      </div>
    );
  }

  async function handleSaveNickname() {
    if (!user) return;
    setSaving(true);
    try {
      await updateUserNickname(user.uid, nickname.trim());
      setEditingNickname(false);
    } finally {
      setSaving(false);
    }
  }

  const wins = history.filter((g) => g.placement === 1).length;
  const totalGames = history.length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  // Commander stats
  const commanderStats = new Map<string, { count: number; wins: number }>();
  for (const g of history) {
    const cmdr = g.commanderName ?? 'Unknown';
    const stat = commanderStats.get(cmdr) ?? { count: 0, wins: 0 };
    stat.count++;
    if (g.placement === 1) stat.wins++;
    commanderStats.set(cmdr, stat);
  }
  const topCommanders = Array.from(commanderStats.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  return (
    <div className="app-container">
      <div className="flex justify-between items-center mb-lg">
        <Link to="/" className="btn btn-outline btn-sm">← Back</Link>
        <h1 className="page-title" style={{ margin: 0 }}>Profile</h1>
        <button onClick={logOut} className="btn btn-outline btn-sm btn-danger-outline">Sign Out</button>
      </div>

      {/* Profile header */}
      <div className="card mb-lg">
        <div className="flex items-center gap-lg" style={{ flexWrap: 'wrap' }}>
          <div className="avatar">{(profile.displayName ?? '?')[0]?.toUpperCase()}</div>
          <div className="flex-1">
            <h2 style={{ marginBottom: '0.25rem' }}>{profile.displayName}</h2>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>{user.email}</p>
            {editingNickname ? (
              <div className="flex gap-sm mt-sm" style={{ alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Nickname"
                  style={{ maxWidth: 200 }}
                />
                <button onClick={handleSaveNickname} className="btn btn-primary btn-sm" disabled={saving}>
                  Save
                </button>
                <button onClick={() => setEditingNickname(false)} className="btn btn-outline btn-sm">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-sm mt-sm" style={{ alignItems: 'center' }}>
                <span className="text-muted">
                  Nickname: <strong>{profile.nickname ?? 'None'}</strong>
                </span>
                <button onClick={() => setEditingNickname(true)} className="btn btn-outline btn-sm">Edit</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats overview */}
      <div className="grid grid-3 mb-lg">
        <div className="card text-center">
          <p className="stat-big">{totalGames}</p>
          <p className="text-muted">Games Played</p>
        </div>
        <div className="card text-center">
          <p className="stat-big">{wins}</p>
          <p className="text-muted">Wins</p>
        </div>
        <div className="card text-center">
          <p className="stat-big">{winRate}%</p>
          <p className="text-muted">Win Rate</p>
        </div>
      </div>

      {/* Top commanders */}
      {topCommanders.length > 0 && (
        <div className="mb-lg">
          <h3 style={{ marginBottom: '0.75rem' }}>Most Played Commanders</h3>
          <div className="grid grid-2">
            {topCommanders.map(([name, stat]) => (
              <div key={name} className="card" style={{ padding: '0.75rem 1rem' }}>
                <div className="flex justify-between items-center">
                  <strong>{name}</strong>
                  <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                    {stat.wins}W / {stat.count}G
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game history */}
      <div>
        <h3 style={{ marginBottom: '0.75rem' }}>Game History</h3>
        {loadingHistory ? (
          <div className="card text-center text-muted">Loading...</div>
        ) : history.length === 0 ? (
          <div className="card text-center text-muted">
            No games played yet. Start or join a game to build your history!
          </div>
        ) : (
          <div className="flex flex-col gap-sm">
            {history.map((game) => (
              <HistoryRow key={game.sessionId} game={game} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ game }: { game: MatchHistoryEntry }) {
  const dateStr = game.date
    ? game.date.toDate().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown date';

  const placementColor =
    game.placement === 1 ? '#f5b50a' : game.placement === 2 ? '#9ca3af' : '#a47148';

  return (
    <div className="card" style={{ padding: '0.75rem 1rem' }}>
      <div className="flex items-center gap-md" style={{ flexWrap: 'wrap' }}>
        <div className="placement-circle" style={{ background: placementColor }}>
          {game.placement ?? '—'}
        </div>
        <div className="flex-1">
          <p style={{ fontWeight: 600 }}>{game.commanderName ?? 'Unknown Commander'}</p>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            {dateStr} · {game.playerCount} players
          </p>
        </div>
        {game.placement === 1 && <span className="badge badge-win">🏆 Winner</span>}
      </div>
    </div>
  );
}