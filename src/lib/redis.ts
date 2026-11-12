import "server-only";
import { Redis } from "@upstash/redis";

// Upstash Redis client (REST, so it works in serverless and edge routes).
// Server-only: the token must never reach the browser. Reads
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the environment.
// Values are serialised automatically: pass objects and numbers as they are.
// Namespace keys by organisation (e.g. `org:${orgId}:...`) to keep tenants apart.
export const redis = Redis.fromEnv();
