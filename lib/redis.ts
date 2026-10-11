const REST_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

/** false when the env vars are absent; routes then keep a dev-only copy in memory */
export const hasRedis = Boolean(REST_URL && TOKEN);

/** One Upstash command over REST. */
export async function redis<T = string | null>(...cmd: (string | number)[]): Promise<T> {
  const res = await fetch(REST_URL!, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(cmd),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return ((await res.json()) as { result: T }).result;
}
