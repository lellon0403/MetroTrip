import createClient from "openapi-fetch";
import type { paths } from "./schema";

export type { components, operations, paths } from "./schema";

export function createApiClient(
  baseUrl: string,
  customFetch?: typeof globalThis.fetch,
) {
  return createClient<paths>({
    baseUrl,
    credentials: "include",
    ...(customFetch ? { fetch: customFetch } : {}),
  });
}