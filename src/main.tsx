import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './context/AuthContext';
import SetupRequired from './pages/SetupRequired';
import { isFirebaseConfigured } from './config/firebase';
import './styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// If Firebase isn't configured, show the setup guide instead of crashing
// to a blank white page.
if (!isFirebaseConfigured) {
  root.render(
    <React.StrictMode>
      <SetupRequired />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}