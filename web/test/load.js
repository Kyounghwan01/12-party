// 100명이 참가해 한 게임을 끝까지 진행하는 모의 시험. BASE=주소 npm test (참가자·점수가 초기화된다)
import assert from 'node:assert/strict';
const base = process.env.BASE || 'http://localhost:3000', N = 100;
const times = [];
async function post(body) {
  const t = performance.now();
  const r = await fetch(`${base}/api/quiz`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  times.push(performance.now() - t);
  return { status: r.status, ...(await r.json()) };
}
const state = async () => (await fetch(`${base}/api/quiz`)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const next = async () => { const s = await state(); return post({ action: 'next', from: `${s.phase}:${s.q}` }); };

assert.equal((await post({ action: 'reset' })).status, 200);
const { questions } = await post({ action: 'status' });
const people = await Promise.all(Array.from({ length: N }, (_, i) => post({ action: 'join', name: `사람${i}`, team: i % 2 ? 'green' : 'red' })));
const survey = Object.fromEntries(questions.map((_, j) => [j, 0]));
assert.ok((await Promise.all(people.map((p) => post({ action: 'survey', id: p.id, survey })))).every((r) => r.status === 200));
assert.equal(new Set(people.map((p) => p.id)).size, N);
for (let q = 0; q < questions.length; q++) {
  assert.equal((await next()).status, 200);
  const s = await state();
  assert.equal('answer' in s.question, false);
  assert.equal(s.result, null);
  assert.equal((await post({ action: 'answer', id: people[0].id, q, c: 0, ms: 0 })).status, 400);
  assert.equal((await next()).status, 400);
  await sleep(s.openAt - s.now + 300);
  const right = questions[q].answer ?? 0;
  const saved = await Promise.all(people.map((p, i) => post({ action: 'answer', id: p.id, q, c: i < 60 ? right : (right + 1) % questions[q].choices.length, ms: 200 })));
  assert.ok(saved.every((x) => x.saved));
  assert.equal((await post({ action: 'answer', id: people[99].id, q, c: right, ms: 0 })).saved, false);
  await sleep(s.closeAt - s.now + 1900);
  assert.equal((await next()).status, 200);
  const r = (await state()).result;
  assert.deepEqual(r.correct, [right]);
  assert.equal(r.counts.reduce((a, b) => a + b), N);
  assert.equal(r.counts[right], 60);
  assert.equal((await next()).status, 200);
  console.log(`${q + 1}번 통과`, r.teams.red.avg, r.teams.green.avg);
  if (process.env.QUICK) break;
}
const end = await state();
if (!process.env.QUICK) assert.equal(end.phase, 'end');
assert.equal((await post({ action: 'me', id: people[99].id })).score, 0);
const mine = (await post({ action: 'me', id: people[0].id })).score;
assert.ok(mine > 500 && mine <= 1000 * questions.length);
times.sort((a, b) => a - b);
console.log(`통과: ${N}명, 요청 ${times.length}회, 응답 중앙값 ${times[times.length >> 1].toFixed()}ms, 95% ${times[Math.floor(times.length * 0.95)].toFixed()}ms`);
