import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { createSession } from '@/services/sessionService';

export default function SetupPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [startingLife, setStartingLife] = useState(40);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!user || !profile) return;
    setLoading(true);
    setError('');
    try {
      const sessionId = await createSession({
        hostUid: user.uid,
        hostDisplayName: profile.displayName,
        hostNickname: profile.nickname,
        maxPlayers,
        startingLife,
      });
      navigate(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create game.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-container">
      <div className="mb-lg">
        <Link to="/" className="btn btn-outline btn-sm">← Back</Link>
      </div>

      <h1 className="page-title">Set Up a Game</h1>

      <div className="card" style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Player count */}
        <div className="form-group">
          <label className="form-label">Number of Players</label>
          <p className="form-hint mb-md">Choose how many players will join (2–7).</p>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            {[2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                onClick={() => setMaxPlayers(n)}
                className={`btn ${maxPlayers === n ? 'btn-primary' : 'btn-outline'}`}
                style={{ width: 60, height: 60, fontSize: '1.5rem' }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="divider" />

        {/* Starting life */}
        <div className="form-group">
          <label className="form-label">Starting Life Total</label>
          <div className="flex items-center gap-md">
            <button
              onClick={() => setStartingLife((v) => Math.max(20, v - 5))}
              className="btn btn-outline btn-sm"
              style={{ width: 40, height: 40 }}
            >
              −
            </button>
            <span style={{ fontSize: '2rem', fontWeight: 700, minWidth: 60, textAlign: 'center' }}>
              {startingLife}
            </span>
            <button
              onClick={() => setStartingLife((v) => Math.min(60, v + 5))}
              className="btn btn-outline btn-sm"
              style={{ width: 40, height: 40 }}
            >
              +
            </button>
          </div>
          <p className="form-hint mt-md">Standard Commander is 40 life.</p>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          onClick={handleCreate}
          className="btn btn-primary btn-lg btn-block mt-lg"
          disabled={loading}
        >
          {loading ? 'Creating Game...' : 'Create Game & Open Lobby'}
        </button>
      </div>
    </div>
  );
}