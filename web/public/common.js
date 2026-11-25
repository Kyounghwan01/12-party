const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const teamName = { red: '레드', green: '그린' };
let offset = 0, bestRtt = Infinity;
const serverNow = () => Date.now() + offset;

async function api(body, query = '') {
  const t = Date.now();
  const res = await fetch(`/api/quiz${query}`, { ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(6000) });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
  if (data.now) {
    const rtt = Date.now() - t;
    if (rtt <= bestRtt) { bestRtt = rtt; offset = data.now + rtt / 2 - Date.now(); }
  }
  return data;
}
// 참가자 요청이 한꺼번에 몰리지 않도록 간격을 조금씩 다르게 한다.
function poll(fn, ms) {
  const run = async () => { try { if (!document.hidden) await fn(); } catch (e) { console.warn(e); } setTimeout(run, ms * (0.85 + Math.random() * 0.3)); };
  run();
}
const teamsHtml = (r) => `<div class="teams">${['red', 'green'].map((t) => `<div class="card"><b class="${t}">${teamName[t]}팀</b><div class="big ${t}">${r.teams[t].avg}</div><span class="dim">평균 점수 · ${r.teams[t].size}명 기준</span></div>`).join('')}</div>`;
const leader = (r) => { const d = r.teams.red.avg - r.teams.green.avg; return d === 0 ? '현재 동점' : `${d > 0 ? '레드' : '그린'}팀이 앞서고 있습니다`; };
const topHtml = (r) => `<ul class="top">${r.top.map((p, i) => `<li><span>${i + 1}. ${esc(p.name)} <span class="${p.team}">${teamName[p.team]}팀</span></span><b>${p.score}</b></li>`).join('')}</ul>`;
