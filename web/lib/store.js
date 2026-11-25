// Redis 명령 배열을 받아 결과 배열을 돌려준다. 운영은 Upstash REST, 로컬은 메모리.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export async function redis(...commands) {
  if (!url || !token) {
    if (process.env.LOCAL_DEV === '1') return commands.map(memory);
    throw new Error('Redis 환경변수가 없습니다.');
  }
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return (await res.json()).map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

const db = new Map();
export function memory([cmd, key, ...a]) {
  const hash = () => db.get(key) ?? new Map();
  switch (cmd) {
    case 'GET': return db.get(key) ?? null;
    case 'SET': db.set(key, String(a[0])); return 'OK';
    case 'HGET': return hash().get(a[0]) ?? null;
    case 'HSET': { const h = hash(); h.set(a[0], String(a[1])); db.set(key, h); return 1; }
    case 'HSETNX': { const h = hash(); if (h.has(a[0])) return 0; h.set(a[0], String(a[1])); db.set(key, h); return 1; }
    case 'HGETALL': return [...hash()].flat();
    case 'HLEN': return hash().size;
    case 'EXPIRE': return 1;
    default: throw new Error(`지원하지 않는 명령: ${cmd}`);
  }
}
