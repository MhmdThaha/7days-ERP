import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep firebase-admin and its JWT deps as native Node requires on Vercel.
  // firebase-admin is in Next.js defaults; jwks-rsa/jose are listed for trace completeness.
  serverExternalPackages: ['firebase-admin', 'jwks-rsa', 'jose'],
};

export default nextConfig;
