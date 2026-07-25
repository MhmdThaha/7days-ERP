const TECHNICAL_PATTERNS = [
  /DEV_ORG_ID/i,
  /\.env\.local/i,
  /firestore/i,
  /firebase/i,
  /ECONNREFUSED/i,
  /network error/i,
  /internal server error/i,
];

const DEFAULT_SAVE_MESSAGE = 'Unable to save. Please try again.';
const DEFAULT_LOAD_MESSAGE = 'Unable to load data. Please try again.';

export function toUserFriendlyError(
  message: string,
  fallback: string = DEFAULT_SAVE_MESSAGE,
): string {
  const trimmed = message.trim();

  if (!trimmed) {
    return fallback;
  }

  if (TECHNICAL_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return fallback;
  }

  return trimmed;
}

export function toUserFriendlyLoadError(message: string): string {
  return toUserFriendlyError(message, DEFAULT_LOAD_MESSAGE);
}

export function isOrgConfigError(message: string): boolean {
  return message.includes('Organization context is not configured');
}
