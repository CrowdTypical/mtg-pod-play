import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { getActiveSessions } from '@/services/sessionService';
import type { Session } from '@/types';

export default function HomePage() {
  const { user, profile, logOut } = useAuth();
  const navigate = useNavigate();
  const [activeSessions, setActiveSessions] = useState<Session[]>([]);

  useEffect(() => {
    if (!user) return;
    getActiveSessions(user.uid).then(setActiveSessions).catch(() => {});
  }, [user]);

  async function handleLogout() {
    await logOut();
    navigate('/login');
  }

  const name = profile?.nickname || profile?.displayName || 'Planeswalker';

  return (
    <div className="app-container">
      {/* Header */}
      <div className="flex justify-between items-center mb-lg">
        <div>
          <h1 className="page-title" style={{ marginBottom: 0 }}>MTG Pod Play</h1>
          <p className="text-muted">Welcome back, {name}</p>
        </div>
        <div className="flex gap-sm">
          <Link to="/profile" className="btn btn-outline btn-sm">Profile</Link>
          <button onClick={handleLogout} className="btn btn-outline btn-sm">Log Out</button>
        </div>
      </div>

      {/* Active Games — rejoin section */}
      {activeSessions.length > 0 && (
        <div className="card mb-lg" style={{ borderColor: 'var(--color-accent)' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>🎮 Active Games</h3>
          <p className="text-muted mb-md" style={{ fontSize: '0.85rem' }}>
            You have game(s) in progress. Click to rejoin.
          </p>
          <div className="flex flex-col gap-sm">
            {activeSessions.map((s) => (
              <div
                key={s.id}
                className="flex justify-between items-center"
                style={{
                  padding: '0.75rem 1rem',
                  background: 'var(--bg-accent)',
                  borderRadius: 8,
                }}
              >
                <div>
                  <p style={{ fontWeight: 600, marginBottom: '0.15rem' }}>
                    {s.status === 'lobby' ? 'Lobby' : 'In Progress'}
                    {s.hostUid === user?.uid && ' (Host)'}
                  </p>
                  <p className="text-muted" style={{ fontSize: '0.8rem' }}>
                    Code: {s.code}
                  </p>
                </div>
                <Link
                  to={`/session/${s.id}`}
                  className="btn btn-accent btn-sm"
                >
                  Rejoin →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main actions */}
      <div className="grid grid-2 mt-lg">
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Host a Game</h2>
          <p className="text-muted mb-lg">
            Set up a new Commander game. Choose player count, generate a join code, and invite your pod.
          </p>
          <Link to="/setup" className="btn btn-primary btn-lg btn-block">
            Create New Game
          </Link>
        </div>

        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: '0.5rem' }}>Join a Game</h2>
          <p className="text-muted mb-lg">
            Have a join code or link from a friend? Jump into their lobby.
          </p>
          <Link to="/join" className="btn btn-accent btn-lg btn-block">
            Join with Code
          </Link>
        </div>
      </div>

      {/* Recent stats placeholder */}
      <div className="card mt-lg">
        <h3 style={{ marginBottom: '1rem' }}>Your Stats</h3>
        <div className="grid grid-3">
          <div className="text-center">
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Games Played</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {profile?.gamesPlayed ?? 0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Wins</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-accent)' }}>
              {profile?.wins ?? 0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Avg. Placement</p>
            <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-info)' }}>
              {profile?.avgPlacement ? profile.avgPlacement.toFixed(1) : '—'}
            </p>
          </div>
        </div>
        <div className="mt-lg text-center">
          <Link to="/profile" className="btn btn-outline btn-sm">
            View Full History
          </Link>
        </div>
      </div>
    </div>
  );
}