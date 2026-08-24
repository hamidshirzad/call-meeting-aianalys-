import { createRequestId, jsonResponse } from './_lib/api-errors.js';
import { createRuntimeFetchHandler } from './_lib/runtime-handler.js';

/**
 * Reports which commit the server is running.
 *
 * Deliberately unauthenticated and free of configuration: it exposes only the
 * public build identifiers Vercel already attaches to a deployment, so the
 * server build can be confirmed independently of the client bundle.
 */
export async function handleVersionRequest(_request: Request): Promise<Response> {
  return jsonResponse(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      environment: process.env.VERCEL_ENV ?? 'development',
    },
    200,
    createRequestId(),
  );
}

export default {
  fetch: createRuntimeFetchHandler(handleVersionRequest),
};
