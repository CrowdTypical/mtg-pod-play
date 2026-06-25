import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { logIn, resetPassword } from '@/services/authService';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await logIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email above first, then click "Forgot password".');
      return;
    }
    try {
      await resetPassword(email);
      setError('');
      alert('Password reset email sent! Check your inbox.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
    }
  }

  return (
    <div className="loading-screen" style={{ paddingTop: '10vh' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 1rem' }}>
        <h1 className="page-title text-center">MTG Pod Play</h1>
        <p className="text-muted text-center mb-lg">Commander Game Tracker</p>

        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="divider" />

          <div className="flex flex-col gap-sm">
            <button onClick={handleForgotPassword} className="btn btn-outline btn-block btn-sm">
              Forgot Password?
            </button>
            <Link to="/signup" className="btn btn-outline btn-block btn-sm">
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}