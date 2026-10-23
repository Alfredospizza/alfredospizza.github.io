/* Full experience · "Night flight over the data city".
   Loaded only after the visitor clicks the invite (see the end of app.js). three.js comes from jsDelivr after that,
   and only when this browser can actually run WebGL.
   Honest by construction: the film replays the page's own demo data and the real recordings; the opening question is
   matched to the demos by keyword in the browser; the narrator is the browser's built-in voice; the music is
   generated here; the hire buttons are read from the page. */
import { createAudio, BAR, BEAT } from './audio.js';
const frameWait = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(() => setTimeout(go, 0)); setTimeout(go, 120); });   // one painted frame (or 120 ms when hidden)
import { buildFilm, parseData, matchAnswer, cameraKeepOut, LAYOUT, IDS, NAMES, KILL, BACK, DUR } from './film.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
const HERE = new URL('./', import.meta.url).href;
const QUESTION_WAIT = 12;
const COLD = [0.25, 1.3, 2.5];   // cold open: first line, second line, the question
const TIER_ORDER = ['minimal', 'low', 'medium', 'high'];
const TEST = () => window.__xpTest === true;   // automated checks switch the test hooks on; visitors never do

const ST = {
  answered: { n: '01', service: 'AI chatbots & agents', price: 'from $100', kicker: 'AI chatbot (RAG) · a fictional e-bike rental shop', head: 'Built to quote your guide or hand off, <span class="hl">not to guess.</span>', stack: 'Python · FastAPI · Claude API · BM25 retrieval · daily cap on AI calls · 15 automated tests', honest: 'Replayed with the shop’s real guide. In the real assistant, Claude writes the reply from the section it finds; no AI model runs in this film.', poster: 'chatbot-poster.jpg', bill: 'chatbot-demo.jpg', video: 'chatbot.mp4' },
  booked: { n: '02', service: 'Telegram bots & Mini Apps', price: 'from $80', kicker: 'Telegram bot + Mini App · the same shop', head: 'Book a bike without leaving <span class="tg">Telegram</span>.', stack: 'Python · python-telegram-bot · FastAPI · SQLite · /mybookings', honest: 'The phone shows a replica of the Mini App’s screens; the quote uses the guide’s prices. Nothing is booked or sent.', honestLive: 'The phone plays the real recording of the Mini App; the quote uses the guide’s prices. Nothing is booked or sent.', honestFlat: 'The quote uses the guide’s prices. Nothing is booked or sent.', poster: 'telegram-poster.jpg', bill: 'telegram-features.jpg', video: 'telegram.mp4' },
  measured: { n: '03', service: 'Web scraping & data pipelines', price: 'from $55', kicker: 'Python scraper · books.toscrape.com, a public practice catalog', head: '<span class="hl">1,000</span> products to Excel in 59&nbsp;seconds.', stack: 'Python · httpx async · selectolax · openpyxl · SQLite with price history', honest: '', poster: 'scraper-poster.jpg', bill: 'scraper-pipeline.jpg', video: 'scraper.mp4' },
  alwayson: { n: '04', service: 'Linux VPS deployment', price: 'from $65', kicker: 'Linux VPS deploy · a fresh Ubuntu 24.04 machine', head: 'Fresh server. <span class="red">Crash test.</span> Live HTTPS.', stack: 'Bash · systemd · Nginx · daily backups with integrity check · secrets in a protected file', honest: 'The real deploy log, sped up. The crash test plays at real speed.', poster: 'deploy-poster.jpg', bill: 'deploy-setup.jpg', video: 'deploy.mp4' },
};
const ICON = {
  cc: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M16.5 10.2a2.2 2.2 0 1 0 0 3.6"/>',
  voice: '<path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z"/><path d="M8 9.5h8M8 12h5"/>',
  sound: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>',
  muted: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="3"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
  skip: '<path d="M5 6l8.5 6L5 18z" fill="currentColor"/><path d="M17.5 6v12" stroke-width="2.4"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
};
const svg = (k, extra) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"${extra || ''}>${ICON[k]}</svg>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, a, c) => Math.max(a, Math.min(c, x));

let active = null, activeBoot = null;
const tellPage = (name) => { try { document.dispatchEvent(new CustomEvent(name)); } catch (e) { /* old browsers */ } };   // the page pauses its own timed demos while the film plays
window.__xpStart = (boot) => {
  boot = boot || {};
  if (window.__xpBoot === boot) window.__xpBoot = null;   // the film owns the audio context now: nothing global keeps it alive after exit
  if (boot.cancelled) return;   // Esc or a second tap on the invite while the film was downloading (the loader restored the invite)
  if (active && activeBoot && activeBoot.cancelled) { active.then(() => window.__xpStart(boot)); return; }   // a cancelled start is still unwinding
  if (active) { if (boot.audio && boot.audio.close) boot.audio.close().catch(() => {}); return; }   // already running: drop the extra audio context
  activeBoot = boot;
  active = run(boot).catch((err) => {
    // never leave the visitor behind a broken overlay
    const cancelled = !!boot.cancelled;
    if (!cancelled) try { console.warn('[full experience]', err); } catch (e) { /* ignore */ }
    const r = document.getElementById('xp'); if (r) r.remove();
    const css = document.querySelector('link[data-xp-css]'); if (css) css.remove();
    document.documentElement.classList.remove('xp-lock');
    document.querySelectorAll('[data-xp-inert]').forEach((el) => { el.inert = false; el.removeAttribute('data-xp-inert'); });
    if (window.__xp && !cancelled) window.__xp.state = 'closed';   // (after a cancel the loader owns __xp: a new start may already be on its way)
    if (boot.audio && boot.audio.state !== 'closed') boot.audio.close().catch(() => {});
    // the invite says so, as when the script itself cannot load (the loader restores its words on the next click). After a cancel
    // the loader has already restored it, and a new click may be loading on this same invite: it is left alone.
    const b = boot.from;
    if (b && !cancelled) {
      b.removeAttribute('aria-busy');
      const t = b.querySelector('small'); if (t) t.textContent = 'Could not load · try again';
      b.setAttribute('aria-label', 'Full experience could not load. Try again.');
      try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      const st = [...document.querySelectorAll('body > p.sr-only[role="status"]')].pop();   // the loader's status line, for screen readers
      if (st) setTimeout(() => { st.textContent = 'The full experience could not load. Try again.'; }, 60);
    }
    if (boot.open) tellPage('xp:close');
    active = null; activeBoot = null;
  });
};
if (window.__xpBoot) window.__xpStart(window.__xpBoot);

async function run(boot) {
  const doc = document, html = doc.documentElement, body = doc.body;
  const calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const xp = window.__xp = Object.assign(window.__xp || {}, { state: 'loading', scene: 'loading', t: 0, quality: '', fps: 0, route: [], answer: null, calm });
  const invoker = boot.from || null;
  const ASSET = window.ASSET_BASE || '../assets/';
  let audio = createAudio(null);   // silent until the overlay has painted; the real graph is built one frame later (see "go")
  const data = parseData(doc);
  const isSide = () => innerWidth > innerHeight && innerHeight <= 500;   // a phone held sideways (the stylesheet's two-column layout)
  const view = { aspect: innerWidth / innerHeight, portrait: innerWidth / innerHeight < 0.85, side: isSide() };
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const phone = coarse && Math.min(screen.width, screen.height) < 820;

  /* ---------------- stylesheet first, and for real: without it the overlay would be an unstyled block at the end of an inert
     page, so a stylesheet that cannot load is a failed start (the catch in __xpStart gives the page and the invite back) */
  const styled = (l) => { try { return !!l.sheet && l.sheet.cssRules.length > 0; } catch (e) { return !!(l && l.sheet); } };
  let cssLink = doc.querySelector('link[data-xp-css]');
  if (cssLink && !styled(cssLink)) { cssLink.remove(); cssLink = null; }
  if (!cssLink) {
    cssLink = doc.createElement('link'); cssLink.rel = 'stylesheet'; cssLink.href = HERE + 'experience.css'; cssLink.setAttribute('data-xp-css', '');
    const link = cssLink;
    const ok = await new Promise((res) => {
      let iv = 0, to = 0;
      const done = (v) => { clearInterval(iv); clearTimeout(to); link.onload = link.onerror = null; res(v); };
      link.onload = () => done(styled(link)); link.onerror = () => done(false);
      iv = setInterval(() => { if (boot.cancelled) done(false); }, 100);   // the visitor cancelled while it downloads
      to = setTimeout(() => done(styled(link)), 15000);
      doc.head.appendChild(link);
    });
    if (!ok && !boot.cancelled) throw new Error('The film’s stylesheet could not load');
  }
  if (boot.cancelled) throw new Error('cancelled');
  const saved = { x: window.scrollX, y: window.scrollY, focus: doc.activeElement };   // (read now: the visitor may scroll while the stylesheet loads)

  /* ---------------- from the page itself: hire buttons, the trust note, each service and its starting price */
  function hireLinks() {
    let as = [...doc.querySelectorAll('#hero-hire a[href]')];
    if (!as.length) as = [...doc.querySelectorAll('a[data-link][href]')];
    const seen = new Set(), out = [];
    as.forEach((a) => {
      if (seen.has(a.href)) return; seen.add(a.href);
      const long = a.querySelector('.hr-long');
      const label = ((long && long.textContent) || a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
      if (label) out.push({ href: a.href, label, target: a.getAttribute('target'), rel: a.getAttribute('rel') });
    });
    return out;
  }
  const note = ((doc.querySelector('.hire-note') || {}).textContent || '').replace(/\s+/g, ' ').replace(/\s*·\s*/g, ' · ').trim();
  IDS.forEach((id) => {
    const m = doc.querySelector(`.word[data-ch="${id}"] .meta`);
    const sv = m && m.querySelector('b'), pr = m && m.querySelector('em');
    if (sv && sv.textContent.trim()) ST[id].service = sv.textContent.trim();
    if (pr && /\$\d/.test(pr.textContent)) ST[id].price = pr.textContent.trim();
  });
  const runFactor = Math.max(2, Math.round(data.run.end / (4 * BAR)));
  ST.measured.honest = `Every log line is from the real run, replayed about ${runFactor}× faster; the counters between lines are derived from it. Nothing is scraped by this page.`;

  /* ---------------- overlay */
  const root = doc.createElement('div');
  root.id = 'xp'; root.className = 'xp' + (calm ? ' calm' : '');
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Full experience: a 90-second film of the four demos'); root.tabIndex = -1;
  const secs = data.sections, q = data.quote, run0 = data.run, dep = data.deploy;
  const cite = secs[data.citeIndex] ? `${secs[data.citeIndex].n} ${secs[data.citeIndex].title}` : '§ Prices';
  const words = IDS.map((id) => `<li data-id="${id}"><span>${NAMES[id]}</span><i aria-hidden="true"></i></li>`).join('');
  root.innerHTML = `
  <canvas class="xp-gl" aria-hidden="true"></canvas>
  <div class="xp-2d" aria-hidden="true"></div>
  <div class="xp-vig" aria-hidden="true"></div>
  <div class="xp-dim" aria-hidden="true"></div>
  <div class="xp-black" aria-hidden="true"></div>
  <div class="xp-bars" aria-hidden="true"><i></i><i></i></div>
  <div class="xp-pins" data-k="plan-pins" aria-hidden="true"></div>
  <i class="xp-spark" aria-hidden="true"></i>
  <div class="xp-scene">
    <section class="xp-plan" data-k="plan-echo">
      <p class="xp-k">Your route</p>
      <p class="xp-quote"></p>
      <p class="xp-matchline" data-k="plan-match"></p>
      <ol class="xp-routeline" data-k="plan-route"></ol>
      <p class="xp-hon">${svg('arrow', ' class="i-sm"')}Matched by keyword in your browser · no AI model</p>
    </section>
    <section class="xp-open" data-k="open-name"><h2 class="xo-name">Eros C.</h2><p class="xo-role">Python &amp; AI developer, Italy</p></section>
    <section class="xp-open" data-k="open-four"><p class="xp-k">What he builds for businesses</p><h2 class="xo-four"><span>Four demos.</span> <span class="hl xo-real" data-k="open-real">All real.</span></h2></section>
    ${IDS.map((id) => `
    <section class="xp-title" data-k="title-${id}">
      <p class="xt-n"><span>${ST[id].n}</span><em class="xt-match" hidden></em></p>
      <h2 class="xt-w"><span>${NAMES[id]}</span><i class="xt-dot" aria-hidden="true"></i></h2>
      <p class="xt-s"><b>${esc(ST[id].service)}</b><em>${esc(ST[id].price)}</em></p>
      <i class="xt-flare" aria-hidden="true"></i>
    </section>
    <section class="xp-lower" data-k="lower-${id}">
      <p class="xl-k"><span>${ST[id].n}</span>${ST[id].kicker}</p>
      <h3 class="xl-h">${ST[id].head}</h3>
      <p class="xl-hon">${esc(ST[id].honest)}</p>
      <p class="xl-stack" data-k="stack-${id}">${ST[id].stack}</p>
    </section>`).join('')}
    <div class="xp-cards xc-answered">
      <div class="xc xc-q" data-k="a-q1"><b>Customer</b><span>How much is a trekking e-bike for a full day?</span></div>
      <div class="xc xc-sys" data-k="a-search"><i></i>searching the shop’s guide · ${secs.length} sections</div>
      <div class="xc xc-bot" data-k="a-a1"><b>Assistant</b><span>Trekking e-bike, full day: €${q.trekDay}. ${esc(data.incl || 'Helmet and lock are always included.').replace(/ at no extra cost\.?$/, '.')}</span><em class="xchip">${esc(cite)}</em></div>
      <div class="xc xc-q" data-k="a-q2"><b>Customer</b><span>Do you rent scooters?</span></div>
      <div class="xc xc-bot xc-miss" data-k="a-miss"><b>Assistant</b><span>Not in the guide, so I won’t guess. I’ll pass your question to the staff.</span><em class="xchip xchip-red">Handed off to staff</em></div>
    </div>
    <div class="xp-cards xc-booked">
      <div class="xc xc-quote" data-k="b-quote"><p class="xc-k">Instant quote <em class="xchip">${esc(cite)}</em></p>
        <div class="xc-sum" aria-hidden="true"><span class="tk tk1" data-k="b-t1">€${q.trekDay}</span><span class="tk tk2" data-k="b-t2"><i>+</i>€${q.trekDay}</span><span class="tk tk3" data-k="b-t3"><i>+</i>€${q.seatDay}</span><b class="tot" data-k="b-sum">€${q.total}</b></div>
        <ul><li><span>${q.bikes} × ${q.bike} · full day</span><b>€${q.bikesTotal}</b></li><li><span>${q.seats} × child seat · full day</span><b>€${q.seatsTotal}</b></li><li class="tl"><span>Total</span><b>€${q.total}</b></li></ul></div>
      <div class="xc xc-owner" data-k="b-owner"><p class="xc-k tg">Shop owner’s Telegram</p><p><b>New booking</b>${q.bikes} × ${q.bike} · full day · ${q.seats} child seat · €${q.total}</p></div>
      <ul class="xc xc-checks" data-k="b-checks"><li>Price, hours and holidays checked on the server</li><li>Telegram login verified with HMAC</li><li>Booking saved in SQLite</li></ul>
    </div>
    <div class="xp-cards xc-measured">
      <div class="xc xc-count" data-k="m-count">
        <div class="xc-big"><span>Books</span><b data-c="books">0</b><small>of ${fmt(run0.books)}</small></div>
        <div><span>Requests</span><b data-c="requests">0</b></div><div><span>Seconds</span><b data-c="seconds">0</b></div>
        <div class="ok"><span>Retries</span><b>${run0.retries}</b></div><div class="ok"><span>Errors</span><b>${run0.errors}</b></div>
      </div>
      <div class="xc xc-term" data-k="m-term"><p class="xc-k">scraper_run_log.txt <em>real run ${run0.seconds} s · replayed ~${runFactor}× faster</em></p><div class="xc-lines"></div></div>
      <div class="xc xc-files" data-k="m-files"><span>books.xlsx</span><span>books.csv</span><span>report.html</span></div>
    </div>
    <div class="xp-cards xc-alwayson">
      <div class="xc xc-steps" data-k="o-steps"><p class="xc-k">deploy.sh · fresh Ubuntu 24.04 <em>elapsed <b data-c="el">0</b> s · sped up</em></p>
        <ol>${dep.steps.map((s) => `<li><i>${s.n}/9</i><span>${esc(s.name.replace(/\s*\(.*\)$/, ''))}</span></li>`).join('')}</ol></div>
      <div class="xc xc-crash" data-k="o-crash"><p class="xc-k red">9/9 · Crash test</p><code>${esc(dep.kill)}</code><p class="xc-st">nordlight.service · <b>killed</b> · restart is up to systemd</p></div>
      <div class="xc xc-back" data-k="o-back"><p class="xc-k mint">Back by itself</p><code>active · ${esc(dep.restarts)}</code><code>${esc(dep.health)}</code></div>
      <div class="xc xc-stats" data-k="o-stats"><div><b>${dep.deployedT} s</b><span>to deployed</span></div><div><b>${dep.httpsT} s</b><span>to live HTTPS</span></div></div>
    </div>
    <div class="xp-crashbig" data-k="o-cd" aria-hidden="true">
      <p class="xcb-h">App killed<br>on purpose</p>
      <p class="xcb-n"><b data-c="cd">5</b></p>
      <p class="xcb-s">sleep 5 · real time<span class="xcb-x"> · no one touches it</span></p>
    </div>
    <div class="xp-backbig" data-k="o-backbig" aria-hidden="true"><p class="xbb-h">Back by itself</p><p class="xbb-s">${esc(dep.restarts)}<span class="xbb-hl"> · ${esc(dep.health)}</span></p></div>
    <section class="xp-fin" data-k="f-words">
      <ul class="xf-words" aria-label="Answered. Booked. Measured. Always on.">${words}</ul>
      <div class="xf-hire" data-k="f-hire">
        <h2 class="xf-h" tabindex="-1">Four demos, all real. <span class="hl">Let’s build yours.</span></h2>
        <p class="xf-you" data-k="f-you" hidden></p>
        <div class="xf-btns"></div>
        <p class="xf-note"></p>
        <div class="xf-sec"><button type="button" class="xf-replay">${svg('replay')}Watch again</button><button type="button" class="xf-back">Back to the page</button></div>
        <p class="xf-hon" data-k="f-hon">Made in your browser: keyword matching. No AI model, no server.</p>
      </div>
    </section>
  </div>
  <div class="xp-sub"><p class="xs-who"></p><p class="xs-line" aria-live="polite"></p></div>
  <form class="xp-q" novalidate autocomplete="off">
    <div class="xq-cold"><p class="xq-c1">Every customer question, booking and order is data.</p><p class="xq-c2">Eros C. builds the software that puts it to work.</p></div>
    <div class="xq-ask">
      <h2 class="xq-t" id="xpq-t">What does your business do?</h2>
      <p class="xq-who" hidden>${svg('voice')}<span>Narrator · your browser’s built-in voice</span></p>
      <div class="xq-row">
        <input type="text" class="xq-in" maxlength="120" enterkeyhint="go" spellcheck="false" placeholder="e.g. I run a bike rental shop" aria-labelledby="xpq-t" aria-describedby="xpq-hon">
        <button type="button" class="xq-mic" aria-pressed="false" aria-label="Answer by voice" aria-describedby="xpq-mic" hidden>${svg('mic')}</button>
        <button type="submit" class="xq-go">Fly${svg('arrow')}</button>
      </div>
      <p class="xq-micnote" id="xpq-mic" hidden>Voice input uses your browser’s speech recognition, only while the mic is on. In Chrome, that audio goes to Google’s servers.</p>
      <p class="xq-status" role="status"></p>
      <div class="xq-chips" role="group" aria-label="Suggested answers">
        <button type="button">I run a rental shop</button><button type="button">We sell products online</button><button type="button">Customers ask the same questions</button><button type="button">We run an app or SaaS</button>
      </div>
      <div class="xq-foot"><button type="button" class="xq-skip">Skip</button><span class="xq-count">Standard route in <b>${QUESTION_WAIT}</b> s<i></i></span></div>
      <p class="xq-hon" id="xpq-hon">I match your words to the four demos by keyword, in your browser. No AI model. Typed answers stay on this page.</p>
    </div>
  </form>
  <header class="xp-top">
    <div class="xp-brand"><i class="xp-rec" aria-hidden="true"></i><b>Eros C.</b><span>Full experience</span>${calm ? '<em><i class="ct-l">Calm version · reduced motion</i><i class="ct-s" aria-hidden="true">Calm</i></em>' : ''}</div>
    <ol class="xp-chap" aria-hidden="true"></ol>
    <div class="xp-ctrls" role="toolbar" aria-label="Film controls">
      <button type="button" class="xb xb-cc" aria-pressed="true" aria-keyshortcuts="C" title="Subtitles · C">${svg('cc')}<span class="xb-l">Subtitles</span></button>
      <button type="button" class="xb xb-voice" aria-pressed="true" aria-keyshortcuts="V" title="Narrator: your browser’s built-in voice · V">${svg('voice')}<span class="xb-l">Voice</span></button>
      <button type="button" class="xb xb-mute" aria-pressed="false" aria-keyshortcuts="M" title="Mute · M">${svg('sound')}<span class="xb-l">Mute</span></button>
      <button type="button" class="xb xb-pause" aria-keyshortcuts="Space" title="Pause · Space">${svg('pause')}<span class="xb-l">Pause</span></button>
      <button type="button" class="xb xb-skip" aria-keyshortcuts="End" title="Skip to the end · End">${svg('skip')}<span class="xb-l">Skip to end</span></button>
      <button type="button" class="xb xb-exit" aria-keyshortcuts="Escape" title="Exit · Esc">${svg('close')}<span class="xb-l">Exit</span></button>
    </div>
  </header>
  <div class="xp-prog" aria-hidden="true"><i></i></div>
  <button type="button" class="xp-paused" hidden>${svg('play')}<span>Paused · ${coarse ? 'Tap' : 'Space'} to play</span></button>
  <p class="xp-loading" role="status">Loading the city…</p>`;
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => [...root.querySelectorAll(s)];

  // hire buttons, from the page
  const links = hireLinks();
  const btns = $('.xf-btns');
  links.forEach((l, i) => {
    const a = doc.createElement('a'); a.href = l.href; a.className = 'xf-btn' + (i === 0 ? ' xf-main' : '');
    a.target = l.target || '_blank'; a.rel = l.rel || 'noopener';
    a.innerHTML = `<span></span>${svg('arrow')}`; a.querySelector('span').textContent = l.label;
    btns.appendChild(a);
  });
  $('.xf-note').textContent = note || 'Fixed-price packages · scope confirmed before you order';

  boot.open = true;   // from here the overlay's own controls (Exit, Esc) take over from the loader's cancel
  body.appendChild(root);
  // browsers without overflow: clip: a focused field could still scroll the overlay and shift the whole film sideways
  root.addEventListener('scroll', () => { if (root.scrollLeft || root.scrollTop) { root.scrollLeft = 0; root.scrollTop = 0; } }, { passive: true });
  const inerted = [];
  [...body.children].forEach((el) => { if (el !== root && !el.inert && el.tagName !== 'SCRIPT') { el.inert = true; el.setAttribute('data-xp-inert', ''); inerted.push(el); } });
  html.classList.add('xp-lock');
  tellPage('xp:open');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add('in');
    // focus moves in once the fade runs: focus() forces the first style and layout pass, which then no longer delays the overlay's first frame
    setTimeout(() => { if (!closing && !root.contains(doc.activeElement)) root.focus({ preventScroll: true }); }, 0);
  }));
  if (invoker) invoker.removeAttribute('aria-busy');

  /* ---------------- cached elements: the frame loop only writes what changed */
  const keyEls = {}; $$('[data-k]').forEach((el) => { keyEls[el.getAttribute('data-k')] = el; });
  const E = {
    dim: $('.xp-dim'), black: $('.xp-black'), prog: $('.xp-prog i'), line: $('.xs-line'), who: $('.xs-who'), qcount: $('.xq-count b'), qbar: $('.xq-count i'),
    books: $('[data-c="books"]'), requests: $('[data-c="requests"]'), seconds: $('[data-c="seconds"]'), lines: $('.xc-lines'), el: $('[data-c="el"]'), cd: $('[data-c="cd"]'),
    steps: $$('.xc-steps li'), checks: $$('.xc-checks li'), fwords: $$('.xf-words li'), sum: $('.xc-sum'), spark: $('.xp-spark'), skip: $('.xb-skip'),
    bhon: $('[data-k="lower-booked"] .xl-hon'), qwho: $('.xq-who'), qwhoT: $('.xq-who span'),
  };
  let chapEls = [], pinEls = [];
  const onCache = {}, last = {};
  const setOn = (k, on) => { if (onCache[k] === on) return; onCache[k] = on; const el = keyEls[k]; if (el) el.classList.toggle('on', on); };
  const once = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
  const opac = (el, k, v) => once(k, Math.round(v * 100) / 100, (x) => { el.style.opacity = String(x); });
  // the film's own text (titles, cards, finale) is laid out a few parts per idle moment once the city is ready, and all of it
  // at the latest when the visitor answers: never in the click's first frame
  const sceneParts = $$('.xp-scene > *');
  const showScene = (all) => {
    if (closing) return;
    for (let i = 0; i < (all === true ? 1e9 : 5) && sceneParts.length; i++) sceneParts.shift().classList.add('cv');
    if (sceneParts.length && all !== true) showSceneSoon();
  };
  function showSceneSoon() { if (window.requestIdleCallback) requestIdleCallback(showScene, { timeout: 900 }); else setTimeout(showScene, 120); }

  /* ---------------- state */
  let mode = 'cold', paused = false, autoPaused = false, closing = false;
  let T = 0, qT = 0, wall = 0, raf = 0, lastFrame = 0, ended = false;
  const blankMatch = { order: IDS.slice(), top: null, words: [], answered: false };
  let match = blankMatch;
  let film = buildFilm({ route: IDS.slice(), match, data, view, calm });
  let world = null, worldReady = false, fallback = false;
  let muted = false, voiceOn = true, subsOn = true;
  let subIdx = -1, finaleShown = false, countdown = QUESTION_WAIT;
  let fpsFrames = 0, fpsT0 = performance.now(), voiceUsed = false, voiceNet = '', heard = false;   // heard: the music really played (a running audio context, not muted) at some point of the film; voiceNet: a network voice spoke
  const frameLog = new Float64Array(240); let frameN = 0, measureFrom = 0, lastAdapt = 0;
  const rawLog = new Float64Array(180); let rawN = 0, lastRaw = 0, due = 0, vsync = 0;   // every rAF interval (also the skipped ones): the display's own rate

  /* ---------------- narration: the browser's voice reads the subtitles (never the visitor's words) */
  const synth = 'speechSynthesis' in window && window.SpeechSynthesisUtterance ? window.speechSynthesis : null;
  let voice = null, speaking = null, spokeAt = 0, spokeEnd = 0, voiceBroken = false;
  const bVoice = $('.xb-voice');
  function pickVoice() {
    if (!synth || voiceBroken) return null;
    const vs = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
    if (!vs.length) return null;
    const pref = [/daniel/i, /google uk english male/i, /ryan|guy|george|christopher|davis|eric|brian/i, /arthur|oliver|alex|fred|mark/i, /male/i];
    // a voice on this device first, any of them, before a network voice (whose text would leave the browser)
    const local = vs.filter((v) => v.localService);
    for (const re of pref) { const v = local.find((x) => re.test(x.name)); if (v) return v; }
    if (local.length) return local.find((v) => /en[-_]gb/i.test(v.lang)) || local[0];
    for (const re of pref) { const v = vs.find((x) => re.test(x.name)); if (v) return v; }
    return vs.find((v) => /en[-_]gb/i.test(v.lang)) || vs[0];
  }
  const online = () => !!(voice && voice.localService === false);   // a network voice: the browser sends the subtitle text to its speech service
  function updateVoiceUI() {
    const has = !!voice, live = has && voiceOn && !muted, kind = online() ? 'online voice' : 'built-in voice';
    bVoice.disabled = !has;
    bVoice.title = has ? `Narrator: your browser’s ${kind} · V` : 'No English voice in this browser · subtitles only';
    bVoice.setAttribute('aria-label', has ? `Narrator: your browser’s ${kind} (V). Turn it off and your screen reader reads the subtitles.` : 'Narrator unavailable: no English voice in this browser, subtitles only');
    // the notice stays on screen while the voice speaks, on phones too and with the subtitles off
    E.who.innerHTML = !has ? 'Subtitles only<span class="w2"> · no English voice in this browser</span>' : live ? `Narrator<span class="w2"> · your browser’s ${kind}</span><span class="w3"> · browser voice</span>` : '';
    E.qwhoT.textContent = `Narrator · your browser’s ${kind}`;
    E.who.classList.toggle('is-voice', live);
    E.qwho.hidden = !live;   // the question is read aloud too: the form says whose voice that is (the subtitle bar is not shown yet)
    // one audio rendition of each line: the browser voice, or (voice off) the screen reader through the live region
    E.line.setAttribute('aria-live', live ? 'off' : 'polite');
  }
  function onVoices() { voice = pickVoice(); updateVoiceUI(); }
  if (synth) { voice = pickVoice(); try { synth.addEventListener('voiceschanged', onVoices); } catch (e) { /* old browsers */ } }
  function say(s) {
    if (!synth || !voice || !voiceOn || muted || !s || !s.say) return;
    try {
      const words = s.say.split(/\s+/).length, est = words / 2.6 + 0.3, now = performance.now() / 1000;
      let room = Math.max(1.2, (s.room || 6) - 0.35);
      // a slow voice may still be finishing the line before: let it end when this line has the room, otherwise replace it
      const left = speaking && spokeAt ? Math.max(0, spokeEnd - now) : -1;
      if (left >= 0 && left < 1.6 && room - left >= est / 1.3) room -= left;
      else synth.cancel();
      const u = new SpeechSynthesisUtterance(s.say);
      u.voice = voice; u.lang = voice.lang; u.rate = clamp(est / room, 1.0, 1.3); u.pitch = 0.9; u.volume = 1;
      u.onstart = () => { if (speaking !== u) return; voiceUsed = true; if (u.voice && u.voice.localService === false) voiceNet = u.voice.name || 'online'; spokeAt = performance.now() / 1000; spokeEnd = spokeAt + est / u.rate + 0.4; audio.duck(true); };
      u.onend = () => { if (speaking === u) { speaking = null; spokeAt = 0; audio.duck(false); } };
      u.onerror = (e) => {
        if (speaking === u) { speaking = null; spokeAt = 0; audio.duck(false); }
        if (e && /synthesis-(failed|unavailable)|audio-hardware|not-allowed|language-unavailable|voice-unavailable/.test(e.error || '')) { voiceBroken = true; voice = null; updateVoiceUI(); }   // subtitles only, and the UI says so
      };
      speaking = u; spokeAt = 0; synth.speak(u);
    } catch (e) { /* the subtitles still carry every line */ }
  }
  function hush() { speaking = null; spokeAt = 0; if (synth) try { synth.cancel(); } catch (e) { /* ignore */ } audio.duck(false); }

  /* ---------------- controls */
  const bMute = $('.xb-mute'), bPause = $('.xb-pause'), bCC = $('.xb-cc');
  function setMuted(m) {
    muted = m; audio.setMuted(m); if (m) hush();
    bMute.setAttribute('aria-pressed', String(m)); bMute.innerHTML = `${svg(m ? 'muted' : 'sound')}<span class="xb-l">${m ? 'Muted' : 'Mute'}</span>`;
    bMute.title = m ? 'Sound off · M to turn it on' : 'Mute · M';
    updateVoiceUI();
  }
  function setVoice(on) { voiceOn = on; if (!on) hush(); bVoice.setAttribute('aria-pressed', String(on)); bVoice.classList.toggle('off', !on); updateVoiceUI(); }
  function setSubs(on) { subsOn = on; root.classList.toggle('no-subs', !on); bCC.setAttribute('aria-pressed', String(on)); bCC.classList.toggle('off', !on); }
  // phones (upright or sideways): the cards sit above the tallest subtitle of this film (measured once per film and per size, never per frame)
  const narrow = window.matchMedia ? matchMedia('(max-width: 760px), (max-aspect-ratio: 4/5)') : null;
  const sideways = window.matchMedia ? matchMedia('(orientation: landscape) and (max-height: 500px)') : null;
  function fitSubs() {
    const land = !!(sideways && sideways.matches);
    if (!land && (!narrow || !narrow.matches)) { root.style.removeProperty('--subH'); return; }
    // measured on a hidden copy: the real subtitle line is a live region and must not change while we measure
    const box = $('.xp-sub').cloneNode(true), line = box.querySelector('.xs-line'), who = box.querySelector('.xs-who');
    box.setAttribute('aria-hidden', 'true'); box.style.visibility = 'hidden'; line.removeAttribute('aria-live');
    line.style.display = 'inline'; who.style.display = 'block'; who.textContent = 'Narrator';   // as tall as it gets, subtitles on or off
    root.appendChild(box);
    let h = 0;
    film.subs.forEach((s) => { line.textContent = s.text; h = Math.max(h, box.offsetHeight); });
    const bottom = parseFloat(getComputedStyle(box).bottom) || 14;
    box.remove();
    root.style.setProperty('--subH', `${Math.ceil(land ? Math.max(44, h + bottom + 4) : Math.max(108, h + bottom + 14))}px`);
  }
  function stateName() { return mode === 'cold' || mode === 'question' ? 'question' : mode === 'waiting' ? 'loading' : mode === 'finale' || mode === 'end' ? 'finale' : 'playing'; }
  function setPaused(p, auto) {
    if (closing || p === paused) return;
    paused = p; autoPaused = !!(p && auto);
    bPause.innerHTML = `${svg(p ? 'play' : 'pause')}<span class="xb-l">${p ? 'Play' : 'Pause'}</span>`; bPause.title = p ? 'Play · Space' : 'Pause · Space';
    $('.xp-paused').hidden = !p; root.classList.toggle('is-paused', p);
    if (p) {
      audio.pause(); stopLoop();
      if (synth && speaking) try { synth.pause(); } catch (e) { /* ignore */ }
      if (world) world.pauseMedia(true);
      xp.state = 'paused';
    } else {
      audio.resume();
      if (synth && speaking) try { synth.resume(); } catch (e) { /* ignore */ }
      xp.state = stateName();
      frameN = 0; measureFrom = performance.now() + 700;   // the pause is not a slow frame
      if (!ended) startLoop(); else frameOnce();
    }
  }
  bMute.addEventListener('click', () => { setMuted(!muted); audio.ui(); });
  bVoice.addEventListener('click', () => { setVoice(!voiceOn); audio.ui(); });
  bCC.addEventListener('click', () => { setSubs(!subsOn); audio.ui(); });
  bPause.addEventListener('click', () => setPaused(!paused));
  $('.xp-paused').addEventListener('click', () => setPaused(false));
  E.skip.addEventListener('click', () => skipToEnd());
  $('.xb-exit').addEventListener('click', () => exit());
  $('.xf-back').addEventListener('click', () => exit());
  $('.xf-replay').addEventListener('click', () => replay());

  function focusables() {
    return [...root.querySelectorAll('button, a[href], input')].filter((el) => !el.hidden && !el.disabled && !el.closest('[inert],[hidden]') && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden');
  }
  function onKey(e) {
    if (closing) return;
    const k = e.key, tag = (e.target && e.target.tagName) || '', typing = tag === 'INPUT' || tag === 'TEXTAREA';
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (k === 'Escape' || k === 'Esc') { e.preventDefault(); e.stopPropagation(); exit(); return; }
    if (k === 'Tab') {
      if (mode === 'cold') { ask(); if (doc.activeElement === input) { e.preventDefault(); return; } }
      const f = focusables(); if (!f.length) return;
      const i = f.indexOf(doc.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      return;
    }
    if (typing || !plain) return;
    // the film's keys work from the very first second, the cold open included
    if (k === ' ' || k === 'Spacebar') { if (tag === 'BUTTON' || tag === 'A') return; e.preventDefault(); setPaused(!paused); return; }
    if (k === 'm' || k === 'M') { e.preventDefault(); setMuted(!muted); return; }
    if (k === 'End') { e.preventDefault(); skipToEnd(); return; }
    if (mode === 'cold' && k.length === 1) { ask(); input.focus({ preventScroll: true }); return; }   // typing skips the cold open
    if (k === 'c' || k === 'C') { e.preventDefault(); setSubs(!subsOn); return; }
    if ((k === 'v' || k === 'V') && voice) { e.preventDefault(); setVoice(!voiceOn); }
  }
  doc.addEventListener('keydown', onKey, true);
  function onVis() {
    if (doc.hidden && !paused) setPaused(true, true);
    else if (!doc.hidden && paused && autoPaused) setPaused(false);
  }
  doc.addEventListener('visibilitychange', onVis);
  function onResize() {
    const portrait = innerWidth / innerHeight < 0.85, flip = portrait !== view.portrait;
    view.aspect = innerWidth / innerHeight; view.portrait = portrait; view.side = isSide();
    if (flip && mode !== 'cold' && mode !== 'question') film = buildFilm({ route: film.route, match, data, view, calm });   // rotated: reframe every shot now
    if (world) world.resize(innerWidth, innerHeight);
    if (mode !== 'cold' && mode !== 'question') fitSubs();
    pinGeo = null;
    if (bg2d) bg2d.removeAttribute('data-s');   // 2D version: the scene is rebuilt for the new size (the Mini App's frame is placed again)
    frameN = 0; measureFrom = performance.now() + 800;
    if (ended || paused) frameOnce();
  }
  addEventListener('resize', onResize);

  /* ---------------- the opening question (after a three-line cold open) */
  const form = $('.xp-q'), input = $('.xq-in'), status = $('.xq-status'), mic = $('.xq-mic');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, micUsed = false;   // micUsed: the browser's speech recognition returned words (the finale's honest line says so)
  if (SR) { mic.hidden = false; $('.xq-micnote').hidden = false; }
  function ask() {
    if (mode !== 'cold') return;
    mode = 'question'; xp.scene = 'question';
    root.classList.add('xp-c1', 'xp-c2', 'xp-ask');
    if (!coarse && (doc.activeElement === root || !root.contains(doc.activeElement))) input.focus({ preventScroll: true });
    E.line.textContent = 'What does your business do?'; root.classList.add('has-sub');
    say({ say: 'Before we take off: what does your business do?', room: 6 });
  }
  function stopListening() { if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } } rec = null; if (listening) audio.duck(false); listening = false; mic.setAttribute('aria-pressed', 'false'); mic.classList.remove('live'); }
  mic.addEventListener('click', () => {
    if (mode !== 'question' || closing) { stopListening(); return; }   // the mic exists only while the question is asked
    if (listening) { stopListening(); status.textContent = ''; return; }
    try {
      hush();
      rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
      rec.onresult = (e) => {
        let txt = ''; let fin = false;
        for (let i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; }
        input.value = txt.trim();
        if (input.value) micUsed = true;
        if (fin && input.value) { status.textContent = 'Heard you.'; setTimeout(() => { if (mode === 'question') submit(input.value); }, 450); }
      };
      rec.onerror = (e) => { status.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'The microphone is blocked. Type your answer instead.' : 'Didn’t catch that. Type it, or try the mic again.'; stopListening(); };
      rec.onend = () => { if (listening) { stopListening(); if (!input.value.trim()) status.textContent = 'Didn’t catch that. Type it, or try the mic again.'; } };
      rec.start(); listening = true; mic.setAttribute('aria-pressed', 'true'); mic.classList.add('live'); audio.duck(true);
      status.textContent = 'Listening… speak now, or tap the mic to stop.';
    } catch (e) { status.textContent = 'Voice input isn’t available here. Type your answer instead.'; stopListening(); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(input.value); });
  $$('.xq-chips button').forEach((bt) => bt.addEventListener('click', () => { input.value = bt.textContent; submit(bt.textContent); }));
  $('.xq-skip').addEventListener('click', () => submit(''));

  function submit(text) {
    if (mode === 'cold') ask();
    if (mode !== 'question') return;
    stopListening();
    const answer = String(text || '').trim().slice(0, 120);
    match = matchAnswer(answer);
    xp.answer = answer; xp.route = match.order.slice();
    const qc = film.questionState(qT, wall);
    const qEnd = { pos: qc.cam.pos.slice(), look: qc.cam.look.slice() };
    film = buildFilm({ route: match.order, match, data, view, calm });
    film.setQEnd(qEnd);
    if (world) world.setRoute(match.order);
    audio.setMusic(film.music);
    // the route, in words, for everyone (the 3D pins are decoration)
    $('.xp-quote').textContent = answer ? `“${answer}”` : '';
    $('.xp-quote').hidden = !answer;
    const ml = $('.xp-matchline'), top = match.top;
    if (top === 'alwayson') ml.innerHTML = `Matched ${match.words.map((w) => `<b>“${esc(w)}”</b>`).join(', ')} <span class="ar">→</span> <strong>${NAMES[top]}</strong>, saved for last: it crashes on purpose`;
    else if (top) ml.innerHTML = `Matched ${match.words.map((w) => `<b>“${esc(w)}”</b>`).join(', ')} <span class="ar">→</span> <strong>${NAMES[top]}</strong> first`;
    else ml.textContent = answer ? 'No keyword matched: here is the standard route.' : 'No answer: here is the standard route.';
    $('.xp-routeline').innerHTML = match.order.map((id, i) => `<li${id === top ? ' class="top"' : ''}><i>0${i + 1}</i>${NAMES[id]}${id === top ? '<em>your match</em>' : ''}</li>`).join('');
    $('.xp-pins').innerHTML = match.order.map((id, i) => `<span class="pin pin-${id}" data-id="${id}"><i>0${i + 1}</i>${NAMES[id]}</span>`).join('');
    $('.xp-chap').innerHTML = match.order.map((id, i) => `<li data-id="${id}"${id === top ? ' class="mt"' : ''}><i>0${i + 1}</i><span>${NAMES[id]}</span>${id === top ? '<em>your match</em>' : ''}</li>`).join('');
    chapEls = $$('.xp-chap li'); pinEls = $$('.pin'); pinGeo = null;
    IDS.forEach((id) => {
      const t = keyEls[`title-${id}`], em = t.querySelector('.xt-match');
      if (id === top) { em.hidden = false; em.textContent = `Your match · “${match.words[0]}”`; } else em.hidden = true;
      t.querySelector('.xt-n span').textContent = '0' + (match.order.indexOf(id) + 1);
      keyEls[`lower-${id}`].querySelector('.xl-k span').textContent = '0' + (match.order.indexOf(id) + 1);
    });
    // the finale comes back to the answer: the matched service and its starting price, as the page shows them
    const you = $('.xf-you');
    if (top) { you.hidden = false; you.innerHTML = `You said <q>${esc(match.words[0])}</q>: start with <b>${esc(ST[top].service)}</b>, <em>${esc(ST[top].price)}</em>.`; }
    else you.hidden = true;
    root.classList.add('answered');
    // the form leaves for real: no focus, no taps, no screen reader, no live mic left behind (it fades, then it is gone)
    if (form.contains(doc.activeElement)) root.focus({ preventScroll: true });
    form.classList.add('gone'); form.inert = true; form.setAttribute('aria-hidden', 'true');
    setTimeout(() => { form.hidden = true; }, 480);
    audio.ui('go');
    hush();
    showScene(true);
    fitSubs();
    if (worldReady || fallback) beginFilm();
    else { mode = 'waiting'; xp.state = 'loading'; xp.scene = 'city'; $('.xp-loading').textContent = 'Building the city…'; root.classList.add('waiting'); }
  }

  function beginFilm() {
    mode = 'film'; subIdx = -1; finaleShown = false; ended = false;
    const waitS = audio.startFilm(filmNow);   // the film starts on the music's next eighth note
    T = -waitS; lastFrame = performance.now();
    xp.state = paused ? 'paused' : 'playing';
    root.classList.add('playing'); root.classList.remove('waiting');
    if (form.contains(doc.activeElement) || !root.contains(doc.activeElement)) root.focus({ preventScroll: true });
    measureFrom = performance.now() + 1200; frameN = 0;
    startLoop();
  }
  function filmNow() { return paused || mode === 'question' || mode === 'cold' ? T : T + Math.min(0.25, (performance.now() - lastFrame) / 1000); }
  function skipToEnd() {
    if (closing) return;
    stopListening();
    if (mode === 'cold' || mode === 'question') submit('');
    if (mode === 'waiting') return;
    if (mode === 'finale' || mode === 'end') return;
    T = film.finaleT; hush();
    subIdx = film.subs.findIndex((s) => s.t >= T) - 1; if (subIdx < -1) subIdx = film.subs.length - 1;
    audio.jump(T);
    if (paused) setPaused(false);
    if (doc.activeElement === E.skip) $('.xf-h').focus({ preventScroll: true });   // focus never drops to the page behind
  }
  function replay() {
    if (mode !== 'film' && mode !== 'finale' && mode !== 'end') return;
    mode = 'film'; T = 0; subIdx = -1; finaleShown = false; ended = false; hush();
    audio.jump(0); xp.state = 'playing'; root.classList.remove('at-end', 'ended');
    root.focus({ preventScroll: true });
    startLoop();
  }

  /* ---------------- the frame loop: about 60 fps on any display (30 while the question waits), stopped when paused, hidden or finished.
     Frames are due on a fixed grid, not "cap after the last frame": a 75, 90 or 144 Hz display still gets ~60 fps, never 37-48. */
  function startLoop() { if (!raf && !closing) { lastFrame = performance.now(); due = 0; lastRaw = 0; raf = requestAnimationFrame(loop); } }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function frameOnce() { if (!raf && !closing) requestAnimationFrame((now) => { if (!raf) render(now, 0); }); }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (lastRaw) { const rd = now - lastRaw; if (rd > 3 && rd < 50) rawLog[rawN++ % rawLog.length] = rd; }
    lastRaw = now;
    const cap = mode === 'film' || mode === 'finale' ? 1000 / 60 : 1000 / 30;
    if (now < due - 1.5) return;
    due = now - due > cap ? now + cap : due + cap;   // late (a stall, a slow display): start a new grid from here
    const el = now - lastFrame;
    const dt = Math.min(0.25, el / 1000);
    lastFrame = now;
    if (mode === 'film' || mode === 'finale') {
      if (now >= measureFrom) { frameLog[frameN % 240] = now; frameN++; }
      if (now - lastAdapt > 500) { lastAdapt = now; adapt(now); }
    } else if (now - lastAdapt > 500) { lastAdapt = now; displayInterval(); }   // learn the display's rate while the question waits (light load)
    fpsFrames++;
    if (now - fpsT0 >= 1000) { xp.fps = Math.round((fpsFrames * 1000) / (now - fpsT0)); fpsFrames = 0; fpsT0 = now; }
    render(now, (window.__xpFreeze && TEST()) ? 0 : dt);
  }
  function render(now, dt) {
    wall += dt;
    let S;
    if (mode === 'film' || mode === 'finale') {
      // while the music plays, its clock leads: a frame stall makes the picture catch up, the beat never skips
      const at = dt > 0 ? audio.clock(now) : null;
      if (at != null) { const df = at - (T + dt); if (Math.abs(df) < 1.5) dt += Math.abs(df) > 0.08 ? df : df * Math.min(1, dt * 5); }
    }
    if (mode === 'cold' || mode === 'question' || mode === 'waiting') {
      qT += dt;
      if (mode === 'cold') {
        once('c1', qT >= COLD[0], (v) => root.classList.toggle('xp-c1', v));
        once('c2', qT >= COLD[1], (v) => root.classList.toggle('xp-c2', v));
        if (qT >= COLD[2]) ask();
      } else if (mode === 'question' && !listening && !input.value.trim() && (worldReady || fallback)) {
        countdown -= dt;
        once('qc', Math.max(0, Math.ceil(countdown)), (c) => { E.qcount.textContent = String(c); });
        once('qcb', Math.round(Math.max(0, countdown / QUESTION_WAIT) * 200) / 200, (v) => { E.qbar.style.transform = `scaleX(${v})`; });
        if (countdown <= 0) submit('');
      }
      S = film.questionState(qT, wall);
      if (mode === 'waiting' && (worldReady || fallback)) beginFilm();
    } else {
      T += dt;
      S = film.state(T, wall);
    }
    xp.t = Math.round(Math.max(0, T) * 10) / 10;
    if (world && worldReady) { try { world.frame(S); } catch (e) { toFallback(e, 'stop'); } }
    paint(S);
    if (S.still && mode === 'finale' && !ended) {   // the hire scene has settled: stop drawing (the last frame stays on screen)
      ended = true; mode = 'end'; root.classList.add('ended'); stopLoop(); xp.fps = 0; audio.idle();
    }
  }

  function paint(S) {
    const seg = S.seg, sid = seg ? seg.id : (mode === 'question' || mode === 'cold' ? 'question' : 'city'), d = S.d || 0;
    const inFilm = mode !== 'question' && mode !== 'cold';
    if (inFilm) xp.scene = sid;
    if (!heard && inFilm && !muted && !paused && audio.ctx && audio.ctx.state === 'running') heard = true;
    for (let i = 0; i < film.dom.length; i++) { const w = film.dom[i]; setOn(w[0], inFilm && sid === w[1] && d >= w[2] && d < w[3]); }
    opac(E.dim, 'dim', S.dim || 0); opac(E.black, 'black', S.black || 0);
    if (fallback) paint2d(sid, d);
    // station details
    if (sid === 'booked') {
      for (let i = 0; i < 3; i++) once('ck' + i, d >= film.checks[i], (v) => E.checks[i].classList.toggle('on', v));
      once('sum', d >= 3 * BAR + 2 * BEAT, (v) => E.sum.classList.toggle('sum', v));
      // the caption says what the phone really shows: the recording once it plays, otherwise the replica (or, in 2D, nothing about it)
      // (2D: latched by the recording's own events, not its readyState, which dips for a moment on every re-sync seek)
      const rec = fallback ? !!(vid2d && vidLive) : !!(world && world.phoneLive);
      once('bhon', fallback ? (rec ? 'live' : 'flat') : rec ? 'live' : 'rep', (v) => { E.bhon.textContent = v === 'live' ? ST.booked.honestLive : v === 'flat' ? ST.booked.honestFlat : ST.booked.honest; });
    }
    if (sid === 'measured') {
      const m = film.measured(d);
      once('books', m.books, (v) => { E.books.textContent = fmt(v); });
      once('req', m.requests, (v) => { E.requests.textContent = fmt(v); });
      once('sec', m.seconds, (v) => { E.seconds.textContent = fmt(v); });
      once('lines', m.lines, (n) => {
        const ls = data.logLines.slice(Math.max(0, n - 5), n);
        E.lines.innerHTML = ls.map((l) => `<p class="${/^done|^saved|^database/.test(l.text) ? 'ok' : ''}"><i>[${l.stamp}]</i> ${esc(l.text)}</p>`).join('');
      });
    }
    if (sid === 'alwayson') {
      const a = film.alwayson(d);
      once('el', a.elapsed, (v) => { E.el.textContent = String(v); });
      once('cd', Math.max(1, a.countdown), (v) => { E.cd.textContent = String(v); });
      once('steps', a.stepsDone * 16 + a.current, () => { E.steps.forEach((li, i) => { li.classList.toggle('done', i < a.stepsDone); li.classList.toggle('cur', i === a.current && i >= a.stepsDone); }); });
      once('blackout', d >= KILL && d < BACK, (v) => root.classList.toggle('blackout', v));
      once('crashing', d >= KILL - 0.3 && d < BACK + 2.4, (v) => root.classList.toggle('crashing', v));   // the big crash-test titles are up (2D: the poster steps back)
    } else { once('blackout', false, () => root.classList.remove('blackout')); once('crashing', false, () => root.classList.remove('crashing')); }
    // the answer visibly steers the flight: a spark leaves the matched words and lands on the hub as the route draws
    if (sid === 'plan' && inFilm) {
      if (world && worldReady && pinEls.length) {
        const g = pinGeo || (pinGeo = pinBox()), P = g.plan;
        for (let i = 0; i < pinEls.length; i++) {
          const p = pinEls[i], id = p.getAttribute('data-id'), c = LAYOUT[id], o = world.project(c[0], 30, c[1], projTmp);
          // a pin stays whole on screen and off the route's text (its box: x - 14 .. + width, y - 40 .. + height)
          const w = g.w[i] || 120;
          let x = clamp(o.x, g.x0 + 14, Math.max(g.x0 + 14, g.x1 - w + 14)), y = clamp(o.y, g.y0 + 40, Math.max(g.y0 + 40, g.y1 - g.h + 40));
          if (x - 14 < P.r && x - 14 + w > P.l && y - 40 < P.b && y - 40 + g.h > P.t) {
            const right = P.r + 14 - x, down = P.b + 40 - y;
            if (right <= down && P.r + w <= g.x1) x += right; else y += down;
          }
          // and off the pins placed before it: above or below the one it meets (the side, once chosen, sticks: no flicker)
          const me = g.box[i]; me.l = x - 14; me.r = me.l + w; me.t = y - 40; me.b = me.t + g.h;
          for (let j = 0; j < i; j++) {
            const q = g.box[j];
            if (me.l < q.r + 4 && me.r > q.l - 4 && me.t < q.b + 4 && me.b > q.t - 4) {
              const dn = q.b + 4 - me.t, up = q.t - 4 - me.b;
              let side = g.side[i] || (-up < dn ? -1 : 1);
              if (side < 0 && me.t + up < g.y0) side = 1; else if (side > 0 && me.b + dn > g.y1) side = -1;
              g.side[i] = side; const dy = side < 0 ? up : dn; y += dy; me.t += dy; me.b += dy;
            }
          }
          once('pin' + i, `${Math.round(x)},${Math.round(y)}`, (v) => { p.style.transform = `translate(${v.replace(',', 'px,')}px)`; });
          once('pinl' + i, d > 1.6 + film.route.indexOf(id) * 0.6, (v) => p.classList.toggle('lit', v));
        }
      }
      if (!calm && match.top) sparkAt(d);
    } else once('spark', 0, () => { E.spark.style.opacity = '0'; });
    if (sid === 'finale') {
      // the honest line lists only what this run really used
      once('fhon', `${heard ? 1 : 0}${voiceUsed ? 1 : 0}${voiceNet ? 1 : 0}${micUsed ? 1 : 0}`, () => {
        const parts = []; if (heard) parts.push('generated sound'); if (voiceUsed && !voiceNet) parts.push('your browser’s built-in voice'); parts.push('keyword matching');
        // what left the browser in this run, said plainly: the visitor's spoken answer (speech recognition) and a network voice
        const out = [];
        if (micUsed) out.push('Speech recognition by your browser (Google’s servers in Chrome).');
        if (voiceNet) out.push(`Online browser voice${/google/i.test(voiceNet) ? ' (Google)' : ''}.`);
        keyEls['f-hon'].textContent = `Made in your browser: ${parts.join(', ')}. ` + (out.length ? `${out.join(' ')} No AI model on this page.` : 'No AI model, no server.');
      });
      for (let i = 0; i < 4; i++) once('fw' + i, d >= i * BEAT * 2, (v) => E.fwords[i].classList.toggle('on', v));
      once('atend', d >= 2 * BAR, (v) => root.classList.toggle('at-end', v));
      if (!finaleShown && d >= 2 * BAR + 0.05) {
        finaleShown = true; xp.state = paused ? 'paused' : 'finale'; mode = 'finale';
        const first = $('.xf-btn');
        if (first && (doc.activeElement === root || doc.activeElement === E.skip || !root.contains(doc.activeElement))) first.focus({ preventScroll: true });
      }
    }
    // chapters and progress
    if (inFilm) {
      const idx = seg && seg.kind === 'station' ? seg.index : seg && seg.kind === 'finale' ? 4 : -1;
      once('chap', idx, (v) => chapEls.forEach((li, i) => { li.classList.toggle('cur', i === v); li.classList.toggle('done', i < v); }));
      once('prog', Math.round(clamp(T / film.finaleT, 0, 1) * 400) / 400, (v) => { E.prog.style.transform = `scaleX(${v})`; });
      once('skipH', T >= film.finaleT, (v) => { E.skip.disabled = v; });
      // subtitles
      let i = subIdx;
      while (i + 1 < film.subs.length && film.subs[i + 1].t <= T) i++;
      if (i !== subIdx) {
        subIdx = i; const s = film.subs[i];
        if (s && T - s.t < 1.0) say(s);   // a line reached by skipping is shown, not read
      }
      const cur = film.subs[subIdx], showing = !!(cur && T < cur.t + cur.d);
      if (showing && E.line.textContent !== cur.text) E.line.textContent = cur.text;
      once('hassub', showing, (v) => root.classList.toggle('has-sub', v));
    }
  }
  const projTmp = { x: 0, y: 0, vis: true }, hubTmp = { x: 0, y: 0, vis: true };
  // where the plan's pins may go: inside the picture (under the bar, above the subtitles), off the route text. Read once per plan
  // scene and per size (layout boxes, not transforms), never per frame.
  let pinGeo = null;
  function pinBox() {
    const plan = $('.xp-plan'), bars = $('.xp-bars i'), top = $('.xp-top'), m = 8, gut = Math.min(24, Math.max(10, innerWidth * 0.034));
    const bar = bars ? bars.offsetHeight : 0, pl = plan.offsetLeft, pt = plan.offsetTop;
    return {
      w: pinEls.map((p) => p.offsetWidth), h: pinEls.length ? pinEls[0].offsetHeight : 30, box: pinEls.map(() => ({ l: 0, r: 0, t: 0, b: 0 })), side: pinEls.map(() => 0),
      x0: gut, x1: innerWidth - gut, y0: Math.max(top ? top.offsetHeight : 60, bar) + m, y1: innerHeight - bar - 64,
      plan: { l: pl - m, t: pt - m, r: pl + plan.offsetWidth + m, b: pt + plan.offsetHeight + m },
    };
  }
  let sparkFrom = null;
  function sparkAt(d) {
    const a = 1.0, c = 1.45;
    if (d < a - 0.05 || d > c + 0.35 || !world || !worldReady) { once('spark', 0, () => { E.spark.style.opacity = '0'; }); return; }
    if (!sparkFrom) { const w = $('.xp-matchline b') || $('.xp-matchline'); const r = w.getBoundingClientRect(); sparkFrom = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
    const o = world.project(LAYOUT.hub[0], 40, LAYOUT.hub[1], hubTmp), k = clamp((d - a) / (c - a), 0, 1), e = k * k * (3 - 2 * k);
    const x = sparkFrom.x + (o.x - sparkFrom.x) * e, y = sparkFrom.y + (o.y - sparkFrom.y) * e - Math.sin(e * Math.PI) * 60;
    E.spark.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1.4 - e * 0.6).toFixed(2)})`;
    once('spark', d <= c + 0.15 ? 1 : 0, (v) => { E.spark.style.opacity = String(v); });
  }

  /* ---------------- adaptive quality: step down (never back up) when frames come clearly slower than this display and the 60 fps
     grid allow. The display's own interval is the fastest steady rAF interval seen (skipped frames included), so a 75/90/144 Hz
     screen expects ~16.7 ms, and a display or battery saver capped at 30 Hz expects 33 ms: a cap is not a slow GPU. */
  function displayInterval() {
    const n = Math.min(rawN, rawLog.length);
    if (n < 40) return vsync || 1000 / 60;
    const a = Array.from(rawLog.subarray(0, n)).sort((x, y) => x - y);
    let v = a[Math.floor(n * 0.15)];
    if (v > 20 && a[Math.floor(n * 0.85)] - v > v * 0.12) v = 1000 / 60;   // slow and uneven: a busy device, not a steady 30 Hz cap
    vsync = vsync ? Math.min(vsync, v) : v;   // the display never gets slower; a busy GPU only looks like one
    return vsync;
  }
  function adapt(now) {
    if (!world || !worldReady || paused || (window.__xpForce && TEST())) return;
    if (frameN < 30) return;
    const n = Math.min(frameN, 240), newest = frameLog[(frameN - 1) % 240];
    let oldest = newest, count = 0;
    for (let k = 1; k <= n; k++) { const t = frameLog[(frameN - k) % 240]; if (newest - t > 2000) break; oldest = t; count = k; }
    if (newest - oldest < 1900 || count < 2) return;
    const avg = (newest - oldest) / (count - 1), d = displayInterval(), expect = Math.max(1000 / 60, d);
    xp.frameMs = Math.round(avg * 10) / 10; xp.displayMs = Math.round(d * 10) / 10;
    const slow = avg > expect * 1.22 + 0.5;
    const i = TIER_ORDER.indexOf(world.tier);
    if (slow && i > 0) {
      world.setTier(TIER_ORDER[i - 1]); xp.quality = world.tier;
      root.classList.toggle('no-post', !world.post);
      frameN = 0; measureFrom = now + 1000;
    } else if (avg > Math.max(33, expect * 1.6) && i === 0 && world.lowerRes()) { xp.quality = 'minimal-lowres'; frameN = 0; measureFrom = now + 1000; }
  }

  /* ---------------- 2D version (no WebGL, or the 3D library could not load): the real posters and the real Mini App recording */
  let bg2d = null, vid2d = null, vidLive = false;
  // why: 'nogl' (no WebGL here), 'load' (three.js or the city's code could not be downloaded), 'start' (WebGL refused the city), 'stop' (lost mid-film)
  const WHY = { nogl: '3D is not available in this browser', load: 'Could not load the 3D city', start: 'The 3D city could not start here', stop: 'The 3D view stopped' };
  function toFallback(err, why) {
    if (fallback) return;
    fallback = true; worldReady = false;
    try { if (world) world.dispose(); } catch (e) { /* ignore */ }
    world = null;
    root.classList.add('flat');
    xp.quality = '2d'; xp.fallback = why || 'stop';
    $('.xp-loading').textContent = `${WHY[why] || WHY.stop}: here is the 2D version.`;
    setTimeout(() => root.classList.add('loaded'), 2600);
    showSceneSoon();
    if (err) try { console.info('[full experience] 2D version:', err && err.message ? err.message : err); } catch (e) { /* ignore */ }
  }
  // where the Mini App's phone frame goes: centred by the stylesheet on wide screens; on upright phones in the free band between
  // the lower third (measured with its longest caption) and the cards; nowhere when that band is too short, or on a sideways phone.
  // Read once per scene and per size, never per frame.
  function frameBox() {
    if (sideways && sideways.matches) return null;
    if (!narrow || !narrow.matches) return {};
    const lo = keyEls['lower-booked'], cards = ['b-quote', 'b-owner', 'b-checks'].map((k) => keyEls[k]).filter(Boolean);
    if (!lo || !cards.length) return null;
    const prev = E.bhon.textContent; E.bhon.textContent = ST.booked.honestLive;
    const top = lo.getBoundingClientRect().bottom + 14;
    E.bhon.textContent = prev;
    const bottom = Math.min(...cards.map((c) => c.getBoundingClientRect().top)) - 14;
    const h = Math.min(bottom - top - 12, 0.42 * innerHeight, 330);   // 12: the frame's border
    return h >= 150 ? { top, h } : null;
  }
  function paint2d(sid, d) {
    if (!bg2d) bg2d = $('.xp-2d');
    const key = ST[sid] ? sid : 'city';
    if (bg2d.getAttribute('data-s') !== key) {
      bg2d.setAttribute('data-s', key);
      vidLive = false;
      if (vid2d) { vid2d.pause(); vid2d.removeAttribute('src'); try { vid2d.load(); } catch (e) { /* ignore */ } vid2d = null; }
      bg2d.innerHTML = '';
      if (ST[sid]) {
        const img = new Image(); img.alt = ''; img.src = ASSET + ST[sid].poster; img.decoding = 'async'; bg2d.appendChild(img);
        const fb = sid === 'booked' ? frameBox() : null;
        if (fb) {
          // the phone frame shows exactly the Mini App's column of the recording (x 760-1064, y 29-689 of 1280x720)
          const box = doc.createElement('div'); box.className = 'xp-2dv';
          if (fb.h) { box.style.top = `${Math.round(fb.top)}px`; box.style.height = `${Math.round(fb.h)}px`; box.style.width = 'auto'; box.style.transform = 'translateX(-50%)'; }
          const v = doc.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
          const live = () => { if (vid2d === v && !v.error) vidLive = true; };
          v.addEventListener('loadeddata', () => { box.classList.add('ready'); live(); }, { once: true });
          v.addEventListener('playing', live);
          v.addEventListener('error', () => { box.hidden = true; if (vid2d === v) vidLive = false; }, { once: true });   // no recording: no empty frame either (the caption already says nothing about it)
          v.src = ASSET + ST.booked.video; box.appendChild(v); bg2d.appendChild(box); vid2d = v;
        }
      } else bg2d.innerHTML = '<i class="city"></i>';
    }
    if (vid2d && sid === 'booked') {
      const vt = Math.max(0, d - 2.5 * BAR);
      if (vid2d.readyState >= 1 && Math.abs(vid2d.currentTime - Math.min(vt, vid2d.duration || 10)) > 0.35) try { vid2d.currentTime = Math.min(vt, (vid2d.duration || 10) - 0.05); } catch (e) { /* not seekable yet */ }
      if (vt > 0 && vid2d.paused && !paused && vt < (vid2d.duration || 10)) vid2d.play().catch(() => {});
      if (paused && !vid2d.paused) vid2d.pause();
    }
  }

  /* ---------------- exit: the page comes back exactly where it was, and nothing of the film keeps running */
  async function exit() {
    if (closing) return; closing = true;
    stopListening(); hush(); stopLoop();
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', onResize);
    if (synth) try { synth.removeEventListener('voiceschanged', onVoices); } catch (e) { /* old browsers */ }
    if (window.__xpBoot && window.__xpBoot.audio === boot.audio) window.__xpBoot = null;
    root.classList.add('out');
    xp.scene = 'closing';
    if (world) world.pauseMedia(true);
    await Promise.all([audio.fadeOutAndClose(), wait(520)]);
    if (!audio.ok && boot.audio && boot.audio.state !== 'closed') boot.audio.close().catch(() => {});   // left before the music's graph was built
    try { if (world) world.dispose(); } catch (e) { /* ignore */ }
    world = null;
    if (vid2d) { vid2d.pause(); vid2d.removeAttribute('src'); try { vid2d.load(); } catch (e) { /* ignore */ } vid2d = null; }
    root.remove();
    if (cssLink && cssLink.parentNode) cssLink.parentNode.removeChild(cssLink);
    inerted.forEach((el) => { el.inert = false; el.removeAttribute('data-xp-inert'); });
    html.classList.remove('xp-lock');
    window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
    if (window.scrollY !== saved.y) window.scrollTo(saved.x, saved.y);
    const back = invoker && invoker.isConnected ? invoker : saved.focus;
    try { if (back && back.focus) back.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    delete window.__xpSeek; delete window.__xpTap; delete window.__xpClock;
    xp.state = 'closed'; xp.scene = 'closed'; xp.fps = 0;
    tellPage('xp:close');
    active = null;
  }

  // test hooks for automated checks only (they exist only when a test sets window.__xpTest = true)
  if (TEST()) {
    window.__xpTap = () => audio.debugTap();
    window.__xpClock = () => ({ T, a: audio.clock(performance.now()), ctx: audio.ctx ? audio.ctx.currentTime : null, now: performance.now(), dbg: audio.debug ? audio.debug() : null });
    window.__xpSeek = (t) => {
      if (mode === 'question' || mode === 'cold' || mode === 'waiting' || closing) return false;
      T = Math.max(0, +t || 0); hush(); subIdx = film.subs.findIndex((x) => x.t > T) - 1; if (subIdx < -1) subIdx = film.subs.length - 1;
      finaleShown = false; ended = false; mode = 'film'; root.classList.remove('ended'); audio.jump(T); startLoop(); return true;
    };
  }

  /* ---------------- go */
  xp.state = 'question'; xp.scene = 'intro';
  updateVoiceUI();
  startLoop();
  (async () => { for (let i = 0; i < 10 && synth && !voice; i++) { await wait(100); voice = pickVoice(); } updateVoiceUI(); })();
  // the music's graph is built once the overlay has painted (the click's own frame stays short on a slow phone)
  await frameWait();
  if (closing) return;
  audio = createAudio(boot.audio || null, { calm });
  if (muted) audio.setMuted(true);
  if (mode === 'waiting') audio.setMusic(film.music);
  if (mode === 'cold' || mode === 'question' || mode === 'waiting') audio.startQuestion();
  if (paused) audio.pause();

  // the city: a browser without WebGL at all gets the 2D version without downloading three.js; otherwise three.js and the fonts
  // load in parallel and the city's own renderer is the WebGL test (no throwaway probe context: one context creation per start)
  let why = 'nogl';
  const pause = () => (window.scheduler && typeof window.scheduler.yield === 'function' ? window.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
  await pause();
  if (closing) return;
  try {
    const force = TEST() ? window.__xpForce : null;
    if (force === '2d' || !(window.WebGLRenderingContext || window.WebGL2RenderingContext)) throw new Error('WebGL is not available in this browser');
    why = 'load';
    const fonts = doc.fonts ? Promise.race([Promise.all(['800 74px "Archivo F"', '500 46px "JetBrains F"', '600 24px "Inter F"'].map((f) => doc.fonts.load(f).catch(() => null))), wait(1800)]) : Promise.resolve();
    const threeP = import(THREE_URL), worldP = import('./world.js');
    threeP.catch(() => {}); worldP.catch(() => {});
    await wait(30);
    const keepOut = cameraKeepOut(data);
    let slowT = 0;   // cleared as soon as the race is decided: a pending timer would keep this whole run alive for 15 s after an exit
    const slow = new Promise((res, rej) => { slowT = setTimeout(() => rej(new Error('three.js took too long')), 15000); });
    slow.catch(() => {});
    let THREE, W;
    try { [THREE, W] = await Promise.race([Promise.all([threeP, worldP]), slow]); } finally { clearTimeout(slowT); }
    await fonts;
    if (closing) return;
    why = 'start';
    // the starting tier, decided once the city's renderer says which GPU this is: phones and low-core / low-memory devices start
    // lighter; software GL starts at the bottom
    const pickTier = (r) => {
      const soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);
      const integrated = /intel|iris|uhd|radeon\(tm\)|radeon graphics|vega \d|mali|adreno|powervr|apple gpu/i.test(r);
      const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency, low = (mem && mem <= 4) || (cores && cores <= 4);
      let tier = phone ? (low ? 'minimal' : 'low') : low ? 'low' : integrated ? 'medium' : 'high';
      if (navigator.connection && navigator.connection.saveData && tier !== 'minimal') tier = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
      if (soft) tier = 'minimal';
      if (force && TIER_ORDER.indexOf(force) >= 0) tier = force;
      return tier;
    };
    const canvas = $('.xp-gl');
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (closing) return; toFallback(new Error('WebGL context lost'), worldReady ? 'stop' : 'start'); });   // (exit loses it on purpose)
    const cn = navigator.connection, slowNet = !!(cn && (cn.saveData || /(^|-)2g|3g/.test(cn.effectiveType || '')));
    const posters = {}, videos = {};
    IDS.forEach((id) => { posters[id] = ASSET + ST[id].bill; videos[id] = ASSET + ST[id].video; });
    const w0 = await W.createWorld(THREE, canvas, {
      tier: pickTier, phone, layout: LAYOUT, sections: data.sections, cats: data.cats, books: data.books,
      citeIndex: data.citeIndex, quote: data.quote, posters, keepOut, pause,
      phoneVideo: ASSET + ST.booked.video,                       // 176 KB: the real Mini App plays inside the giant phone everywhere
      videos: phone || slowNet ? null : { answered: videos.answered },   // one more recording on desktops with a fast connection (1 MB); the 2.8 and 5.6 MB ones stay posters
    });
    if (closing || fallback) { try { w0.dispose(); } catch (e) { /* ignore */ } return; }   // left (or fell back) while the city was being built
    world = w0;
    world.resize(innerWidth, innerHeight);
    world.setRoute(film.route);
    await pause();
    await world.compileAsync();   // shaders compile in parallel while the cold open keeps moving (no half-second freeze)
    if (closing || !world || fallback) return;
    await world.warm();           // textures and buffers go to the GPU a few at a time, not in the first frame
    if (closing || !world || fallback) return;
    await frameWait();
    if (closing || !world || fallback) return;
    world.frame(film.questionState(qT, wall));
    worldReady = true;
    xp.quality = world.tier;
    root.classList.toggle('no-post', !world.post);
    root.classList.add('loaded');
    showSceneSoon();
    measureFrom = performance.now() + 1200;
  } catch (err) {
    if (!closing) toFallback(err, err && err.xpNoGL ? 'nogl' : why);   // xpNoGL: the renderer could not get a WebGL context here
  }
}
