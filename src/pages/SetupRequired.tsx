import { isFirebaseConfigured } from '@/config/firebase';

const REQUIRED_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_APP_BASE_URL',
];

/**
 * Full-screen setup guide shown when Firebase env vars are missing.
 * Prevents a blank white page and tells the user exactly what to do.
 */
export default function SetupRequired() {
  return (
    <div className="setup-required">
      <div className="setup-card">
        <h1>⚙️ Setup Required</h1>
        <p className="text-muted mb-lg">
          This app needs a Firebase project to function. Follow these steps to get
          it running locally.
        </p>

        <ol className="setup-steps">
          <li>
            Go to the{' '}
            <a
              href="https://console.firebase.google.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Firebase Console
            </a>{' '}
            and create a project.
          </li>
          <li>
            Enable <strong>Authentication</strong> → Sign-in method →{' '}
            <strong>Email/Password</strong>.
          </li>
          <li>
            Create a <strong>Firestore Database</strong> (production mode).
          </li>
          <li>
            In <strong>Project Settings → General → Your apps</strong>, add a web
            app (<code>{'</>'}</code>) and copy the config values.
          </li>
          <li>
            Create a <code>.env.local</code> file in the project root (next to{' '}
            <code>.env.example</code>) with these values:
            <pre className="setup-code">
{`VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
VITE_APP_BASE_URL=http://localhost:5173`}
            </pre>
          </li>
          <li>
            Restart the dev server (<code>npm run dev</code>) — Vite only reads{' '}
            <code>.env.local</code> on startup.
          </li>
        </ol>

        <div className="setup-required-vars">
          <p className="text-muted">
            <strong>Required environment variables:</strong>
          </p>
          <ul>
            {REQUIRED_VARS.map((v) => (
              <li key={v}>
                <code>{v}</code>
              </li>
            ))}
          </ul>
        </div>

        <p className="setup-hint">
          💡 You can copy <code>.env.example</code> to <code>.env.local</code> as a
          starting point:
          <br />
          <code>copy .env.example .env.local</code>
        </p>
      </div>
    </div>
  );
}

/** Convenience hook for components that want to early-return. */
export function useFirebaseConfigured() {
  return isFirebaseConfigured;
}