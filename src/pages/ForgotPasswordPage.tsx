import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { resetPassword } from '@/services/authService';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await resetPassword(email);
      setMessage('Check your inbox for a password reset email.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="loading-screen" style={{ paddingTop: '10vh' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 1rem' }}>
        <h1 className="page-title text-center">Reset Password</h1>

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
                placeholder="your@email.com"
                autoFocus
              />
            </div>

            {error && <p className="form-error">{error}</p>}
            {message && <p className="text-primary" style={{ fontSize: '0.9rem' }}>{message}</p>}

            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Email'}
            </button>
          </form>

          <div className="divider" />
          <p className="text-center text-muted">
            <Link to="/login">Back to sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}