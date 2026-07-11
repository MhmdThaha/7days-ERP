import 'server-only';

export type FirebaseAdminConfig = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function requiredServerEnv(
  value: string | undefined,
  name: 'FIREBASE_ADMIN_PROJECT_ID' | 'FIREBASE_ADMIN_CLIENT_EMAIL' | 'FIREBASE_ADMIN_PRIVATE_KEY',
): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  while (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }

  if (key.endsWith(',')) {
    key = key.slice(0, -1).trim();
  }

  if (key.endsWith('"') || key.endsWith("'")) {
    key = key.slice(0, -1).trim();
  }

  if (key.startsWith('"') || key.startsWith("'")) {
    key = key.slice(1).trim();
  }

  return key.replace(/\\n/g, '\n').trim();
}

export function getFirebaseAdminConfig(): FirebaseAdminConfig {
  const privateKey = normalizePrivateKey(
    requiredServerEnv(process.env.FIREBASE_ADMIN_PRIVATE_KEY, 'FIREBASE_ADMIN_PRIVATE_KEY'),
  );

  return {
    projectId: requiredServerEnv(
      process.env.FIREBASE_ADMIN_PROJECT_ID,
      'FIREBASE_ADMIN_PROJECT_ID',
    ),
    clientEmail: requiredServerEnv(
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      'FIREBASE_ADMIN_CLIENT_EMAIL',
    ),
    privateKey,
  };
}
