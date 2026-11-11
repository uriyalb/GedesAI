import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Google Drive read-only scope for viewing files in folders
provider.addScope('https://www.googleapis.com/auth/drive.readonly');

// Google OAuth access tokens live for one hour. Keep it for the browser session so a page
// reload (common on mobile) does not force the user to sign in again.
const TOKEN_KEY = 'gedes.driveToken';
const TOKEN_TTL_MS = 55 * 60 * 1000;

interface StoredToken {
  token: string;
  expiresAt: number;
}

let isSigningIn = false;
let cachedAccessToken: StoredToken | null = loadStoredToken();

function loadStoredToken(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (typeof token === 'string' && typeof expiresAt === 'number') return { token, expiresAt };
  } catch {
    /* storage unavailable */
  }
  return null;
}

function storeToken(value: StoredToken | null) {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Initializes Firebase Auth state listener and keeps token in memory.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = getAccessToken();
      if (token) {
        onAuthSuccess?.(user, token);
      } else if (!isSigningIn) {
        // Signed in to Firebase, but the Drive token expired: ask the user to reconnect.
        onAuthFailure?.(user);
      }
    } else {
      setAccessToken(null);
      onAuthFailure?.(null);
    }
  });
};

/**
 * Initiates Google OAuth Popup to sign in and obtain Google Drive OAuth access token.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth credential');
    }

    setAccessToken(credential.accessToken);
    return { user: result.user, accessToken: credential.accessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  if (cachedAccessToken && cachedAccessToken.expiresAt <= Date.now()) {
    setAccessToken(null);
  }
  return cachedAccessToken?.token ?? null;
};

export const setAccessToken = (token: string | null) => {
  cachedAccessToken = token ? { token, expiresAt: Date.now() + TOKEN_TTL_MS } : null;
  storeToken(cachedAccessToken);
};

export const clearAccessToken = () => setAccessToken(null);

export const logout = async () => {
  await signOut(auth);
  setAccessToken(null);
};
