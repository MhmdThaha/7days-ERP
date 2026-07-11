export type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function requiredPublicEnv(
  value: string | undefined,
  name:
    | 'NEXT_PUBLIC_FIREBASE_API_KEY'
    | 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'
    | 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'
    | 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'
    | 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'
    | 'NEXT_PUBLIC_FIREBASE_APP_ID',
): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

/**
 * Firebase client config for browser SDK.
 *
 * Each NEXT_PUBLIC_* variable must be read with a static property access
 * (process.env.NEXT_PUBLIC_...) so Next.js can inline values in the client bundle.
 * Dynamic access such as process.env[name] is undefined in the browser.
 */
export function getFirebaseClientConfig(): FirebaseClientConfig {
  return {
    apiKey: requiredPublicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      'NEXT_PUBLIC_FIREBASE_API_KEY',
    ),
    authDomain: requiredPublicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    ),
    projectId: requiredPublicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    ),
    storageBucket: requiredPublicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    ),
    messagingSenderId: requiredPublicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    ),
    appId: requiredPublicEnv(
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      'NEXT_PUBLIC_FIREBASE_APP_ID',
    ),
  };
}
