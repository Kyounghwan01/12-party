import { redis } from './store.js';
import { defaults } from './questions.js';

const READ = 5000, ANSWER = 15000, GRACE = 1500, TTL = 604800;
const K = 'party:';
const TEAMS = ['red', 'green'];

class Bad extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const pairs = (flat) => {
  const out = [];
  for (let i = 0; i < (flat?.length ?? 0); i += 2) out.push([flat[i], JSON.parse(flat[i + 1])]);
  return out;
};
const save = (g) => redis(['SET', `${K}game`, JSON.stringify(g)]);
const key = (g, name) => `${K}${g.id}:${name}`;
const fresh = (questions, sizes) => ({ id: crypto.randomUUID().slice(0, 8), phase: 'lobby', q: -1, startAt: 0, questions, sizes, result: null });

// 저장된 게임이 없으면 만든다. 'init'은 동시 접속 때 게임이 두 개 생기는 것을 막는다.
async function load() {
  const [raw] = await redis(['GET', `${K}game`]);
  if (raw) return JSON.parse(raw);
  const [, first] = await redis(
    ['HSETNX', `${K}init`, 'game', JSON.stringify(fresh(defaults, { red: 0, green: 0 }))],
    ['HGET', `${K}init`, 'game'],
  );
  const game = JSON.parse(first);
  await save(game);
  return game;
}

function view(g) {
  const cur = g.questions[g.q];
  const open = g.phase === 'reveal' || g.phase === 'board' || g.phase === 'end';
  return {
    id: g.id, phase: g.phase, q: g.q, total: g.questions.length, now: Date.now(),
    openAt: g.startAt + READ, closeAt: g.startAt + READ + ANSWER,
    question: cur ? { text: cur.text, choices: cur.choices, poll: cur.answer === null } : null,
    survey: g.phase === 'lobby' ? g.questions.flatMap((x, i) => (x.answer === null ? [{ i, text: x.text, choices: x.choices }] : [])) : [],
    result: open ? g.result : null,
  };
}

async function score(g) {
  const [playersRaw, surveyRaw, ...answersRaw] = await redis(
    ['HGETALL', key(g, 'players')], ['HGETALL', key(g, 'survey')],
    ...g.questions.slice(0, g.q + 1).map((_, i) => ['HGETALL', key(g, `a${i}`)]),
  );
  const players = new Map(pairs(playersRaw).map(([id, p]) => [id, { ...p, score: 0, right: 0, ms: 0 }]));
  const surveys = pairs(surveyRaw);
  let correct = [], counts = [];
  answersRaw.forEach((raw, i) => {
    const question = g.questions[i];
    if (question.answer === null) {
      const votes = question.choices.map((_, c) => surveys.filter(([, s]) => s[i] === c).length);
      const max = Math.max(...votes);
      correct = votes.flatMap((v, c) => (v === max ? [c] : []));
    } else correct = [question.answer];
    counts = question.choices.map(() => 0);
    for (const [id, a] of pairs(raw)) {
      const p = players.get(id);
      if (!p) continue;
      counts[a.c]++;
      if (!correct.includes(a.c)) continue;
      p.score += 500 + Math.round(500 * (1 - a.ms / ANSWER));
      p.right++;
      p.ms += a.ms;
    }
  });
  const list = [...players.values()].sort((a, b) => b.score - a.score || a.ms - b.ms);
  const teams = Object.fromEntries(TEAMS.map((t) => {
    const members = list.filter((p) => p.team === t);
    const size = Math.max(members.length, g.sizes[t]);
    const sum = members.reduce((n, p) => n + p.score, 0);
    return [t, { joined: members.length, size, avg: size ? Math.round((sum / size) * 10) / 10 : 0 }];
  }));
  const result = { correct, counts, teams, top: list.slice(0, 5).map(({ name, team, score: s }) => ({ name, team, score: s })) };
  const scores = Object.fromEntries([...players].map(([id, p]) => [id, p.score]));
  return { result, scores };
}

const clean = (v, n) => String(v ?? '').trim().slice(0, n);
function checkQuestions(list) {
  if (!Array.isArray(list) || !list.length || list.length > 30) throw new Bad('문제는 1~30개여야 합니다.');
  return list.map((x) => {
    const text = clean(x.text, 200);
    const choices = (Array.isArray(x.choices) ? x.choices : []).map((c) => clean(c, 60)).filter(Boolean);
    const answer = x.answer === null ? null : Number(x.answer);
    if (!text || choices.length < 2 || choices.length > 4) throw new Bad('문제와 보기 2~4개를 입력하세요.');
    if (answer !== null && !(Number.isInteger(answer) && answer >= 0 && answer < choices.length)) throw new Bad('정답 번호를 확인하세요.');
    return { text, choices, answer };
  });
}

const actions = {
  async join(b, g) {
    const name = clean(b.name, 20), team = b.team;
    if (!TEAMS.includes(team)) throw new Bad('팀을 선택하세요.');
    if (!name) throw new Bad('이름을 입력하세요.');
    if (g.phase === 'end') throw new Bad('퀴즈가 끝났습니다.');
    const id = crypto.randomUUID();
    await redis(
      ['HSET', key(g, 'players'), id, JSON.stringify({ name, team })],
      ['EXPIRE', key(g, 'players'), TTL],
    );
    return { id, name, team, game: g.id };
  },
  async survey(b, g) {
    if (g.phase !== 'lobby') throw new Bad('퀴즈가 시작되어 설문이 끝났습니다.');
    const [exists] = await redis(['HGET', key(g, 'players'), String(b.id)]);
    if (!exists) throw new Bad('다시 참가해 주세요.', 404);
    const survey = {};
    g.questions.forEach((x, i) => {
      const c = b.survey?.[i];
      if (x.answer === null && Number.isInteger(c) && c >= 0 && c < x.choices.length) survey[i] = c;
    });
    await redis(['HSET', key(g, 'survey'), String(b.id), JSON.stringify(survey)], ['EXPIRE', key(g, 'survey'), TTL]);
    return {};
  },
  async me(b, g) {
    const [p, a, scores] = await redis(
      ['HGET', key(g, 'players'), String(b.id)],
      ['HGET', key(g, `a${g.q}`), String(b.id)],
      ['GET', key(g, 'scores')],
    );
    if (!p) throw new Bad('다시 참가해 주세요.', 404);
    return { ...JSON.parse(p), answer: a ? JSON.parse(a).c : null, score: scores ? JSON.parse(scores)[b.id] ?? 0 : 0 };
  },
  async answer(b, g) {
    if (g.phase !== 'question' || b.q !== g.q) throw new Bad('답변 시간이 아닙니다.');
    const elapsed = Date.now() - (g.startAt + READ);
    if (elapsed < -300) throw new Bad('아직 답할 수 없습니다.');
    if (elapsed > ANSWER + GRACE) throw new Bad('시간이 끝났습니다.');
    if (!Number.isInteger(b.c) || b.c < 0 || b.c >= g.questions[g.q].choices.length) throw new Bad('보기를 확인하세요.');
    const [exists] = await redis(['HGET', key(g, 'players'), String(b.id)]);
    if (!exists) throw new Bad('다시 참가해 주세요.', 404);
    // 통신 지연을 보정하되, 휴대폰이 보낸 시간은 지연 허용치 안에서만 믿는다.
    const claimed = Number.isFinite(b.ms) ? b.ms : elapsed;
    const ms = Math.round(Math.min(ANSWER, Math.max(0, elapsed - GRACE, Math.min(claimed, elapsed))));
    const [set] = await redis(
      ['HSETNX', key(g, `a${g.q}`), String(b.id), JSON.stringify({ c: b.c, ms })],
      ['EXPIRE', key(g, `a${g.q}`), TTL],
    );
    return { saved: set === 1 };
  },
};

const admin = {
  async status(b, g) {
    const [players, answered] = await redis(['HGETALL', key(g, 'players')], ['HLEN', key(g, `a${g.q}`)]);
    const list = pairs(players).map(([, p]) => p);
    return { ...view(g), questions: g.questions, sizes: g.sizes, answered,
      joined: { red: list.filter((p) => p.team === 'red').length, green: list.filter((p) => p.team === 'green').length } };
  },
  async config(b, g) {
    if (g.phase !== 'lobby') throw new Bad('시작 전에만 수정할 수 있습니다.');
    const num = (v) => Math.min(500, Math.max(0, Math.floor(Number(v)) || 0));
    if (b.sizes) g.sizes = { red: num(b.sizes.red), green: num(b.sizes.green) };
    if (b.questions) {
      const next = checkQuestions(b.questions);
      const [joined] = await redis(['HLEN', key(g, 'players')]);
      // 설문은 문제 순번으로 저장되므로 참가자가 있으면 문제를 바꾸지 않는다.
      if (joined && JSON.stringify(next) !== JSON.stringify(g.questions)) throw new Bad('참가자가 있어 문제를 바꿀 수 없습니다. 초기화 후 수정하세요.');
      g.questions = next;
    }
    await save(g);
    return {};
  },
  // from: 버튼을 누를 때의 화면 상태. 중복 클릭으로 두 단계가 넘어가지 않게 한다.
  async next(b, g) {
    if (b.from !== `${g.phase}:${g.q}`) throw new Bad('이미 진행되었습니다.', 409);
    if (g.phase === 'question') {
      if (Date.now() < g.startAt + READ + ANSWER + GRACE) throw new Bad('아직 답변 시간입니다.');
      const { result, scores } = await score(g);
      g.result = result;
      g.phase = 'reveal';
      await redis(['SET', key(g, 'scores'), JSON.stringify(scores)], ['EXPIRE', key(g, 'scores'), TTL]);
    } else if (g.phase === 'reveal') {
      g.phase = g.q === g.questions.length - 1 ? 'end' : 'board';
    } else if (g.phase === 'end') throw new Bad('퀴즈가 끝났습니다.');
    else { g.q++; g.phase = 'question'; g.startAt = Date.now(); }
    await save(g);
    return {};
  },
  async reset(b, g) {
    await save(fresh(g.questions, g.sizes));
    return {};
  },
};

export async function handle(req) {
  try {
    if (req.method === 'GET') {
      const g = await load();
      const out = view(g);
      if (new URL(req.url, 'http://x').searchParams.has('screen')) {
        const [joined, answered] = await redis(['HLEN', key(g, 'players')], ['HLEN', key(g, `a${g.q}`)]);
        Object.assign(out, { joined, answered });
      }
      return json(out);
    }
    if (req.method !== 'POST') throw new Bad('지원하지 않는 요청입니다.', 405);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new Bad('요청을 확인하세요.');
    if (Object.hasOwn(admin, body.action)) return json(await admin[body.action](body, await load()));
    if (!Object.hasOwn(actions, body.action)) throw new Bad('요청을 확인하세요.');
    return json(await actions[body.action](body, await load()));
  } catch (e) {
    if (!(e instanceof Bad)) console.error(e);
    return json({ error: e instanceof Bad ? e.message : '서버 오류입니다. 잠시 후 다시 시도하세요.' }, e.status ?? 500);
  }
}
