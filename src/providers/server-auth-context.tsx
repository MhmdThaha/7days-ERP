'use client';

import { createContext, useContext, type ReactNode } from 'react';

const ServerAuthContext = createContext(false);

export function ServerAuthProvider({
  verified,
  children,
}: {
  verified: boolean;
  children: ReactNode;
}) {
  return <ServerAuthContext.Provider value={verified}>{children}</ServerAuthContext.Provider>;
}

/** True when dashboard SSR already verified the httpOnly session cookie. */
export function useServerSessionVerified(): boolean {
  return useContext(ServerAuthContext);
}
