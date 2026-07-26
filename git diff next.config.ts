warning: in the working copy of 'next.config.ts', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'package-lock.json', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'package.json', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/next.config.ts b/next.config.ts[m
[1mindex e9ffa30..e6fd631 100644[m
[1m--- a/next.config.ts[m
[1m+++ b/next.config.ts[m
[36m@@ -1,7 +1,9 @@[m
 import type { NextConfig } from "next";[m
 [m
 const nextConfig: NextConfig = {[m
[31m-  /* config options here */[m
[32m+[m[32m  // Keep firebase-admin and its JWT deps as native Node requires on Vercel.[m
[32m+[m[32m  // firebase-admin is in Next.js defaults; jwks-rsa/jose are listed for trace completeness.[m
[32m+[m[32m  serverExternalPackages: ['firebase-admin', 'jwks-rsa', 'jose'],[m
 };[m
 [m
 export default nextConfig;[m
[1mdiff --git a/package-lock.json b/package-lock.json[m
[1mindex 3d1b048..3545aa6 100644[m
[1m--- a/package-lock.json[m
[1m+++ b/package-lock.json[m
[36m@@ -9595,6 +9595,15 @@[m
         "node": "^20.19.0 || ^22.12.0 || >= 23.0.0"[m
       }[m
     },[m
[32m+[m[32m    "node_modules/jwks-rsa/node_modules/jose": {[m
[32m+[m[32m      "version": "5.9.6",[m
[32m+[m[32m      "resolved": "https://registry.npmjs.org/jose/-/jose-5.9.6.tgz",[m
[32m+[m[32m      "integrity": "sha512-AMlnetc9+CV9asI19zHmrgS/WYsWUwCn2R7RzlbJWD7F9eWYUTGyBmU9o6PxngtLGOiDGPRu+Uc4fhKzbpteZQ==",[m
[32m+[m[32m      "license": "MIT",[m
[32m+[m[32m      "funding": {[m
[32m+[m[32m        "url": "https://github.com/sponsors/panva"[m
[32m+[m[32m      }[m
[32m+[m[32m    },[m
     "node_modules/jwks-rsa/node_modules/lru-cache": {[m
       "version": "11.5.1",[m
       "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-11.5.1.tgz",[m
[1mdiff --git a/package.json b/package.json[m
[1mindex bae37e7..2f153f7 100644[m
[1m--- a/package.json[m
[1m+++ b/package.json[m
[36m@@ -35,6 +35,11 @@[m
     "xlsx": "^0.18.5",[m
     "zod": "^4.4.3"[m
   },[m
[32m+[m[32m  "overrides": {[m
[32m+[m[32m    "jwks-rsa": {[m
[32m+[m[32m      "jose": "5.9.6"[m
[32m+[m[32m    }[m
[32m+[m[32m  },[m
   "devDependencies": {[m
     "@tailwindcss/postcss": "^4",[m
     "@testing-library/dom": "^10.4.1",[m
