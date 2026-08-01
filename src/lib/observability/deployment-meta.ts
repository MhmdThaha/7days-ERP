export type DeploymentMeta = {
  deployment: string;
  environment: string;
};

export function getServerDeploymentMeta(): DeploymentMeta {
  return {
    deployment:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.VERCEL_DEPLOYMENT_ID ??
      'unknown',
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
  };
}

export function getClientDeploymentMeta(): DeploymentMeta {
  return {
    deployment:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_VERCEL_DEPLOYMENT_ID ??
      'unknown',
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
  };
}
