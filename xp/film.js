/* Full experience · the film. Everything on screen is a pure function of the film clock T (seconds after the
   visitor answers), so pause, skip and replay are just "set T". Every scene starts on a bar line of the score
   (128 BPM, 1.875 s bars) and the key reveals land on beats. The frame-time functions write into preallocated
   objects: nothing is allocated per frame. */
import { BAR, BEAT, score } from './audio.js';

export const LAYOUT = { hub: [0, 0], answered: [-232, -168], booked: [236, -184], measured: [-214, 206], alwayson: [226, 194] };
export const IDS = ['answered', 'booked', 'measured', 'alwayson'];
export const NAMES = { answered: 'Answered', booked: 'Booked', measured: 'Measured', alwayson: 'Always on' };
// plan 3 bars, opening titles 3 bars, each station 8 bars; Always on: 4 bars of deploy, 5 real seconds of crash test, 3 bars
export const KILL = 4 * BAR, CRASH = 5, BACK = KILL + CRASH;
export const DUR = { plan: 3 * BAR, open: 3 * BAR, answered: 8 * BAR, booked: 8 * BAR, measured: 8 * BAR, alwayson: BACK + 3 * BAR };
export const VIDEO_AT = 2.5 * BAR;           // the real Mini App recording starts here in the Booked scene
const TRANSIT = 3.0;
const b = (bar, beat) => bar * BAR + (beat || 0) * BEAT;   // station-relative time of bar n (0-based), beat k
const RUN_A = b(2), RUN_B = b(6);            // Measured: the scraper's 59 s run is replayed between these two bar lines

/* ---------------- maths (allocation-free helpers write into `out`) */
const clamp = (x, a, c) => Math.max(a, Math.min(c, x));
const sat = (x) => clamp(x, 0, 1);
const lerp = (a, c, k) => a + (c - a) * k;
const smooth = (a, c, x) => { const k = sat((x - a) / (c - a)); return k * k * (3 - 2 * k); };
const smoother = (k) => { k = sat(k); return k * k * k * (k * (k * 6 - 15) + 10); };
const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const win = (x, a, c, fi, fo) => smooth(a, a + (fi || 0.3), x) * (1 - smooth(c - (fo || 0.3), c, x));
const set3 = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
const copy3 = (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; };
const lerp3 = (o, a, c, k) => { o[0] = a[0] + (c[0] - a[0]) * k; o[1] = a[1] + (c[1] - a[1]) * k; o[2] = a[2] + (c[2] - a[2]) * k; return o; };
const dist3 = (a, c) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
const cam = () => ({ pos: [0, 0, 0], look: [0, 0, 0] });

// cubic Hermite through keys [t, ...values] with Catmull-Rom tangents: smooth camera moves that ease at both ends
function track(keys) {
  const n = keys.length, dim = keys[0].length - 1;
  const tan = keys.map((k, i) => {
    if (i === 0 || i === n - 1) return new Array(dim).fill(0);
    const a = keys[i - 1], c = keys[i + 1];
    return a.slice(1).map((av, j) => (c[j + 1] - av) / (c[0] - a[0]));
  });
  return (t, out) => {
    if (t <= keys[0][0]) { for (let j = 0; j < dim; j++) out[j] = keys[0][j + 1]; return out; }
    if (t >= keys[n - 1][0]) { for (let j = 0; j < dim; j++) out[j] = keys[n - 1][j + 1]; return out; }
    let i = 0; while (i < n - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i], c = keys[i + 1], h = c[0] - a[0], s = (t - a[0]) / h;
    const s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    for (let j = 0; j < dim; j++) out[j] = h00 * a[j + 1] + h10 * h * tan[i][j] + h01 * c[j + 1] + h11 * h * tan[i + 1][j];
    return out;
  };
}
// centripetal Catmull-Rom through points, sampled by arc length (built once per route, sampled without allocating)
function railway(points) {
  const P = points;
  const vl = (a, c, k) => [lerp(a[0], c[0], k), lerp(a[1], c[1], k), lerp(a[2], c[2], k)];
  const seg = (i) => {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const tj = (a, c) => Math.pow(Math.max(1e-4, dist3(a, c)), 0.5);
    const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
    return (u) => {
      const t = lerp(t1, t2, u);
      const A1 = vl(p0, p1, (t - t0) / (t1 - t0 || 1)), A2 = vl(p1, p2, (t - t1) / (t2 - t1 || 1)), A3 = vl(p2, p3, (t - t2) / (t3 - t2 || 1));
      const B1 = vl(A1, A2, (t - t0) / (t2 - t0 || 1)), B2 = vl(A2, A3, (t - t1) / (t3 - t1 || 1));
      return vl(B1, B2, (t - t1) / (t2 - t1 || 1));
    };
  };
  const segs = []; for (let i = 0; i < P.length - 1; i++) segs.push(seg(i));
  const N = 240, table = new Float64Array(N + 1), pts = new Float64Array((N + 1) * 3);
  let len = 0, prev = P[0]; pts[0] = P[0][0]; pts[1] = P[0][1]; pts[2] = P[0][2];
  for (let k = 1; k <= N; k++) {
    const g = (k / N) * segs.length, i = Math.min(segs.length - 1, Math.floor(g)), p = segs[i](g - i);
    len += dist3(prev, p); table[k] = len; pts[k * 3] = p[0]; pts[k * 3 + 1] = p[1]; pts[k * 3 + 2] = p[2]; prev = p;
  }
  return {
    length: len,
    at(u, out) {
      const target = sat(u) * len;
      let lo = 0, hi = N; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (table[m] < target) lo = m; else hi = m; }
      const k = (target - table[lo]) / Math.max(1e-6, table[hi] - table[lo]);
      out[0] = lerp(pts[lo * 3], pts[hi * 3], k); out[1] = lerp(pts[lo * 3 + 1], pts[hi * 3 + 1], k); out[2] = lerp(pts[lo * 3 + 2], pts[hi * 3 + 2], k);
      return out;
    },
  };
}
const upper = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m + 1; else hi = m; } return lo; };

/* ---------------- the real data, parsed from the page */
const ts = (s) => { const m = /(\d\d):(\d\d):(\d\d)/.exec(s); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null; };
export function parseData(doc) {
  const txt = (id) => { const el = doc.getElementById(id); return el ? el.textContent : ''; };
  // the shop's guide
  const guide = txt('data-guide');
  const secs = [];
  let cur = null;
  guide.split('\n').forEach((line) => {
    const h = /^(#{2,3})\s+(.*)$/.exec(line.trim());
    if (h) { cur = { title: h[2].replace(/^Q:\s*/, ''), faq: /^Q:/.test(h[2]), body: '' }; secs.push(cur); return; }
    if (cur) cur.body += line + '\n';
  });
  const sections = secs.filter((s) => s.body.trim()).map((s, i) => ({ n: '§' + (i + 1), title: s.title, faq: s.faq, body: s.body, short: shortName(s.title) }));
  const prices = sections.find((s) => /^prices$/i.test(s.title));
  const row = (name) => { const r = prices && prices.body.split('\n').find((l) => l.toLowerCase().startsWith('| ' + name)); return r ? r.split('|').map((c) => c.trim()).filter(Boolean) : null; };
  const eur = (c) => (c ? +(/(\d+)/.exec(c) || [0, 0])[1] : 0);
  const trek = row('trekking e-bike'), city = row('city e-bike'), seat = row('child seat');
  const incl = prices ? (prices.body.split('\n').find((l) => /helmet/i.test(l)) || '').trim() : '';
  const quote = { bike: 'Trekking e-bike', duration: 'Full day', bikes: 2, seats: 1, trekDay: eur(trek && trek[3]) || 49, seatDay: eur(seat && seat[3]) || 8,
    trekHour: eur(trek && trek[1]) || 10, cityHour: eur(city && city[1]) || 8 };
  quote.bikesTotal = quote.bikes * quote.trekDay; quote.seatsTotal = quote.seats * quote.seatDay; quote.total = quote.bikesTotal + quote.seatsTotal;
  const citeIndex = Math.max(0, sections.indexOf(prices));

  // the scraper's run log
  const slog = txt('data-scraper-log').split('\n').map((l) => l.trim()).filter(Boolean);
  const t0 = ts(slog[0] || '') || 0;
  const logLines = slog.map((l) => ({ t: (ts(l) || t0) - t0, text: l.replace(/^\[\d\d:\d\d:\d\d\]\s*/, ''), stamp: (/^\[(\d\d:\d\d:\d\d)\]/.exec(l) || [0, ''])[1] }));
  const cats = [];
  logLines.forEach((l) => { const m = /^category (.+): (\d+) books?$/.exec(l.text); if (m) cats.push({ name: m[1], count: +m[2], t: l.t }); });
  const parsed = [[0, 0]];
  logLines.forEach((l) => { if (/^fetching \d+ book pages/.test(l.text)) parsed[0] = [l.t, 0]; const m = /^parsed (\d+)\/(\d+) books/.exec(l.text); if (m) parsed.push([l.t, +m[1]]); });
  const done = logLines.find((l) => /^done:/.test(l.text));
  const runEnd = done ? done.t : 59;
  const nums = done ? (/done: (\d+) books, (\d+) requests, (\d+) retries, (\d+) errors, (\d+) s/.exec(done.text) || []) : [];
  const run = { books: +nums[1] || 1000, requests: +nums[2] || 1081, retries: +(nums[3] || 0), errors: +(nums[4] || 0), seconds: +nums[5] || 59, end: runEnd };
  // which book lands when: the real "parsed N/1000" timestamps, books spread over the categories in proportion
  const total = cats.reduce((s, c) => s + c.count, 0) || 1;
  const filled = cats.map(() => 0);
  const bookCat = [], bookLvl = [], bookT = [];
  for (let k = 0; k < total; k++) {
    let best = 0, bestR = 2;
    cats.forEach((c, j) => { if (filled[j] >= c.count) return; const r = filled[j] / c.count; if (r < bestR - 1e-9) { bestR = r; best = j; } });
    bookCat.push(best); bookLvl.push(filled[best]++);
    let i = 1; while (i < parsed.length - 1 && parsed[i][1] < k + 1) i++;
    const [ta, na] = parsed[i - 1], [tb, nb] = parsed[Math.min(i, parsed.length - 1)];
    bookT.push(nb > na ? ta + ((k + 1 - na) / (nb - na)) * (tb - ta) : tb);
  }
  // sorted arrival times, for counting without scanning every frame
  const bookTs = Float64Array.from(bookT).sort(), catTs = Float64Array.from(cats.map((c) => c.t)).sort(), lineTs = Float64Array.from(logLines.map((l) => l.t));

  // the deploy and HTTPS logs
  const dlog = txt('data-deploy-log').split('\n').map((l) => l.trim()).filter(Boolean);
  const hlog = txt('data-https-log').split('\n').map((l) => l.trim()).filter(Boolean);
  const d0 = ts(dlog[0] || '') || 0;
  const steps = [];
  dlog.forEach((l) => { const m = /==\s*(\d)\/9\s+(.*)$/.exec(l); if (m) steps.push({ n: +m[1], name: m[2], t: ts(l) - d0 }); });
  const deployed = dlog.find((l) => /== Deployed/.test(l));
  const healthLines = hlog.filter((l) => /"ok":true/.test(l));
  const lastHealth = healthLines[healthLines.length - 1];
  const strip = (l) => l.replace(/^\[[^\]]*\]\s*/, '');
  const deploy = {
    steps,
    killT: (steps.find((s) => s.n === 9) || { t: 62 }).t,
    deployedT: deployed ? ts(deployed) - d0 : 67,
    httpsT: lastHealth ? ts(lastHealth) - d0 : 88,
    kill: strip(dlog.find((l) => /systemctl kill/.test(l)) || '$ systemctl kill -s KILL nordlight; sleep 5'),
    restarts: strip(dlog.find((l) => /NRestarts=/.test(l)) || 'NRestarts=1'),
    health: strip(dlog.find((l) => /"ok":true/.test(l)) || '{"ok":true}'),
  };
  return { sections, quote, citeIndex, incl, logLines, cats, run, books: { cat: bookCat, level: bookLvl, t: bookT }, bookTs, catTs, lineTs, deploy };
}
function shortName(t) {
  const map = [[/driving licen/i, 'Licence?'], [/another location/i, 'Return?'], [/guided tours/i, 'Tours?'], [/booking and payment/i, 'Booking'], [/cancellation/i, 'Cancel'], [/battery/i, 'Battery'], [/damage/i, 'Damage'], [/opening hours/i, 'Hours']];
  for (const [re, s] of map) if (re.test(t)) return s;
  return t.length > 12 ? t.slice(0, 11) + '…' : t;
}

/* ---------------- keyword routing: honest, simple, in the browser */
const KEYS = {
  booked: ['restaurant', 'restaurants', 'cafe', 'café', 'bar', 'pub', 'hotel', 'hotels', 'hostel', 'b&b', 'bnb', 'rental', 'rentals', 'rent', 'renting', 'booking', 'bookings', 'book', 'reservation', 'reservations', 'reserve', 'appointment', 'appointments', 'salon', 'barber', 'spa', 'clinic', 'dentist', 'gym', 'fitness', 'yoga', 'studio', 'tour', 'tours', 'class', 'classes', 'lesson', 'lessons', 'event', 'events', 'ticket', 'tickets', 'telegram', 'bike', 'bikes', 'car', 'cars', 'boat', 'boats', 'taxi', 'table', 'tables', 'schedule', 'calendar', 'camping', 'apartment', 'apartments', 'guesthouse'],
  measured: ['shop', 'shops', 'store', 'stores', 'ecommerce', 'e-commerce', 'online', 'sell', 'selling', 'sells', 'seller', 'sellers', 'price', 'prices', 'pricing', 'product', 'products', 'catalog', 'catalogue', 'competitor', 'competitors', 'data', 'scrape', 'scraping', 'scraper', 'lead', 'leads', 'research', 'marketplace', 'retail', 'wholesale', 'inventory', 'stock', 'listing', 'listings', 'records', 'vinyl', 'report', 'reports', 'excel', 'spreadsheet', 'spreadsheets', 'analytics', 'market'],
  answered: ['support', 'faq', 'faqs', 'question', 'questions', 'customer', 'customers', 'client', 'clients', 'service', 'help', 'helpdesk', 'chat', 'chatbot', 'chatbots', 'assistant', 'ai', 'agent', 'agents', 'document', 'documents', 'docs', 'pdf', 'pdfs', 'manual', 'manuals', 'email', 'emails', 'inbox', 'school', 'course', 'courses', 'training', 'legal', 'law', 'lawyer', 'insurance', 'consulting', 'consultancy', 'agency', 'info', 'information', 'answer', 'answers', 'guide', 'guides'],
  alwayson: ['app', 'apps', 'server', 'servers', 'saas', 'api', 'apis', 'backend', 'hosting', 'deploy', 'deployment', 'startup', 'platform', 'software', 'devops', 'linux', 'cloud', 'uptime', 'website', 'websites', 'vps', 'infrastructure'],
};
export function matchAnswer(text) {
  const words = String(text || '').toLowerCase().replace(/[^a-z0-9&\u00e0-\u00ff+-]+/g, ' ').split(' ').filter(Boolean);
  const score = {}, hits = {};
  IDS.forEach((id) => {
    const set = new Set();
    words.forEach((w) => { if (KEYS[id].includes(w)) set.add(w); });
    score[id] = set.size; hits[id] = [...set];
  });
  const byScore = IDS.slice().sort((a, c) => score[c] - score[a] || IDS.indexOf(a) - IDS.indexOf(c));
  const top = score[byScore[0]] > 0 ? byScore[0] : null;
  // the crash test is the climax: Always on is always the last act, even when it is the visitor's match
  const order = byScore.filter((id) => id !== 'alwayson').concat(['alwayson']);
  // quote the most specific words back ("rental" before "bike", "records" before "sell"), spelled the way the visitor typed them
  const picked = top ? hits[top].slice().sort((a, c) => c.length - a.length).slice(0, 2) : [];
  return { order, top, words: picked.map((w) => asTyped(String(text || ''), w)), answered: words.length > 0 };
}
function asTyped(text, w) {
  const re = new RegExp(`(^|[^a-z0-9\\u00e0-\\u00ff])(${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^a-z0-9\\u00e0-\\u00ff])`, 'i');
  const m = re.exec(text);
  return m ? m[2] : w;
}

/* ---------------- the film */
export function buildFilm(opts) {
  const { route, match, data, view, calm } = opts;
  const L = LAYOUT;
  const F = {}; IDS.forEach((id) => { F[id] = districtFrame(L, id); });
  const segs = [];
  let t = 0;
  segs.push({ id: 'plan', kind: 'plan', t0: t, dur: DUR.plan, end: t + DUR.plan }); t += DUR.plan;
  segs.push({ id: 'open', kind: 'open', t0: t, dur: DUR.open, end: t + DUR.open }); t += DUR.open;
  route.forEach((id, i) => { segs.push({ id, kind: 'station', t0: t, dur: DUR[id], end: t + DUR[id], index: i }); t += DUR[id]; });
  const finaleT = t;
  segs.push({ id: 'finale', kind: 'finale', t0: t, dur: 1e9, end: 1e9 });
  const segOf = {}; segs.forEach((s) => { segOf[s.id] = s; });
  const segAt = (T) => { for (let i = segs.length - 1; i >= 0; i--) if (T >= segs[i].t0) return segs[i]; return segs[0]; };

  /* cameras: district shots in polar coordinates around each district (a = 0 is the side facing the hub) */
  // each district is cut like a trailer: a few shots, each one smooth move [t, angle, radius, height, lookY, lookFwd, lookRight]
  const SHOTS = {
    answered: [
      [[3.0, 0, 134, 34, 26, -8, 0], [6.5, 14, 96, 27, 30, -10, -4]],
      [[6.5, -50, 50, 6, 42, -22, -30], [9.4, -64, 44, 9, 48, -22, -30]],
      [[9.4, 30, 100, 46, 22, -10, 0], [12.5, 22, 88, 40, 26, -10, 0], [15.0, 8, 142, 72, 26, -4, 0]],
    ],
    booked: [
      [[3.0, 4, 196, 44, 66, 4, 0], [7.5, 9, 150, 64, 70, 4, 0]],
      [[7.5, 6, 190, 62, 52, -6, -4], [11.5, -2, 196, 64, 50, -6, 4], [15.0, -10, 226, 92, 46, -4, 6]],
    ],
    measured: [
      [[3.0, 0, 122, 74, 0, -6, 0], [7.5, 16, 102, 60, 8, -6, 0]],
      [[7.5, 38, 74, 9, 30, -6, 0], [11.25, 50, 64, 7, 42, -6, 0]],
      [[11.25, 58, 100, 30, 45, -6, 0], [15.0, 72, 162, 92, 40, -6, 0]],
    ],
    alwayson: [
      [[3.0, -4, 142, 34, 36, 0, 0], [KILL, -22, 94, 26, 42, 0, 0]],
      [[KILL, -38, 250, 128, 26, 0, 0], [BACK, -44, 232, 118, 28, 0, 0], [DUR.alwayson, -56, 290, 176, 18, 0, 0]],
    ],
  };
  const HERO = { answered: 6.0, booked: 6.4, measured: 12.6, alwayson: 6.5 };  // the one framing the calm version holds
  const tracks = {};
  IDS.forEach((id) => { tracks[id] = SHOTS[id].map((keys) => ({ from: keys[0][0], fn: track(keys) })); });
  const shotTmp = [0, 0, 0, 0, 0, 0];
  const shotAt = (id, d) => { const list = tracks[id]; let s = list[0]; for (let i = 0; i < list.length; i++) if (d >= list[i].from) s = list[i]; return s.fn(d, shotTmp); };
  const PORTRAIT_R = { answered: 1.5, booked: 1.18, measured: 1.5, alwayson: 1.42 };
  function districtCam(id, d, out) {
    const f = F[id], pr = view.portrait, sr = pr ? PORTRAIT_R[id] || 1.5 : 1, sh = pr ? 1.2 : 1, sly = pr ? 1.06 : 1;
    const s = shotAt(id, calm ? HERO[id] : d);
    const ar = s[0] * Math.PI / 180, rr = s[1] * sr;
    set3(out.pos, f.c[0] + (f.F[0] * Math.cos(ar) + f.R[0] * Math.sin(ar)) * rr, s[2] * sh, f.c[1] + (f.F[1] * Math.cos(ar) + f.R[1] * Math.sin(ar)) * rr);
    set3(out.look, f.c[0] + f.F[0] * s[4] + f.R[0] * s[5], s[3] * sly, f.c[1] + f.F[1] * s[4] + f.R[1] * s[5]);
    return out;
  }
  function questionCam(q, out) {
    const R = view.portrait ? 820 : 660, H = view.portrait ? 230 : 170, a = 1.52 + (calm ? 0 : q * 0.028);
    set3(out.pos, Math.sin(a) * R, H, Math.cos(a) * R); set3(out.look, 0, view.portrait ? 40 : 58, 0);
    return out;
  }
  const overheadCam = () => (view.portrait ? { pos: [0, 1320, 420], look: [0, 0, 30] } : { pos: [0, 760, 330], look: [0, 0, 16] });
  const OVER = overheadCam();
  const qEnd = cam(); questionCam(0, qEnd);
  const first = route[0], dir1 = [-F[first].F[0], -F[first].F[1]];
  const OPEN_END = { pos: [L.hub[0] - dir1[0] * 70, 34, L.hub[1] - dir1[1] * 70], look: [L.hub[0] + dir1[0] * 140, 24, L.hub[1] + dir1[1] * 140] };

  const transits = {};
  const openRail = () => transits.open || (transits.open = railway([OVER.pos, [lerp(OVER.pos[0], OPEN_END.pos[0], 0.45), 300, lerp(OVER.pos[2], OPEN_END.pos[2], 0.45)], [L.hub[0] - dir1[0] * 170, 110, L.hub[1] - dir1[1] * 170], OPEN_END.pos]));
  // transits between districts, built once per route (they depend only on where the previous shot ends)
  function transitFor(i) {
    if (transits[i]) return transits[i];
    const id = route[i], f = F[id];
    const start = i === 0 ? OPEN_END : districtCam(route[i - 1], DUR[route[i - 1]], cam());
    const end = districtCam(id, TRANSIT, cam());
    const pts = [start.pos.slice()];
    if (i > 0) { const pf = F[route[i - 1]]; pts.push([pf.c[0] + pf.F[0] * 150, 44, pf.c[1] + pf.F[1] * 150]); }
    pts.push([L.hub[0], 32, L.hub[1]]);
    pts.push([f.c[0] + f.F[0] * 150, 30, f.c[1] + f.F[1] * 150]);
    pts.push(end.pos.slice());
    transits[i] = { rail: railway(pts), start: { pos: start.pos.slice(), look: start.look.slice() }, end };
    return transits[i];
  }
  const finFrom = cam(); districtCam(route[route.length - 1], DUR[route[route.length - 1]], finFrom);
  const finA0 = Math.atan2(finFrom.pos[0] - L.hub[0], finFrom.pos[2] - L.hub[1]);
  const FIN_STOP = 13;   // the finale's camera settles: after this the picture is still and the render loop can stop
  function finaleCam(d, out, from) {
    from = from || finFrom;
    const a0 = from === finFrom ? finA0 : Math.atan2(from.pos[0] - L.hub[0], from.pos[2] - L.hub[1]);
    const R = view.portrait ? 520 : 360, H = view.portrait ? 250 : 160;
    const A0 = FIN_STOP - 4, u = sat((d - A0) / 4), dd = d < A0 ? d : A0 + 4 * (u - u * u / 2);   // the slow orbit eases to a stop
    const a = a0 + (calm ? 0 : dd * 0.022);
    const wx = L.hub[0] + Math.sin(a) * R, wz = L.hub[1] + Math.cos(a) * R;
    if (calm) { set3(out.pos, wx, H, wz); set3(out.look, L.hub[0], 70, L.hub[1]); return out; }
    const k = smoother(d / 3.6), kl = smoother(d / 2.6);
    set3(out.pos, lerp(from.pos[0], wx, k), lerp(from.pos[1], H, k) + Math.sin(k * Math.PI) * 40, lerp(from.pos[2], wz, k));
    set3(out.look, lerp(from.look[0], L.hub[0], kl), lerp(from.look[1], 70, kl), lerp(from.look[2], L.hub[1], kl));
    return out;
  }

  /* ---------------- the score: a synthwave arrangement on the film's bar grid (written and played by audio.js) */
  const music = score({ segs, route, finaleT, DUR, KILL, CRASH, BACK });

  /* ---------------- subtitles (the source of truth) and what the browser voice reads (never the visitor's words) */
  const subs = [];
  const sub = (tt, text, say) => subs.push({ t: tt, text, say: say === undefined ? text : say, d: 0 });
  const NEXT = { answered: 'the questions your customers ask', booked: 'your bookings', measured: 'your data', alwayson: 'the server that stays on' };
  if (match.top === 'alwayson') sub(0.3, `You said “${match.words.join('”, “')}”. Then stay for the last one: it crashes on purpose.`, 'Then stay for the last one. It crashes on purpose.');
  else if (match.top) sub(0.3, `You said “${match.words.join('”, “')}”. So we start with ${NEXT[match.top]}.`, `So we start with ${NEXT[match.top]}.`);
  else sub(0.3, match.answered ? 'No keyword matched, so here is the standard route.' : 'No answer? Here is the standard route.');
  sub(DUR.plan + 0.15, 'Eros C. builds software for businesses. Four demos. All real.');
  segs.filter((s) => s.kind === 'station').forEach((s) => {
    const T0 = s.t0;
    if (s.id === 'answered') {
      sub(T0 + 3.2, 'Your customers ask. The assistant answers only from your own guide, and shows the section it used.');
      sub(T0 + b(5, 1), 'Not in the guide? It hands off to your staff instead of guessing.');
    }
    if (s.id === 'booked') {
      sub(T0 + 3.2, 'Your customers book inside Telegram: a bike, a day, a child seat. The quote is instant.');
      sub(T0 + b(5), 'The server checks the prices, saves the booking, and messages the owner.');
    }
    if (s.id === 'measured') {
      sub(T0 + 3.2, `Need data? A scraper reads a whole public catalog: ${data.run.books.toLocaleString('en-US')} books.`, 'Need data? A scraper reads a whole public catalog. One thousand books.');
      sub(T0 + RUN_B + 0.05, `${data.run.seconds} seconds, ${data.run.errors} errors, straight to Excel.`, `${spell(data.run.seconds)} seconds. ${spell(data.run.errors)} errors. Straight to Excel.`);   // said when the replay reaches them
    }
    if (s.id === 'alwayson') {
      sub(T0 + 3.0, 'One script turns a fresh server into your live app.');
      sub(T0 + KILL + 0.15, 'Crash test: the app is killed on purpose.');
      sub(T0 + BACK + 0.25, 'Back by itself. Live on HTTPS.', 'Back by itself. Live on H T T P S.');
    }
  });
  sub(finaleT + 0.05, 'Answered. Booked. Measured. Always on.');
  sub(finaleT + 3.85, 'Four demos, all real. Let’s build yours.');
  // how long each line stays: until the next one, at most what reading needs
  subs.forEach((s, i) => {   // a line stays until the next one, at most what reading needs, and never into the next scene
    const nx = subs[i + 1] ? subs[i + 1].t : s.t + 8, sg = segAt(s.t), need = Math.max(2.6, s.text.split(/\s+/).length / 2.5 + 0.9);
    s.d = Math.min(need, nx - s.t - 0.1, sg.end - s.t - 0.15); s.room = Math.min(nx, sg.end) - s.t;
  });

  /* ---------------- DOM windows: [key, segment, from, to] in segment time (beats where it matters) */
  const dom = [
    ['plan-echo', 'plan', 0.2, DUR.plan - 0.3], ['plan-match', 'plan', 0.85, DUR.plan - 0.3], ['plan-route', 'plan', 1.6, DUR.plan - 0.3], ['plan-pins', 'plan', 1.4, DUR.plan - 0.2],
    ['open-name', 'open', 0.0, b(1, 2) - 0.1], ['open-four', 'open', b(1, 2), DUR.open - 0.15], ['open-real', 'open', b(2), DUR.open - 0.15],
    ['f-words', 'finale', 0.0, 1e9], ['f-hire', 'finale', b(2), 1e9], ['f-you', 'finale', b(2, 2), 1e9], ['f-hon', 'finale', b(3), 1e9],
  ];
  IDS.forEach((id) => {
    const D = DUR[id];
    // Always on: the stack line waits until the big "Back by itself" title has left (it would print under it on laptop windows)
    dom.push([`title-${id}`, id, 0.0, 2.75], [`lower-${id}`, id, 3.0, D - 0.2], [`stack-${id}`, id, id === 'alwayson' ? BACK + 2.2 : b(6), D - 0.2]);
  });
  dom.push(['a-q1', 'answered', b(2), b(5) - 0.1], ['a-search', 'answered', b(2, 2), b(3, 2) - 0.05], ['a-a1', 'answered', b(3, 2), b(5) - 0.1], ['a-q2', 'answered', b(5), 14.8], ['a-miss', 'answered', b(5, 2), 14.8]);
  dom.push(['b-quote', 'booked', b(2, 1.5), b(5, 2) - 0.1], ['b-t1', 'booked', b(2, 2), 1e3], ['b-t2', 'booked', b(3), 1e3], ['b-t3', 'booked', b(3, 1), 1e3], ['b-sum', 'booked', b(3, 2), 1e3],
    ['b-checks', 'booked', b(4), 14.8], ['b-owner', 'booked', b(5, 2), 14.8]);
  dom.push(['m-count', 'measured', b(2) - 0.15, 14.8], ['m-term', 'measured', b(2) - 0.15, 14.8], ['m-files', 'measured', b(6), 14.8]);
  dom.push(['o-steps', 'alwayson', 3.0, KILL], ['o-crash', 'alwayson', KILL, BACK], ['o-cd', 'alwayson', KILL, BACK], ['o-backbig', 'alwayson', BACK, BACK + 2.2],
    ['o-back', 'alwayson', BACK + 2.2, DUR.alwayson - 0.2], ['o-stats', 'alwayson', BACK + b(0, 2), DUR.alwayson - 0.2]);
  const CHECKS = [b(4, 2), b(4, 3), b(5)];   // Booked: server checks, beat by beat

  /* ---------------- progressive numbers for the DOM (binary searches over sorted arrays: no scanning) */
  const runT = (d) => (d < RUN_A ? -1 : lerp(0, data.run.end, sat((d - RUN_A) / (RUN_B - RUN_A))));
  // the 3D books keep the replay's speed past the end of the run, so the last ones land instead of hovering mid-air
  const runT3d = (d) => (d < RUN_A ? -1 : ((d - RUN_A) / (RUN_B - RUN_A)) * data.run.end);
  const M = { rt: -1, books: 0, requests: 0, seconds: 0, lines: 0 };
  function measured(d) {
    const rt = runT(d); M.rt = rt;
    if (rt < 0) { M.books = 0; M.requests = 0; M.seconds = 0; M.lines = 0; return M; }
    const books = upper(data.bookTs, rt), catsSeen = upper(data.catTs, rt);
    const listReq = data.run.requests - data.run.books;
    M.books = books; M.seconds = Math.floor(rt); M.lines = upper(data.lineTs, rt);
    M.requests = rt >= data.run.end ? data.run.requests : Math.min(data.run.requests, 1 + Math.round((catsSeen / Math.max(1, data.cats.length)) * (listReq - 1)) + books);
    return M;
  }
  const DEP_A = 3.0, DEP_B = KILL, HTTPS_B = BACK + 2.4;
  const A = { elapsed: 0, stepsDone: 0, current: 0, countdown: 0 };
  function alwayson(d) {
    const dp = data.deploy;
    let el;
    if (d < DEP_A) el = 0;
    else if (d < DEP_B) el = lerp(0, dp.killT, (d - DEP_A) / (DEP_B - DEP_A));
    else if (d < BACK) el = dp.killT + (d - DEP_B);
    else el = Math.min(dp.httpsT, lerp(dp.deployedT, dp.httpsT, sat((d - BACK) / (HTTPS_B - BACK))));
    let done = 0; for (let i = 0; i < dp.steps.length - 1; i++) if (el >= dp.steps[i + 1].t) done = i + 1;
    if (d >= BACK) done = dp.steps.length;
    A.elapsed = Math.floor(el); A.stepsDone = done; A.current = Math.min(dp.steps.length - 1, done);
    A.countdown = d >= KILL && d < BACK ? Math.ceil(BACK - d - 1e-6) : 0;
    return A;
  }

  /* ---------------- the world state at film time T (one object, rewritten every frame) */
  const nSec = data.sections.length;
  const S = {
    time: 0, seg: null, d: 0, cam: { pos: [0, 0, 0], look: [0, 0, 0], fov: 46, roll: 0, shift: [0, 0] },
    power: { outR: 0, inR: 0, global: 1, sky: 1 }, trails: 1, motes: 1,
    beacons: [0, 0, 0, 0, 0], dglow: [0.6, 0.6, 0.6, 0.6, 0.2], route: 0, routeOn: 0,
    bill: { answered: 0, booked: 0, measured: 0, alwayson: 0 }, load: { answered: false, booked: false, measured: false, alwayson: false },
    video: -1,   // the Mini App recording's time in the giant phone (-1: not playing)
    ans: { act: new Float32Array(nSec), dim: 0, miss: 0, cite: 0, link: 0, orb: 0, sweep: 0, sweepOn: 0, labels: 1, others: 1 },
    book: { step: 0, pA: 0, pB: 0, owner: 0, bob: 1, glow: 0, server: 0.5, serverHot: 0, scr: 1 },
    meas: { runT: -1, rain: 0, crown: 0 },
    plant: { steps: 0, core: 1, crash: 0, alarm: 0, https: 0, label: 0.6 },
    yours: { on: 0, build: 0, label: 0 },
    post: { bloom: 1.1, thr: 0.5, grain: 0.045, ca: 0.02, vig: 1, exposure: 1 },
    black: 0, dim: 0, shake: 0, still: false,
  };
  const baseFov = () => { const a = view.aspect; return a >= 1 ? 46 : lerp(46, 74, sat((1 - a) / 0.56)); };

  // where the subject sits on screen, clear of the text (desktop: left of the cards; phones: between header and cards)
  const SHIFT = { question: [-0.15, 0.02, 0, 0.22], plan: [-0.1, -0.1, 0, -0.08], station: [0.07, 0.02, 0, 0.08], finale: [0, 0.04, 0, 0.02],
    answered: [0.07, 0.02, 0, 0.08], booked: [0.07, 0.02, 0, 0.08], measured: [-0.04, 0.02, 0, 0.06], alwayson: [0.03, 0.02, 0, 0.08] };
  // phones held sideways (view.side): the two text columns leave a band in the middle, and the Booked phone stands in it
  const SIDE = { booked: [0, -0.05] };
  const shiftInto = (out, k, amt) => {
    const s = SHIFT[k], m = amt == null ? 1 : amt;
    if (view.portrait) { out[0] = s[2] * m; out[1] = s[3] * m; } else if (view.side && SIDE[k]) { out[0] = SIDE[k][0] * m; out[1] = SIDE[k][1] * m; } else { out[0] = s[0] * m; out[1] = s[1] * m; }
    return out;
  };
  const shA = [0, 0], shB = [0, 0];
  const seenEnd = (id) => (segOf[id] ? segOf[id].end : 1e9);
  function resetWorld(T) {
    S.power.outR = 0; S.power.inR = 0; S.power.global = 1; S.power.sky = 1; S.trails = 1; S.motes = calm ? 0.5 : 1;
    for (let i = 0; i < 4; i++) { S.beacons[i] = 0.55; S.dglow[i] = 0.55; }
    S.beacons[4] = 0; S.dglow[4] = 0.18;
    S.route = 0; S.routeOn = 0; S.video = -1;
    for (let i = 0; i < 4; i++) { S.bill[IDS[i]] = 0; S.load[IDS[i]] = false; }
    const a = S.ans; a.act.fill(0.12); a.dim = 0; a.miss = 0; a.cite = 0; a.link = 0; a.orb = 0.6; a.sweep = 0; a.sweepOn = 0; a.labels = 0.9; a.others = 1;
    const bk = S.book; bk.pA = 0; bk.pB = 0; bk.glow = 0; bk.server = 0.5; bk.serverHot = 0; bk.bob = calm ? 0 : 1; bk.scr = 1;
    S.meas.runT = -1; S.meas.rain = 0; S.meas.crown = 0;
    const p = S.plant; p.steps = 0; p.core = 1; p.crash = 0; p.alarm = 0; p.https = 0; p.label = 0.5;
    S.yours.on = 0; S.yours.build = 0; S.yours.label = 0;
    // what each district looks like after its own scene has played (seen again from the finale)
    const sb = T >= seenEnd('booked');
    bk.step = sb ? 6 : 0; bk.owner = sb ? 1 : 0;
    if (T >= seenEnd('measured')) { S.meas.runT = 999; S.meas.crown = 0.8; }
    if (T >= seenEnd('alwayson')) p.steps = 9;
    S.black = 0; S.dim = 0; S.shake = 0; S.still = false;
    const po = S.post; po.bloom = 1.15; po.thr = 0.5; po.grain = calm ? 0.03 : 0.045; po.ca = calm ? 0.008 : 0.02; po.vig = 1; po.exposure = 1;
  }

  const tmpA = [0, 0, 0], tmpB = [0, 0, 0], camTmp = cam();
  function stationState(s, d) {
    const id = s.id, D = s.dur, idx = IDS.indexOf(id);
    S.beacons[idx] = 0.25 + 0.5 * (1 - smooth(2.6, 4.0, d)); S.dglow[idx] = 1;
    S.bill[id] = win(d, 2.4, 7.2, 1.2, 1.4);  // a glimpse of the real recording on the approach
    S.load[id] = true;
    const nxt = route[s.index + 1]; if (nxt && d > 7) S.load[nxt] = true;
    // the title card dims the city; the transit flies under it
    S.dim = calm ? win(d, 0.0, 2.9, 0.4, 0.5) * 0.55 : win(d, 0.0, 2.85, 0.08, 0.5) * 0.5;
    if (calm) S.black = 1 - smooth(0.0, 0.9, d) + smooth(D - 0.7, D, d);
    if (!calm && d < TRANSIT) {
      const tr = transitFor(s.index);
      const k = easeIO(d / TRANSIT);
      tr.rail.at(k, S.cam.pos);
      tr.rail.at(Math.min(1, k + 0.06), tmpA);
      lerp3(S.cam.look, tr.start.look, tmpA, smooth(0, 0.18, k));
      lerp3(S.cam.look, S.cam.look, tr.end.look, smooth(0.62, 1, k));
      tr.rail.at(Math.min(1, k + 0.02), tmpA); tr.rail.at(Math.min(1, k + 0.05), tmpB);
      const t1x = tmpA[0] - S.cam.pos[0], t1z = tmpA[2] - S.cam.pos[2], t2x = tmpB[0] - tmpA[0], t2z = tmpB[2] - tmpA[2];
      const cross = (t1x * t2z - t1z * t2x) / Math.max(1e-3, Math.hypot(t1x, t1z) * Math.hypot(t2x, t2z));
      S.cam.roll = clamp(-cross * 2.2, -0.2, 0.2) * Math.sin(Math.PI * k);
      S.cam.fov = baseFov() + 10 * Math.sin(Math.PI * k);
      S.post.ca = 0.02 + 0.05 * Math.sin(Math.PI * k);
    } else {
      districtCam(id, d, camTmp); copy3(S.cam.pos, camTmp.pos); copy3(S.cam.look, camTmp.look);
      S.cam.roll = 0; S.cam.fov = baseFov();
    }
    shiftInto(S.cam.shift, id, calm ? 1 : smooth(2.3, 3.0, d));
    if (!calm) S.shake = Math.max(0, 1 - d / 0.6) * 0.9;

    if (id === 'answered') {
      const a = S.ans;
      a.orb = smooth(b(2) - 0.2, b(2) + 0.3, d);
      a.sweepOn = win(d, b(2, 2), b(3, 2), 0.2, 0.3) + win(d, b(5, 1), b(5, 3), 0.2, 0.3) * 0.8;
      const phi = d < b(5) ? lerp(-95, 95, sat((d - b(2, 2)) / (b(3, 2) - b(2, 2)))) : lerp(-95, 95, sat((d - b(5, 1)) / BEAT / 2));
      a.sweep = phi * Math.PI / 180;
      for (let k = 0; k < nSec; k++) {
        const pk = -78 + (156 * k) / (nSec - 1);
        a.act[k] = 0.12 + Math.exp(-Math.pow((pk - phi) / 13, 2)) * a.sweepOn * 0.7;
      }
      const cite = smooth(b(3, 2) - 0.1, b(3, 2) + 0.35, d) * (1 - smooth(b(5) - 0.4, b(5), d));
      a.cite = cite; a.link = cite;
      a.act[data.citeIndex] = Math.max(a.act[data.citeIndex], cite);
      a.dim = cite * 0.6;
      a.miss = smooth(b(5, 2), b(5, 2) + 0.4, d) * (1 - smooth(D - 0.6, D, d));
      if (a.miss > 0) for (let k = 0; k < nSec; k++) a.act[k] *= 1 - a.miss * 0.6;
      a.labels = 0.9 * (1 - 0.45 * smooth(2.6, 3.4, d));   // the 3D labels step back behind the lower third
      a.others = view.portrait ? 1 - 0.85 * smooth(2.6, 3.4, d) : 1;   // portrait: the lower third sits over them, so only the cited one stays
    } else if (id === 'booked') {
      const bk = S.book;
      bk.scr = 0.1 + 0.9 * smooth(2.55, 3.35, d);   // the giant phone's screen stays dark behind the title card, then wakes as the card leaves
      const v = d - VIDEO_AT;
      S.video = v >= 0 ? v : 0;
      // the canvas replica (shown until the recording can play) follows the same steps as the recording
      bk.step = v < 1.4 ? 0 : v < 2.0 ? 1 : v < 3.0 ? 2 : v < 4.0 ? 3 : v < 5.0 ? 4 : v < 6.4 ? 5 : 6;
      bk.pA = d > b(4) && d < b(4) + 1.1 ? (d - b(4)) / 1.1 : 0;
      bk.pB = d > b(5, 2) - 0.7 && d < b(5, 2) ? (d - b(5, 2) + 0.7) / 0.7 : 0;
      bk.server = 0.5 + 0.5 * smooth(b(4), b(4) + 0.4, d); bk.serverHot = win(d, b(4, 1), b(5, 1), 0.2, 0.6);
      bk.owner = smooth(b(5, 2) - 0.1, b(5, 2) + 0.2, d);
      bk.glow = win(d, b(4) - 0.1, b(4, 2), 0.1, 0.6);
    } else if (id === 'measured') {
      const m = S.meas;
      m.runT = runT3d(d);
      m.rain = win(d, RUN_A + 0.25, RUN_B + 0.6, 0.6, 0.6);
      m.crown = smooth(RUN_B, RUN_B + 0.8, d);
    } else if (id === 'alwayson') {
      const p = S.plant, al = alwayson(d);
      p.label = 0.5 + 0.5 * smooth(3, 4, d);
      const stepsF = d < DEP_A ? 0 : d < DEP_B ? lerp(0, 8, smooth(DEP_A, DEP_B, d)) : d < BACK ? 8 : 9;
      p.steps = Math.max(stepsF, Math.min(8, al.stepsDone));
      const killK = smooth(KILL, KILL + 0.4, d), back = smooth(BACK, BACK + 0.6, d);
      p.core = 1 - killK + back;
      p.crash = killK * (1 - back);
      p.alarm = calm ? killK * (1 - back) * 0.6 : killK * (1 - back) * (0.55 + 0.45 * Math.cos((d - KILL) * Math.PI * 2));  // 1 Hz: well under 3 flashes a second
      p.https = smooth(BACK + 1.1, BACK + 1.8, d);
      // the blackout spreads from the plant across the city, then the relight wave comes back from it
      S.power.outR = calm ? (d > KILL ? 4000 * smooth(KILL, KILL + 1.6, d) : 0) : (d > KILL ? lerp(0, 2600, sat((d - KILL) / 1.1)) : 0);
      S.power.inR = d > BACK ? lerp(0, 2800, sat((d - BACK) / (calm ? 2.6 : 1.6))) : 0;
      if (calm && d > BACK) { S.power.outR = 4000 * (1 - smooth(BACK, BACK + 1.6, d)); S.power.inR = 0; }
      S.power.sky = 1 - 0.8 * p.crash;
      S.trails = 1 - 0.9 * p.crash;
      S.post.bloom = 1.15 + 0.25 * back * (1 - smooth(BACK + 0.5, BACK + 2, d));
      if (!calm && d >= BACK) S.shake = Math.max(S.shake, Math.max(0, 1 - (d - BACK) / 0.7) * 1.1);
      if (!calm && d >= KILL && d < KILL + 0.4) S.shake = Math.max(S.shake, (1 - (d - KILL) / 0.4) * 0.7);
      S.beacons[3] = 0.3 * (1 - p.crash);
      S.bill[id] *= 1 - p.crash;
    }
  }

  function state(T, wall) {
    resetWorld(T);
    S.time = wall;
    if (T < 0) T = 0;   // the film waits for the music's next eighth note
    const s = segAt(T), d = T - s.t0;
    S.seg = s; S.d = d;
    if (s.kind === 'plan') {
      const k = smoother(d / 2.0);
      lerp3(S.cam.pos, qEnd.pos, OVER.pos, k); S.cam.pos[1] += Math.sin(k * Math.PI) * 60;
      const push = calm ? 0 : smooth(2.0, DUR.plan, d) * 50;
      if (calm) { copy3(S.cam.pos, OVER.pos); copy3(S.cam.look, OVER.look); }
      else { S.cam.pos[1] -= push; S.cam.pos[2] -= push * 0.3; lerp3(S.cam.look, qEnd.look, OVER.look, smoother(d / 1.6)); }
      S.cam.fov = baseFov(); S.cam.roll = 0;
      shiftInto(shA, 'question'); shiftInto(shB, 'plan'); const kk = calm ? 1 : smoother(d / 2.0);
      S.cam.shift[0] = lerp(shA[0], shB[0], kk); S.cam.shift[1] = lerp(shA[1], shB[1], kk);
      S.route = smooth(1.4, 3.9, d); S.routeOn = 1 - smooth(DUR.plan - 0.7, DUR.plan, d);
      for (let i = 0; i < 4; i++) { const r = route.indexOf(IDS[i]); S.beacons[i] = 0.5 + 0.5 * smooth(1.6 + r * 0.6, 2.1 + r * 0.6, d); S.dglow[i] = 0.8; }
      S.beacons[4] = 0.15; S.dglow[4] = 0.4;
      S.load[route[0]] = true;
      if (calm) S.black = 1 - smooth(0, 0.8, d) + smooth(DUR.plan - 0.6, DUR.plan, d);
    } else if (s.kind === 'open') {
      if (calm) { copy3(S.cam.pos, OPEN_END.pos); copy3(S.cam.look, OPEN_END.look); S.black = 1 - smooth(0, 0.8, d) + smooth(DUR.open - 0.6, DUR.open, d); }
      else {
        const rail = openRail();
        // the dive starts on the hit: fast out of the sky, easing into the street
        const u = sat(d / DUR.open), k = (1 - Math.pow(1 - u, 2.4)) * smooth(0, 0.06, u) + u * (1 - smooth(0, 0.06, u)) * 0.5;
        rail.at(k, S.cam.pos);
        lerp3(S.cam.look, OVER.look, OPEN_END.look, smooth(0.08, 0.85, k));
        S.cam.fov = baseFov() + 10 * Math.sin(Math.PI * Math.min(1, k * 1.2));
        S.shake = Math.max(0, 1 - d / 0.7) * 0.7 + Math.max(0, 1 - Math.abs(d - b(2)) / 0.4) * 0.35;
        shiftInto(S.cam.shift, 'plan', 1 - smooth(0, 1.2, d));
      }
      S.dim = win(d, 0.0, DUR.open - 0.1, 0.2, 0.5) * 0.38;
      for (let i = 0; i < 4; i++) S.beacons[i] = IDS[i] === route[0] ? 0.9 : 0.45;
      S.beacons[4] = 0;
      S.load[route[0]] = true;
    } else if (s.kind === 'station') {
      stationState(s, d);
    } else {
      finaleCam(d, camTmp); copy3(S.cam.pos, camTmp.pos); copy3(S.cam.look, camTmp.look); S.cam.fov = baseFov(); S.cam.roll = 0;
      shiftInto(shA, route[route.length - 1]); shiftInto(shB, 'finale'); const kf = calm ? 1 : smoother(d / 3.0);
      S.cam.shift[0] = lerp(shA[0], shB[0], kf); S.cam.shift[1] = lerp(shA[1], shB[1], kf);
      for (let i = 0; i < 4; i++) { S.beacons[i] = 0.25 + 0.75 * smooth(i * BEAT * 2, i * BEAT * 2 + 0.3, d); S.dglow[i] = 0.9; }
      S.beacons[4] = smooth(b(2) - 0.2, b(2) + 0.6, d); S.dglow[4] = smooth(b(2) - 0.2, b(2) + 0.8, d) * 1.2;
      S.yours.on = smooth(b(2) - 0.6, b(2), d); S.yours.build = smooth(b(2) - 0.2, b(2) + 4.2, d); S.yours.label = smooth(b(2) + 3.2, b(2) + 4.2, d);
      S.dim = smooth(0.0, 1.0, d) * 0.3 + smooth(b(2) - 0.3, b(2) + 0.7, d) * 0.15;
      if (calm) S.black = 1 - smooth(0, 0.9, d);
      S.post.bloom = 1.15 + 0.35 * win(d, b(2), b(2) + 2.6, 0.15, 1.6);
      if (!calm) S.shake = Math.max(0, 1 - Math.abs(d - b(2)) / 0.5) * 0.8 * (d >= b(2) ? 1 : 0);
      S.still = d > FIN_STOP + 0.2;
    }
    if (S.shake > 0 && !calm) {
      const a = S.shake;
      S.cam.pos[0] += Math.sin(wall * 41) * a * 0.5; S.cam.pos[1] += Math.sin(wall * 37 + 1) * a * 0.5; S.cam.pos[2] += Math.sin(wall * 43 + 2) * a * 0.5;
    }
    return S;
  }

  function questionState(q, wall) {
    resetWorld(-1);
    S.time = wall;
    questionCam(q, qEnd); copy3(S.cam.pos, qEnd.pos); copy3(S.cam.look, qEnd.look);
    S.cam.fov = baseFov(); S.cam.roll = 0; shiftInto(S.cam.shift, 'question');
    for (let i = 0; i < 4; i++) { S.beacons[i] = 0.7; S.dglow[i] = 0.7; }
    S.beacons[4] = 0.1; S.dglow[4] = 0.2;
    S.seg = null; S.d = 0; S.dim = 0.25;
    return S;
  }

  // every place this route's camera can be, so the city can keep those spots clear of towers (load time only)
  function samples(o, push) {
    if (o.shots) IDS.forEach((id) => { for (let d = TRANSIT; d <= DUR[id] + 1e-6; d += 0.25) push(districtCam(id, d, cam()).pos); });
    (o.transits || []).forEach((i) => { const tr = transitFor(i); for (let k = 0; k <= 80; k++) push(tr.rail.at(k / 80, [0, 0, 0])); });
    if (o.open) { const rail = openRail(); for (let k = 0; k <= 60; k++) push(rail.at(k / 60, [0, 0, 0])); }
    if (o.finale) for (let d = 0; d <= 3.8; d += 0.2) push(finaleCam(d, cam()).pos);
    if (o.rings) {
      for (let k = 0; k < 96; k++) { const a = (k / 96) * Math.PI * 2; push(finaleCam(1e3, cam(), { pos: [Math.sin(a), 0, Math.cos(a)], look: [0, 0, 0] }).pos); }
      for (let q = 0; q < 240; q += 1.5) push(questionCam(q, cam()).pos);
    }
  }

  return { segs, finaleT, segAt, state, questionState, subs, music, dom, measured, alwayson, route, match, samples, checks: CHECKS, runFactor: Math.round(data.run.end / (RUN_B - RUN_A)), finStop: FIN_STOP, setQEnd: (c) => { copy3(qEnd.pos, c.pos); copy3(qEnd.look, c.look); } };
}

function spell(n) {
  const w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  if (n < 20) return w[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + w[n % 10] : '');
  return String(n);
}

/* the camera's keep-out list for the city: every rail, both screen orientations, every pair of districts */
export function cameraKeepOut(data) {
  const cells = new Map();  // 3-unit cells, lowest camera height in each
  const push = (p) => { const k = Math.round(p[0] / 3) * 4096 + Math.round(p[2] / 3); const y = cells.get(k); if (y === undefined || p[1] < y) cells.set(k, p[1]); };
  const match = { order: IDS.slice(), top: null, words: [], answered: false };
  const rest = (...ids) => ids.concat(IDS.filter((x) => !ids.includes(x) && x !== 'alwayson')).concat(ids.includes('alwayson') ? [] : ['alwayson']);
  for (const portrait of [false, true]) {
    const view = { aspect: portrait ? 0.46 : 1.6, portrait };
    const film = (route, calm) => buildFilm({ route, match, data, view, calm: !!calm });
    film(IDS.slice()).samples({ shots: true, rings: true }, push);
    film(IDS.slice(), true).samples({ shots: true, rings: true }, push);
    IDS.forEach((a) => {
      if (a !== 'alwayson') film(rest(a)).samples({ open: true, transits: [0] }, push);
      IDS.forEach((c) => { if (a !== c && a !== 'alwayson' && c !== 'alwayson') film(rest(a, c)).samples({ transits: [1, 2, 3], finale: true }, push); });
    });
  }
  const out = new Float32Array(cells.size * 3); let i = 0;
  cells.forEach((y, k) => { const x = Math.floor((k + 2048) / 4096); out[i++] = x * 3; out[i++] = y; out[i++] = (k - x * 4096) * 3; });
  return out;
}

export function districtFrame(layout, id) {
  const c = layout[id], hub = layout.hub;
  const dx = hub[0] - c[0], dz = hub[1] - c[1], len = Math.hypot(dx, dz);
  const F = [dx / len, dz / len];
  return { c, F, R: [-F[1], F[0]], dist: len };
}
