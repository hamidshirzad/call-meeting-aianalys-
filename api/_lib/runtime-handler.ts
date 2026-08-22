export type RuntimeFetchHandler = (request: Request) => Promise<Response>;

/**
 * Keeps hosting-runtime context arguments separate from handler dependency injection.
 * Vercel calls fetch(request, context), while application handlers use their optional
 * second argument only in tests.
 */
export function createRuntimeFetchHandler(
  handler: (request: Request) => Promise<Response>,
): RuntimeFetchHandler {
  return (request) => handler(request);
}
