import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import LoginPage from '@/pages/LoginPage';
import SignupPage from '@/pages/SignupPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import HomePage from '@/pages/HomePage';
import SetupPage from '@/pages/SetupPage';
import JoinPage from '@/pages/JoinPage';
import LobbyPage from '@/pages/LobbyPage';
import MatchPage from '@/pages/MatchPage';
import ProfilePage from '@/pages/ProfilePage';
import OverlayPage from '@/pages/OverlayPage';
import { getSession } from '@/services/sessionService';
import type { Session } from '@/types';

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <p className="text-muted">Loading...</p>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Routes to lobby or match page based on session status. */
function SessionRouter() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    getSession(sessionId)
      .then((s) => {
        if (active) setSession(s);
      })
      .catch(() => {
        if (active) setSession(null);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (session === undefined) return <LoadingScreen />;
  if (session === null) {
    return (
      <div className="app-container text-center">
        <p className="text-muted mb-lg">Session not found.</p>
        <Navigate to="/" replace />
      </div>
    );
  }

  if (session.status === 'in_progress' || session.status === 'completed') {
    return <MatchPage />;
  }
  return <LobbyPage />;
}

export default function App() {
  const { loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      {/* Auth routes (public) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Overlay route (public, read-only, for OBS browser source) */}
      <Route path="/overlay/:sessionId" element={<OverlayPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/setup"
        element={
          <ProtectedRoute>
            <SetupPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/join/:code?"
        element={
          <ProtectedRoute>
            <JoinPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/session/:sessionId"
        element={
          <ProtectedRoute>
            <SessionRouter />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}