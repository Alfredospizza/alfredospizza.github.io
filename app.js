/* Eros C. portfolio.
   Vanilla JS, no dependencies. Everything here runs in the visitor's browser on demo data
   embedded in index.html: the demo shop's guide, the real run logs and 40 real sample rows. */
(function () {
  'use strict';

  /* ==================================================================
     RAG engine: BM25 keyword retrieval over the shop guide (markdown).
     English guide; a small Italian keyword map so Italian questions find
     the right section (the page then says the quote is from the English guide).
     ================================================================== */
  var RAG = (function () {
    var STOP = new Set((
      'a an the is are am be been being do does did done can could would should will shall may might must ' +
      'i me my mine we us our ours you your yours he she they them their it its this that these those there here ' +
      'of to in on at for from by with about as into onto if or and but so than then too very also just only ' +
      'what which who whom whose how when why many any some all each every ' +
      'need needs want wants wanna get gets got getting have has had having please hi hello hey thanks thank ' +
      'tell know give like time go goes going come use using one ones happen happens happened ' +
      'not no yes up out off over again same such s t m d ll re ve don doesn isn aren didn won cant ' +
      'anything something way really still let lets make possible allowed able available offer offers provide ' +
      'today tomorrow tonight now kind type sort info information question questions help long well ok okay ' +
      'policy rule rules say says said guide shop year years per take takes took taking ' +
      'require required requires necessary mandatory compulsory obbligatorio obbligatoria serve servono bisogno ' +
      'before after within until prior ahead less more least most minimum maximum minimal ' +
      /* Italian function words */
      'il lo la gli le un uno una di da del dello della dei degli delle con su tra fra ed che chi cui non si mi ti ci vi ne ' +
      'sono siete sei ho hai ha abbiamo avete hanno posso puoi puo possiamo potete vorrei voglio cosa quando dove perche se ' +
      'al allo alla ai agli alle nel nella nei sul sulla anche ma piu molto domani oggi quale quali qual mio mia miei tuo vostro vostra'
    ).split(/\s+/));

    var SYN_LIST = {
      price: 'price prices pricing cost costs costing much expensive cheap cheaper rate rates fee fees tariff euro euros eur charged quote prezzo prezzi costa costano costo costi quanto quanta tariffa tariffe',
      open: 'open opens opening close closes closing closed aperto aperta aperti apre aprite apertura orari orario chiuso chiusa chiusi chiude chiusura',
      hour: 'hour hours hourly ora ore',
      day: 'day days daily giorno giorni giornata giornaliero',
      full: 'full intera intero',
      half: 'half mezza mezzo',
      cancel: 'cancel cancels cancelled canceled cancelling canceling cancellation cancellations cancellare cancello cancellazione annullare annullo disdire disdetta',
      release: 'release released releases releasing',
      battery: 'battery batteries charge charging recharge batteria batterie carica ricarica',
      range: 'range far distance km kilometre kilometres kilometer kilometers mile miles last lasts autonomia distanza chilometri',
      licence: 'licence license licences licenses licensed driving driver drivers permit patente',
      age: 'age aged ages old older young younger teen teens teenager teenagers minor minors adult adults underage eta anni minorenne minorenni maggiorenne',
      ride: 'ride rides rider riders riding cycle cycling',
      tour: 'tour tours guided excursion excursions trip trips valpolicella hill hills visita visite escursione escursioni guidata guidate gita',
      deposit: 'deposit deposits hold held security guarantee cauzione deposito',
      damage: 'damage damages damaged broken break breaks broke crash crashed accident dent danno danni danneggiata danneggiato rotta rotto rompo',
      /* a scratch is not a breakage: the guide's scratch line must not answer "what if I break it?" */
      scratch: 'scratch scratches scratched scratching graffio graffi graffiata graffiato',
      tyre: 'tyre tyres tire tires flat puncture punctured wheel wheels gomma gomme foratura bucata',
      /* "lost" is not "stolen": a lost bike isn't in the guide, so it goes to the staff */
      theft: 'theft thefts stolen steal stole thief robbed furto rubata rubato rubano',
      book: 'book booking bookings reserve reservation reservations reserved online website prenotare prenoto prenotazione prenotazioni',
      pay: 'pay payment payments paying paid accept accepts accepted pagare pago pagamento pagamenti accettate accettano',
      card: 'card cards credit debit carta',
      cash: 'cash contanti',
      noshow: 'noshow miss missed',
      'return': 'return returns returned returning back drop dropoff restituire riconsegnare riportare restituzione riconsegna',
      ebike: 'ebike ebikes bike bikes bicycle bicycles electric bici bicicletta biciclette',
      city: 'city urban citta',
      trekking: 'trekking trek',
      child: 'child children baby toddler bambino bambini bambina seggiolino seggiolini figlio figli',
      parent: 'parent parents signature consent permission genitore genitori firma',
      helmet: 'helmet helmets casco caschi',
      lock: 'lock locks lucchetto',
      free: 'free included include includes gratis gratuita gratuito gratuitamente incluso inclusa inclusi',
      rent: 'rent rents rental rentals renting rented hire hiring noleggio noleggiare noleggiate affittare affitto',
      december: 'december christmas xmas natale dicembre',
      january: 'january gennaio capodanno',
      sunday: 'sunday sundays domenica',
      saturday: 'saturday saturdays sabato'
    };
    var EXPAND = {
      weekend: ['saturday', 'sunday'], weekends: ['saturday', 'sunday'],
      holiday: ['open', 'december', 'january'], holidays: ['open', 'december', 'january'], festivi: ['open', 'december', 'january'],
      kid: ['child', 'age'], kids: ['child', 'age'],
      son: ['child', 'age'], sons: ['child', 'age'], daughter: ['child', 'age'], daughters: ['child', 'age'],
      refund: ['cancel', 'release'], refunds: ['cancel', 'release'], refunded: ['cancel', 'release'], refundable: ['cancel', 'release'], rimborso: ['cancel', 'release'], rimborsi: ['cancel', 'release'],
      where: ['verona', 'italy'], address: ['verona', 'italy'], located: ['verona', 'italy'], location: ['verona', 'italy', 'location']
    };
    var ITALIAN = new Set(('posso possiamo quanto quanta costa costano prenotazione prenotare domenica aperto aperti aperta gratis cancellare annullare ' +
      'bici bicicletta patente casco batteria ritiro giornata orari orario noleggio noleggiare siete avete il gli della delle una che cosa ' +
      'giorno mezza intera cauzione furto bambino bambini seggiolino natale sabato visita escursione gomma danno danni rimborso prezzo prezzi pagare carta contanti').split(/\s+/));
    var MAP = new Map();
    Object.keys(SYN_LIST).forEach(function (c) {
      SYN_LIST[c].split(/\s+/).forEach(function (w) { MAP.set(w, c); });
    });

    function strip(s) { return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s; }
    function normalize(s) {
      return strip(String(s).toLowerCase())
        .replace(/[’`]/g, "'")
        .replace(/\bc'e\b/g, ' ')
        .replace(/e-?bikes?/g, ' ebike ')
        .replace(/no-?shows?/g, ' noshow ')
        .replace(/\b(?:don'?t|do not|didn'?t|did not|not|never|can'?t|cannot)\s+(?:show|turn)\s+up\b/g, ' noshow ')
        .replace(/\bnew\s+year'?s?\s+eve\b/g, ' december ')
        .replace(/\bnew\s+year'?s?(?:\s+day)?\b/g, ' january ')
        .replace(/€\s?\d+(?:[.,]\d+)?/g, ' price ')
        .replace(/(\d{1,2}):\d{2}/g, ' $1 ')
        .replace(/\b(\d{1,2})\s*(?:am|pm)\b/g, ' $1 ');
    }
    function canon(w, isQuery) {
      if (!w || STOP.has(w)) return [];
      if (isQuery && EXPAND[w]) return EXPAND[w];
      if (MAP.has(w)) return [MAP.get(w)];
      var s = w;
      if (s.length > 3 && s.charAt(s.length - 1) === 's' && s.slice(-2) !== 'ss') {
        var t = s.slice(0, -1);
        if (MAP.has(t)) return [MAP.get(t)];
        if (STOP.has(t)) return [];
        s = t;
      }
      if (s.length < 2 && !/\d/.test(s)) return [];
      return [s];
    }
    function words(s) { return normalize(s).split(/[^a-z0-9]+/).filter(Boolean); }
    function tokens(s) {
      var out = [];
      words(s).forEach(function (w) { canon(w).forEach(function (t) { out.push(t); }); });
      return out;
    }
    function isItalian(q) { return words(q).some(function (w) { return ITALIAN.has(w); }); }

    /* Split one prose line into sentences, without regex lookbehind (Safari < 16.4 cannot parse it). */
    function sentences(line) {
      return line.replace(/([.!?])\s+(?=[A-Z])/g, '$1\u0001').split('\u0001');
    }

    /* Split the markdown guide into chunks (sections, one per FAQ) and answer units. */
    function parse(md) {
      var lines = md.split(/\r?\n/);
      var chunks = [], cur = null, docTitle = '', headers = null;
      function push() { if (cur && cur.units.length) chunks.push(cur); cur = null; }
      lines.forEach(function (rawLine) {
        var line = rawLine.trim(), m;
        if (!line) return;
        if ((m = line.match(/^# (.+)/))) { docTitle = m[1]; return; }
        if ((m = line.match(/^## (.+)/))) {
          push();
          if (/^frequently/i.test(m[1])) return;
          cur = { title: m[1], kind: 'section', units: [] };
          return;
        }
        if ((m = line.match(/^### Q:\s*(.+)/))) {
          push();
          cur = { title: m[1], kind: 'faq', units: [] };
          return;
        }
        if (!cur) return;
        if (/^\|/.test(line)) {
          var cells = line.split('|').slice(1, -1).map(function (c) { return c.trim(); });
          if (cells.every(function (c) { return /^-+$/.test(c); })) return;
          if (!headers) { headers = cells; return; }
          cur.units.push({ kind: 'row', cells: cells, headers: headers,
            text: cells[0] + ': ' + headers.slice(1).map(function (h, i) { return h + ' ' + cells[i + 1]; }).join(' · ') });
          return;
        }
        if ((m = line.match(/^[-*]\s+(.+)/))) { cur.units.push({ kind: 'line', text: m[1] }); return; }
        if ((m = line.match(/^A:\s*(.+)/))) { cur.units.push({ kind: 'line', text: m[1] }); return; }
        sentences(line).forEach(function (s) { cur.units.push({ kind: 'line', text: s }); });
      });
      push();
      return { docTitle: docTitle, chunks: chunks };
    }

    function build(md) {
      var parsed = parse(md);
      var chunks = parsed.chunks;
      var df = new Map(), total = 0;
      chunks.forEach(function (c, i) {
        c.id = i;
        // "bike" is in every question about the shop, so it never makes a heading match ("Can I return the bike…").
        var head = tokens(c.title).filter(function (t) { return t !== 'ebike'; });
        c.titleToks = new Set(head);
        // The heading counts twice: "Opening hours" is about hours even though no line says "hours".
        var all = head.concat(head);
        c.units.forEach(function (u) { u.toks = new Set(tokens(u.text)); all = all.concat(tokens(u.text)); });
        c.tf = new Map();
        all.forEach(function (t) { c.tf.set(t, (c.tf.get(t) || 0) + 1); });
        c.len = all.length;
        total += all.length;
        c.tf.forEach(function (_, t) { df.set(t, (df.get(t) || 0) + 1); });
      });
      var N = chunks.length;
      var prices = chunks.filter(function (c) { return c.units.some(function (u) { return u.kind === 'row'; }); })[0] || null;
      return { md: md, docTitle: parsed.docTitle, chunks: chunks, df: df, N: N, avgdl: total / N, vocabSize: df.size, tokenCount: total, prices: prices };
    }

    function idf(idx, t) {
      var n = idx.df.get(t) || 0;
      return Math.log(1 + (idx.N - n + 0.5) / (n + 0.5));
    }

    var K1 = 1.2, B = 0.75, UNKNOWN_W = 2.2, WEAK_W = 0.4, MIN_SCORE = 0.4, MIN_COVERAGE = 0.4, SURE_COVERAGE = 0.6, AMBIG = 0.8;
    /* Generic words help find a section but never decide one: "cancel my booking" is about cancelling,
       and "I scratched the bike, will I pay?" is about scratches. */
    var WEAK = new Set(['book', 'rent', 'pay']);
    /* A rental length that the price table doesn't list ("3 hours") becomes one marker word that matches nothing,
       so the 3-hour guided tour can't answer "how much for 3 hours?". */
    var DUR = 'durationx';
    var PRICE_WORDS = new Set(['price', 'hour', 'day', 'half', 'full', 'ebike', 'city', 'trekking', 'child', 'seat', 'rent', 'book', DUR]);
    var BIKE_WORDS = new Set(['ebike', 'city', 'trekking', 'rent', 'book']);
    var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6 };
    var DUR_RE = /\b(\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|due|tre|quattro|cinque|sei)\s*-?\s*(hours?|hrs?|h|ore|ora|days?|giorni|giorno|minutes?|minuti|mins?)\b(?!\s+(?:before|after|earlier|later|early|late|prior|ahead|in advance|prima|dopo))/g;
    /* A yes/no lead ("No." / "Yes,") is only quoted when the question is the FAQ's own question. */
    var WH = /^\s*(?:when|where|what|which|who|why|how|quando|dove|come|quanto|quanta|quanti|cosa|quale|chi|perch)/i;

    function prepQuery(q) {
      var dur = null;
      var text = normalize(q)
        // "do you charge for scratches?" / "is there an extra charge?": a fee, not a battery charge
        .replace(/\bcharges?\s+(?=(?:for|me|us|extra|anything)\b)/g, ' price ')
        .replace(/\b(?:any|extra|no|additional)\s+charges?\b/g, ' price ')
        .replace(DUR_RE, function (m, n, u, at, s) {
        // "within 24 hours", "less than 2 hours", "entro 24 ore": a deadline, not a rental length.
        if (/(?:within|in|than|up to|least|entro|meno di|piu di)\s*$/.test(s.slice(0, at))) return m;
        var num = NUMW[n] || parseFloat(n.replace(',', '.'));
        // "30 minutes" is never on the price table: always an unlisted length
        if (/^mi/.test(u)) { dur = { n: num, unit: 'minute', listed: false }; return ' ' + DUR + ' '; }
        var hours = /^[ho]/.test(u);
        dur = { n: num, unit: hours ? 'hour' : 'day', listed: hours ? (num === 1 || num === 4) : num === 1 };
        if (hours && num === 1) return ' 1 hour ';
        if (hours && num === 4) return ' half day ';
        if (!hours && num === 1) return ' full day ';
        return ' ' + DUR + ' ';
      });
      if (dur) dur.label = dur.n + ' ' + dur.unit + (dur.n === 1 ? '' : 's');
      return { text: text, dur: dur };
    }

    function queryTerms(q) {
      var seen = new Set(), out = [];
      words(q).forEach(function (w, gi) {
        canon(w, true).forEach(function (t) {
          if (seen.has(t)) return;
          seen.add(t);
          out.push({ raw: w, tok: t, group: gi });
        });
      });
      return out;
    }

    function search(idx, q) {
      var pq = prepQuery(q);
      var terms = queryTerms(pq.text);
      terms.forEach(function (t) {
        t.num = /^\d+$/.test(t.tok);
        t.dur = t.tok === DUR;
        if (t.dur) t.raw = pq.dur.label;
        t.known = idx.df.has(t.tok);
        t.idf = idf(idx, t.tok) * (WEAK.has(t.tok) ? WEAK_W : 1);
        // Weight in the coverage check: unknown words weigh a lot, numbers and unlisted durations nothing.
        t.w = t.known ? t.idf : (t.num || t.dur) ? 0 : UNKNOWN_W;
      });
      var ranked = idx.chunks.map(function (c) {
        var s = 0;
        terms.forEach(function (t) {
          var tf = c.tf.get(t.tok) || 0;
          if (!tf) return;
          s += t.idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * c.len / idx.avgdl));
        });
        return { chunk: c, score: s };
      }).sort(function (a, b) { return b.score - a.score; });

      var best = ranked[0];
      // "How much for 3 hours?" / "2 days?" with nothing else to it: a price question, answered from the price table.
      var routed = false;
      if (pq.dur && idx.prices && terms.every(function (t) { return t.num || PRICE_WORDS.has(t.tok); })) {
        best = ranked.filter(function (r) { return r.chunk === idx.prices; })[0];
        routed = true;
      }

      // Coverage: how much of the question (weighted by rarity) the best section actually contains.
      // Unknown words weigh a lot, so "do you rent scooters?" is not answered with the rental blurb.
      var groups = {};
      terms.forEach(function (t) {
        t.inBest = !!(best && best.chunk.tf.get(t.tok));
        var g = groups[t.group] || (groups[t.group] = { w: 0, hit: false });
        g.w = Math.max(g.w, t.w);
        if (t.inBest) g.hit = true;
      });
      var wsum = 0, msum = 0;
      Object.keys(groups).forEach(function (k) { wsum += groups[k].w; if (groups[k].hit) msum += groups[k].w; });
      var coverage = wsum ? msum / wsum : (routed ? 1 : 0);
      var unknown = terms.filter(function (t) { return !t.known && !t.num && !t.dur; });
      var matched = routed || !!(terms.length && best && best.score >= MIN_SCORE && coverage >= MIN_COVERAGE);
      // A match that explains only part of the question is partial: name the closest section, hand it off.
      var partial = matched && !routed && coverage < SURE_COVERAGE;
      // Ambiguous: other sections match exactly the same words about as well, and none by its heading
      // ("is it free?"): ask which one instead of picking one.
      var options = [];
      // Words that only say which bike ("city", "e-bike") never make a question ambiguous.
      if (matched && !partial && !routed && !terms.some(function (t) { return best.chunk.titleToks.has(t.tok); }) &&
          terms.some(function (t) { return best.chunk.tf.get(t.tok) && !BIKE_WORDS.has(t.tok); })) {
        var key = hitKey(terms, best.chunk);
        options = ranked.filter(function (r) {
          return r.score > 0 && r.score >= best.score * AMBIG && hitKey(terms, r.chunk) === key;
        }).slice(0, 3).map(function (r) { return r.chunk; });
      }
      var ambiguous = options.length > 1;
      var found = matched && !partial && !ambiguous;
      var pick = { q: q, routed: routed };
      var units = found ? pickUnits(best.chunk, terms, pick) : [];
      var note = '';
      // "What if I break the bike?": "Damage and theft" lists cases (scratches, flat tyres, theft), none of
      // them a breakage. Quote the cases, and say plainly that anything else goes to the staff.
      if (found && pick.listOnly) note = 'The guide lists only these cases, so for anything else I\'d check with the staff.';
      if (found && routed && !pq.dur.listed) {
        var heads = idx.prices.units.filter(function (u) { return u.kind === 'row'; })[0].headers.slice(1)
          .map(function (h) { return h.charAt(0).toLowerCase() + h.slice(1); });
        note = 'The guide only lists ' + heads.slice(0, -1).join(', ') + ' and ' + heads[heads.length - 1] +
          ' prices, so for ' + pq.dur.label + ' I\'d ask the staff.';
      }
      return { query: q, terms: terms, ranked: ranked, best: found ? best : null, top: best, coverage: coverage,
        found: found, partial: partial, ambiguous: ambiguous, options: ambiguous ? options : [], note: note, routed: routed,
        unknown: unknown, units: units, it: isItalian(q) };
    }
    /* The visitor picked one of the sections an ambiguous question matched: quote that section in full
       ("is it free?" -> cancellation: the free line and the 50% line), the matched word highlighted. */
    function answerFrom(res, chunk) {
      return { query: res.query, terms: res.terms, ranked: res.ranked, best: { chunk: chunk }, top: { chunk: chunk }, coverage: res.coverage,
        found: true, partial: false, ambiguous: false, options: [], note: '', unknown: res.unknown, it: res.it,
        units: chunk.kind === 'faq' ? pickUnits(chunk, res.terms, { q: res.query, routed: false }) : chunk.units.slice(0, 4) };
    }
    function hitKey(terms, chunk) {
      return terms.filter(function (t) { return chunk.tf.get(t.tok); }).map(function (t) { return t.tok; }).sort().join(' ');
    }

    /* Price rows the question names: "trekking" -> that bike, "child seat" -> the add-on. An add-on never
       prices the bike, so "an e-bike and a child seat" gets both e-bike rows and the seat row. */
    function namedRows(chunk, terms) {
      var rows = chunk.units.filter(function (u) { return u.kind === 'row'; });
      var qt = new Set(terms.map(function (t) { return t.tok; }));
      var named = rows.filter(function (u) {
        return ['city', 'trekking', 'child', 'seat'].some(function (d) { return qt.has(d) && u.toks.has(d); });
      });
      if (named.length && qt.has('ebike') && !named.some(function (u) { return u.toks.has('ebike'); })) {
        named = rows.filter(function (u) { return u.toks.has('ebike'); }).concat(named);
      }
      return { rows: rows, named: named };
    }
    function pickUnits(chunk, terms, opts) {
      var nr = namedRows(chunk, terms);
      // Price table reached through a rental length: the rows the question names, or both e-bikes.
      if (opts.routed) return nr.named.length ? nr.named : nr.rows.filter(function (u) { return u.toks.has('ebike'); });
      var out = pickLines(chunk, terms, opts);
      if (!nr.named.length || !out.some(function (u) { return u.kind === 'row'; })) return out;
      return nr.named.concat(out.filter(function (u) { return u.kind !== 'row'; }));
    }
    // A section with two topics in its heading ("Damage and theft") whose asked topic no line names:
    // its lines are a list of cases, not a general rule.
    function listOnly(chunk, opts) { if (chunk.kind === 'section' && /\band\b/i.test(chunk.title)) opts.listOnly = true; }
    function pickLines(chunk, terms, opts) {
      // Terms from one query word (e.g. "weekend" -> saturday, sunday) count once, at the group's weight.
      var groups = {};
      terms.forEach(function (t) {
        if (!chunk.tf.get(t.tok)) return;
        var g = groups[t.group] || (groups[t.group] = { terms: [], w: 0, title: false });
        g.terms.push(t);
        g.w = Math.max(g.w, t.num ? t.idf * 0.5 : t.idf);
        if (chunk.titleToks.has(t.tok)) g.title = true;
      });
      // "bike" is neutral: it neither makes nor breaks a heading match.
      var keys = Object.keys(groups).filter(function (k) { return groups[k].terms.some(function (t) { return t.tok !== 'ebike'; }); });
      var allInTitle = keys.every(function (k) { return groups[k].title; });

      if (chunk.kind === 'faq') {
        // The whole answer, always. Its "No." / "Yes," only when the visitor asked the FAQ's own question:
        // "Can kids ride?" must not be answered "No." from "Do I need a driving licence?".
        var own = allInTitle && !WH.test(opts.q) && terms.every(function (t) { return t.w === 0 || groups[t.group]; });
        if (own) return chunk.units.slice();
        return chunk.units.map(function (u) {
          var text = u.text.replace(/^(?:yes|no)\s*[.,;!]\s*/i, '');
          if (text === u.text) return u;
          return { kind: 'line', text: text.charAt(0).toUpperCase() + text.slice(1), toks: u.toks };
        }).filter(function (u) { return u.text; });
      }

      var all = chunk.units.slice(0, 4);
      function about(u, g) { return g.terms.some(function (t) { return u.toks.has(t.tok); }); }
      if (!keys.length) return all;
      // Every matched word is in the heading. A one-topic heading ("Opening hours") is about every line under it,
      // so "open at 8am?" gets all the hours, not just the "Closed on…" line that happens to say "closed".
      // A two-topic heading ("Damage and theft"): the lines that say them all ("stolen" -> the theft line),
      // or, when no line does ("break"), the whole list of cases plus a note that anything else goes to staff.
      if (allInTitle) {
        var multi = /\band\b/i.test(chunk.title);
        var every = multi ? chunk.units.filter(function (u) { return keys.every(function (k) { return about(u, groups[k]); }); }) : [];
        if (!every.length) listOnly(chunk, opts);
        return (every.length ? every : chunk.units).slice(0, 4);
      }
      // The main word: the rarest one matched; on a tie, the more specific word that is not in the heading.
      var main = keys.reduce(function (a, k) {
        if (a === null) return k;
        var ga = groups[a], gk = groups[k];
        if (gk.w > ga.w + 1e-9) return k;
        if (Math.abs(gk.w - ga.w) <= 1e-9 && ga.title && !gk.title) return k;
        return a;
      }, null);
      if (groups[main].title) {
        // The heading holds the main word ("cancel" in "Cancellation policy"): every line about it applies,
        // so "cancel 1 hour before pickup" also gets the 50% line, and "break" gets the whole damage section.
        var lines = chunk.units.filter(function (u) { return about(u, groups[main]); });
        if (!lines.length) listOnly(chunk, opts);
        return (lines.length ? lines : chunk.units).slice(0, 4);
      }
      var scored = chunk.units.map(function (u, i) {
        var s = 0;
        keys.forEach(function (k) { if (about(u, groups[k])) s += groups[k].w; });
        return { u: u, s: s, i: i };
      });
      var max = Math.max.apply(null, scored.map(function (x) { return x.s; }));
      if (max <= 0) return all;
      return scored.filter(function (x) { return x.s >= max * 0.8 && about(x.u, groups[main]); }).slice(0, 3).map(function (x) { return x.u; });
    }

    /* Wrap every word whose normalised form is in the query in <mark>. */
    function highlight(text, qset) {
      var out = '', last = 0;
      var re = /€\s?\d+(?:[.,]\d+)?|\d{1,2}:\d{2}|[A-Za-z\u00c0-\u00ff0-9]+(?:-[A-Za-z\u00c0-\u00ff]+)*/g, m;
      while ((m = re.exec(text))) {
        out += esc(text.slice(last, m.index));
        var hit = tokens(m[0]).some(function (t) { return qset.has(t); });
        out += hit ? '<mark>' + esc(m[0]) + '</mark>' : esc(m[0]);
        last = m.index + m[0].length;
      }
      return out + esc(text.slice(last));
    }

    /* Structured facts for the Mini App quote: prices and opening hours from the same guide. */
    function shopRules(md) {
      var rules = { prices: {}, cols: [], hours: {}, closed: [], deposit: null };
      var rows = md.split(/\r?\n/).filter(function (l) { return /^\|/.test(l.trim()); });
      var header = null;
      rows.forEach(function (l) {
        var cells = l.split('|').slice(1, -1).map(function (c) { return c.trim(); });
        if (cells.every(function (c) { return /^-+$/.test(c); })) return;
        if (!header) { header = cells; rules.cols = cells.slice(1); return; }
        rules.prices[cells[0]] = cells.slice(1).map(function (c) { return +(c.match(/\d+/) || [0])[0]; });
      });
      var days = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
      md.split(/\r?\n/).forEach(function (l) {
        var m = l.match(/^-\s*(\w+)(?:\s+to\s+(\w+))?:\s*(\d{1,2}):(\d{2})\s+to\s+(\d{1,2}):(\d{2})/i);
        if (m) {
          var a = days[m[1].toLowerCase()], b = m[2] ? days[m[2].toLowerCase()] : a;
          if (a === undefined) return;
          var d = a;
          for (var k = 0; k < 7; k++) {
            rules.hours[d] = { open: +m[3] + m[4] / 60, close: +m[5] + m[6] / 60 };
            if (d === b) break;
            d = (d + 1) % 7;
          }
        }
        var c = l.match(/closed on (.+)/i);
        if (c) {
          var months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
          c[1].split(/\s+and\s+/).forEach(function (p) {
            var mm = p.match(/(\d{1,2})\s+(\w+)/);
            if (mm) rules.closed.push({ d: +mm[1], m: months.indexOf(mm[2].toLowerCase()) });
          });
        }
        var dep = l.match(/deposit of €(\d+)/i);
        if (dep) rules.deposit = +dep[1];
      });
      return rules;
    }

    return { build: build, search: search, answerFrom: answerFrom, highlight: highlight, tokens: tokens, shopRules: shopRules, sentences: sentences };
  })();

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { RAG: RAG };
    return;
  }

  /* ==================================================================
     Page
     ================================================================== */
  var ASSETS = window.ASSET_BASE || '';
  var reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var canHover = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
  var hasIO = 'IntersectionObserver' in window;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function raw(id) { var el = document.getElementById(id); return el ? el.textContent.replace(/^\n+/, '').replace(/\n+$/, '') : ''; }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function hhmm(h) { var hh = Math.floor(h), mm = Math.round((h - hh) * 60); return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }
  function isWide() { return window.innerWidth > 1240; }  // same breakpoint as the one-column hero in style.css
  function parseLog(text) {
    var out = [], t0 = null;
    text.split(/\n/).forEach(function (l) {
      var m = l.match(/^\[(\d\d):(\d\d):(\d\d)\] ?(.*)$/);
      if (!m) return;
      var t = +m[1] * 3600 + +m[2] * 60 + +m[3];
      if (t0 === null) t0 = t;
      out.push({ ts: m[1] + ':' + m[2] + ':' + m[3], t: t - t0, abs: t, msg: m[4] });
    });
    return out;
  }
  /* Run a lab's setup in its own task: when the browser is idle, or earlier if it comes near the screen.
     Keeps the first load free of one long task on slower phones. */
  var soonQueue = [];
  function soon(sel, fn) {
    var el = $(sel), done = false;
    function run() { if (done) return; done = true; fn(); }
    soonQueue.push(run);
    if (hasIO && el) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); run(); } }, { rootMargin: '1200px 0px' });
      io.observe(el);
    }
  }
  function drainSoon() {
    var next = soonQueue.shift();
    if (!next) return;
    next();
    if (soonQueue.length) idle(drainSoon);
  }
  function idle(fn) { if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 1200 }); else setTimeout(fn, 60); }
  function whenVisible(el, ratio, fn) {
    if (!el) return;
    if (!hasIO) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio >= ratio) { io.disconnect(); fn(); } });
    }, { threshold: [ratio] });
    io.observe(el);
  }

  /* ---------- in-page links land exactly: before the jump, render every lazily rendered chapter and
     finish any lab setup still waiting, so nothing above the target changes height mid-scroll ---------- */
  var root = document.documentElement;
  function renderAll() {
    root.classList.add('cv-all');
    while (soonQueue.length) soonQueue.shift()();
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href').length > 1) renderAll();
  }, true);
  window.addEventListener('hashchange', renderAll);
  if (location.hash.length > 1) {
    // opened from a shared link like /#hire: settle the page, then land on the target again
    window.addEventListener('load', function () {
      renderAll();
      var t = document.getElementById(location.hash.slice(1));
      if (t) t.scrollIntoView();
    });
  }

  /* ---------- if the web fonts never arrive, tune the big condensed words for the system fallback ---------- */
  if (document.fonts && document.fonts.load) {
    var fontFail = function () { root.classList.add('font-fallback'); };
    document.fonts.load('850 64px "Archivo F"', 'ANSWERED').then(function (list) { if (!list || !list.length) fontFail(); }, fontFail);
  }

  /* ---------- clock (Italy) ---------- */
  var clockEl = $('#clock');
  function tick() {
    try { clockEl.textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date()); } catch (e) { /* old browser */ }
  }
  tick(); setInterval(tick, 15000);

  /* ---------- proofs: the four words light up as the page proves them ---------- */
  var proofs = {};
  var navHire = $('#nav-hire'), nav = $('#nav');
  function setProof(key) {
    if (proofs[key]) return;
    proofs[key] = true;
    $$('.word[data-ch="' + key + '"]').forEach(function (w) { w.classList.add('proved', 'flash'); });
    $$('[data-proof="' + key + '"]').forEach(function (el) { el.classList.add('on'); });
    if (Object.keys(proofs).length === 4) {
      nav.classList.add('all-seen');
      $('span', navHire).textContent = 'Seen all 4 · Hire me';
    }
  }

  /* ---------- nav state, progress, chapter worlds ---------- */
  var prog = $('#progress'), ticking = false;
  var giants = $$('.giant');
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0, h = document.documentElement.scrollHeight - window.innerHeight;
      nav.classList.toggle('scrolled', y > 16);
      prog.style.setProperty('--p', h > 0 ? Math.min(1, y / h).toFixed(4) : 0);
      if (!reduced) paintGiants();
    });
  }
  /* giant chapter words slide across and fill in as you scroll through them */
  function paintGiants() {
    // phones: the word is sized to fit the screen, so it only drifts a little instead of sliding off the edge
    var vh = window.innerHeight, vw = window.innerWidth, amp = vw <= 720 ? 0.07 : 0.34;
    giants.forEach(function (g) {
      // the chapter's own box first: measuring the word inside a chapter that is not rendered yet
      // (content-visibility) would force its whole layout
      var s = g.parentNode.getBoundingClientRect();
      if (s.bottom < -200 || s.top > vh + 200) { if (g._near) { g._near = false; g.classList.remove('near'); } return; }
      var r = g.getBoundingClientRect();
      var near = !(r.bottom < -200 || r.top > vh + 200);
      if (near !== !!g._near) { g._near = near; g.classList.toggle('near', near); }
      if (!near) return;
      var p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      g.style.setProperty('--gx', ((0.42 - p) * vw * amp).toFixed(1) + 'px');
      g.style.setProperty('--fill', Math.min(1, Math.max(0, (p - 0.16) / 0.42)).toFixed(3));
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* the name moves into the nav once the hero's h1 (which already shows it) has scrolled away */
  (function () {
    var h1 = $('#hero-title');
    if (!h1 || !hasIO) { nav.classList.add('named'); return; }
    new IntersectionObserver(function (es) { nav.classList.toggle('named', !es[0].isIntersecting); }, { rootMargin: '-60px 0px 0px 0px' }).observe(h1);
  })();
  if (reduced) giants.forEach(function (g) { g.style.setProperty('--fill', 1); });

  if (hasIO) {
    var navLinks = $$('[data-nav]');
    var worldIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var w = e.target.getAttribute('data-world');
        document.body.setAttribute('data-world', w);
        navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('data-nav') === w); });
      });
    }, { rootMargin: '-48% 0px -48% 0px' });
    $$('main > section[data-world]').forEach(function (el) { worldIO.observe(el); });
  }

  /* ---------- reveal on scroll (content stays visible without JS / with reduced motion) ---------- */
  if (hasIO && !reduced) {
    document.documentElement.classList.add('io');
    var rio = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    $$('[data-reveal]').forEach(function (el) { rio.observe(el); });
  } else {
    $$('[data-reveal]').forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- the big calls to action lean towards the pointer (desktop only) ---------- */
  if (canHover && !reduced) {
    $$('.btn-lg, #nav-hire, .sheet-cta .btn').forEach(function (btn) {
      btn.classList.add('mag');
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1) + 'px');
        btn.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1) + 'px');
      });
      btn.addEventListener('pointerleave', function () { btn.style.setProperty('--mx', '0px'); btn.style.setProperty('--my', '0px'); });
    });
  }

  /* ---------- chapter stats: the real numbers are always in the page (no count-up through values that never
     happened); when half the row is in view, an accent line sweeps in above each one ---------- */
  (function () {
    var rows = $$('.stats');
    rows.forEach(function (ul) { $$('li', ul).forEach(function (li, k) { li.style.setProperty('--k', k); }); });
    if (!hasIO || reduced) { rows.forEach(function (ul) { ul.classList.add('lit'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('lit'); io.unobserve(e.target); } });
    }, { threshold: 0.5 });
    rows.forEach(function (ul) { io.observe(ul); });
  })();

  /* ---------- mobile hire bar: there whenever the hero's hire buttons are not on screen (above or below the fold),
     hidden while they or the hire section are visible ---------- */
  (function () {
    var bar = $('#hirebar'), heroHire = $('#hero-hire'), hire = $('#hire');
    if (!bar || !hasIO) { if (bar) bar.classList.add('show'); return; }
    var vis = { hero: true, hire: false };
    function upd() { bar.classList.toggle('show', !vis.hero && !vis.hire); }
    new IntersectionObserver(function (es) { vis.hero = es[0].isIntersecting && es[0].intersectionRatio >= 0.5; upd(); }, { threshold: [0, 0.5, 1] }).observe(heroHire);
    new IntersectionObserver(function (es) { vis.hire = es[0].isIntersecting; upd(); }, { rootMargin: '0px 0px -30% 0px' }).observe(hire);
  })();

  /* ---------- dialogs: native modal where <dialog> exists; older browsers (Safari < 15.4) get the same box
     as a fixed panel (.dlg-fallback in style.css), closed by its button, a click outside or Escape ---------- */
  var fallbackDlg = null;
  function openDialog(d, opener) {
    if (!d) return false;
    if (typeof d.showModal === 'function') { d.showModal(); return true; }
    d.setAttribute('open', '');
    d.classList.add('dlg-fallback');
    d._opener = opener || document.activeElement;
    fallbackDlg = d;
    var x = $('[data-close]', d);
    if (x) x.focus();
    return true;
  }
  function closeDialog(d) {
    if (!d) return;
    if (d.classList.contains('dlg-fallback')) {
      d.removeAttribute('open');
      d.classList.remove('dlg-fallback');
      fallbackDlg = null;
      if (d._opener && d._opener.focus) d._opener.focus();
    } else if (typeof d.close === 'function') d.close();
  }
  $$('.dlg').forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) closeDialog(d); });
    $$('[data-close]', d).forEach(function (b) { b.addEventListener('click', function () { closeDialog(d); }); });
  });
  document.addEventListener('keydown', function (e) { if (fallbackDlg && (e.key === 'Escape' || e.key === 'Esc')) closeDialog(fallbackDlg); });
  document.addEventListener('click', function (e) {
    if (fallbackDlg && !fallbackDlg.contains(e.target) && !(fallbackDlg._opener && fallbackDlg._opener.contains(e.target))) closeDialog(fallbackDlg);
  });

  /* ---------- the real recordings: nothing is fetched until Play ---------- */
  var VIDEOS = { chatbot: 'chatbot.mp4', telegram: 'telegram.mp4', scraper: 'scraper.mp4', deploy: 'deploy.mp4' };
  $$('.rec').forEach(function (fig) {
    var key = fig.getAttribute('data-video'), btn = $('.rec-play', fig), img = $('img', fig);
    if (!btn || !VIDEOS[key]) return;
    btn.addEventListener('click', function () {
      var v = document.createElement('video');
      v.controls = true;
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      // the wide poster suits the 16:9 player; phones showed the 4:3 cover and start playing at once, so no poster there
      if (img && window.innerWidth > 720) v.poster = ASSETS + img.getAttribute('data-asset');
      v.src = ASSETS + VIDEOS[key];
      v.setAttribute('aria-label', btn.getAttribute('aria-label').replace(/^Play the /, ''));
      btn.parentNode.replaceChild(v, btn);
      fig.classList.add('playing');
      v.focus();
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: the controls are there */ });
    });
  });

  /* ==================================================================
     LAB 01: the NordLight assistant (real BM25 retrieval, in the browser)
     ================================================================== */
  var GUIDE = raw('data-guide');
  var tIdx = performance.now();
  var idx = RAG.build(GUIDE);
  tIdx = performance.now() - tIdx;
  function ms(t) { return t < 0.1 ? '<0.1 ms' : t.toFixed(1) + ' ms'; }
  var consoleEl = $('#lab-chat'), chatLog = $('#chat-log'), input = $('#ask'), form = $('#ask-form');
  var secList = $('#sections'), termsEl = $('#terms');
  $('#guide-pre').textContent = GUIDE;
  $('#open-guide').addEventListener('click', function (e) { e.stopPropagation(); openDialog($('#dlg-guide'), this); });
  $('#idx-stats').textContent = idx.N + ' sections · ' + idx.vocabSize + ' words · indexed in ' + ms(tIdx);
  // the log stays quiet (aria-live off) until the visitor asks something: see logLive() in the auto demo
  chatLog.setAttribute('aria-live', 'off');
  $('#chat-sys').textContent = 'shop guide loaded in your browser · ' + idx.N + ' sections';
  if (!reduced) setTimeout(function () { secList.classList.add('scan'); }, 500);

  var hoodBtn = $('#hood-btn');
  hoodBtn.addEventListener('click', function () {
    var on = hoodBtn.getAttribute('aria-pressed') !== 'true';
    hoodBtn.setAttribute('aria-pressed', String(on));
    consoleEl.classList.toggle('hood', on);
  });

  secList.innerHTML = '';  // the HTML carries a plain copy of the list for no-JS visitors; rebuild it from the guide
  var secEls = idx.chunks.map(function (c, i) {
    var li = document.createElement('li');
    li.style.setProperty('--i', i);
    li.innerHTML = '<span class="nm">' + (c.kind === 'faq' ? '<small>FAQ</small>' : '') + esc(c.title) + '</span>' +
      '<span class="sc"><span class="lead">§' + (i + 1) + '</span><span class="bar"><i></i></span><span class="val">0.0</span></span>';
    li.title = (c.kind === 'faq' ? 'FAQ: ' : 'Section: ') + c.title;
    secList.appendChild(li);
    return li;
  });

  /* The guide itself, lying like a sheet on a light table under the console (decorative canvas).
     The section the assistant cites lights up on it too. */
  var plane = { el: $('#plane-doc'), lines: [], lit: null };
  (function buildPlane() {
    if (!plane.el || !plane.el.getContext) return;
    var byTitle = {};
    idx.chunks.forEach(function (c) { byTitle[c.title] = c.id; });
    var cur = -1;
    GUIDE.split(/\n/).forEach(function (l) {
      var t = l.trim(), m;
      if (!t) return;
      if ((m = t.match(/^## (.+)/))) cur = byTitle[m[1]] !== undefined ? byTitle[m[1]] : -1;
      else if ((m = t.match(/^### Q:\s*(.+)/))) cur = byTitle[m[1]] !== undefined ? byTitle[m[1]] : -1;
      if (/^\|[-| ]+\|$/.test(t)) return;
      plane.lines.push({ text: t, sec: cur, h: /^#/.test(t) });
    });
    requestAnimationFrame(drawPlane);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { requestAnimationFrame(drawPlane); });
    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(drawPlane, 200); });
  })();
  function drawPlane() {
    var c = plane.el, lines = plane.lines, n = lines.length;
    if (!c || !n || c.offsetParent === null) return;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(1.5, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    var x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    x.textBaseline = 'middle';
    var lh = 36, cols = 2, gap = 80, cw = (w - gap * (cols - 1)) / cols, rows = Math.ceil(h / lh);
    for (var col = 0; col < cols; col++) {
      var start = Math.floor(n * col / cols), x0 = col * (cw + gap);
      x.save();
      x.beginPath(); x.rect(x0, 0, cw, h); x.clip();
      for (var r = 0; r < rows; r++) {
        var L = lines[(start + r) % n], lit = plane.lit !== null && L.sec === plane.lit;
        x.font = (L.h ? '700 ' : '500 ') + '17px "JetBrains F", ui-monospace, Menlo, Consolas, monospace';
        x.fillStyle = lit ? 'rgba(255, 192, 74, .85)' : L.h ? 'rgba(160, 190, 220, .2)' : 'rgba(160, 190, 220, .1)';
        x.shadowColor = lit ? 'rgba(245, 165, 36, .7)' : 'rgba(0, 0, 0, 0)';
        x.shadowBlur = lit ? 14 : 0;
        x.fillText(L.text, x0, r * lh + lh / 2);
      }
      x.restore();
    }
  }
  function lightPlane(sec) {
    if (plane.lit === sec) return;
    plane.lit = sec;
    drawPlane();
  }

  function paintScores(res) {
    var top = res.ranked[0] ? res.ranked[0].score : 0;
    var max = Math.max(4, top);
    var byId = {};
    res.ranked.forEach(function (r) { byId[r.chunk.id] = r.score; });
    secEls.forEach(function (li, i) {
      var s = byId[i] || 0;
      li.querySelector('.bar i').style.setProperty('--w', Math.min(1, s / max).toFixed(3));
      li.querySelector('.val').textContent = s.toFixed(1);
      li.classList.toggle('lit', s > 0);
      li.classList.remove('cited', 'nohit');
    });
    if (!res.terms.length) {
      termsEl.innerHTML = '<span class="terms-empty">Only filler words so far. Keep typing…</span>';
      return;
    }
    termsEl.innerHTML = res.terms.map(function (t) {
      var label = t.dur ? esc(t.raw) : t.raw === t.tok || t.raw === t.tok + 's' ? esc(t.tok) :'<s>' + esc(t.raw) + '→</s>' + esc(t.tok);
      return '<span class="qt' + (t.known ? '' : ' unknown') + '">' + label + '</span>';
    }).join('');
  }

  var paintRaf = 0;
  function schedulePaint() {
    if (paintRaf) return;
    paintRaf = requestAnimationFrame(function () {
      paintRaf = 0;
      var v = input.value.trim();
      if (v) paintScores(RAG.search(idx, v));
    });
  }

  function addMsg(cls, html) {
    var d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.innerHTML = html;
    chatLog.appendChild(d);
    // An answer taller than the log (three price cards on a phone) shows from its source line down,
    // not just its last lines.
    var tall = /\b(answer|miss)\b/.test(cls) && d.offsetHeight > chatLog.clientHeight - 20;
    chatLog.scrollTop = tall ? d.offsetTop - 10 : chatLog.scrollHeight;
    return d;
  }

  function rowHtml(u, qset, noHit) {
    var heads = u.headers.slice(1);
    var hits = heads.map(function (h) { return RAG.tokens(h).filter(function (t) { return qset.has(t) && t !== 'price'; }).length; });
    var best = Math.max.apply(null, hits);
    var cells = heads.map(function (h, i) {
      // "Half day (4 h)": the length in brackets goes on its own small line, never a broken "4 / h"
      var m = h.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      var label = m ? esc(m[1]) + '<i>' + esc(m[2]) + '</i>' : esc(h);
      return '<span' + (!noHit && best > 0 && hits[i] === best ? ' class="hit"' : '') + '><em>' + label + '</em><b>' + esc(u.cells[i + 1]) + '</b></span>';
    }).join('');
    return '<li class="row-unit"><div class="prow-name">' + RAG.highlight(u.cells[0], qset) + '</div><div class="prow">' + cells + '</div></li>';
  }
  function quoteList(list) { return list.map(function (t) { return '“' + esc(t.raw) + '”'; }); }

  var IT_NOTE = '<p class="ans-note">Quoted from the English guide. The real assistant replies in Italian.</p>';
  function renderAnswer(res) {
    var bubble = null;
    if (res.found) {
      var c = res.best.chunk;
      var qset = new Set(res.terms.map(function (t) { return t.tok; }));
      var src = (c.kind === 'faq' ? 'FAQ · ' : '') + c.title;
      var html = '<div class="ans-meta"><span class="src"><svg><use href="#i-doc"/></svg>' + esc(src) + '</span>' +
        '<span class="match">match ' + Math.round(res.coverage * 100) + '% · ' + ms(res.ms) + '</span></div>' +
        '<p class="ans-lead">From the shop\'s guide:</p><ul class="ans-units">' +
        res.units.map(function (u) { return u.kind === 'row' ? rowHtml(u, qset, !!res.note) : '<li>' + RAG.highlight(u.text, qset) + '</li>'; }).join('') +
        '</ul>' + (res.note ? '<p class="ans-gap"><svg><use href="#i-arrow"/></svg><span>' + esc(res.note) + '</span></p>' : '') +
        (res.it ? IT_NOTE : '');
      bubble = addMsg('bot answer', html);
      secEls[c.id].classList.add('cited');
      lightPlane(c.id);
      drawBeam(secEls[c.id], bubble, $('.src', bubble));
    } else if (res.ambiguous) {
      // Several sections match the same words ("is it free?"): ask which one, instead of picking one.
      var words = quoteList(res.terms.filter(function (t) { return res.top.chunk.tf.get(t.tok); }));
      var amb = addMsg('bot miss ambig', '<b>That could mean a few things, so I won\'t guess.</b> ' +
        words.slice(0, 2).join(' and ') + ' comes up in ' + res.options.length + ' parts of the guide. Which one do you mean?' +
        '<span class="pick">' + res.options.map(function (c, i) {
          return '<button type="button" data-i="' + i + '">' + (c.kind === 'faq' ? '<small>FAQ</small>' : '') + esc(c.title) + '</button>';
        }).join('') + '</span>');
      res.options.forEach(function (c) { secEls[c.id].classList.add('nohit'); });
      lightPlane(null);
      $$('.pick button', amb).forEach(function (b) {
        b.addEventListener('click', function () {
          if (busy) return;
          $$('.pick button', amb).forEach(function (x) { x.disabled = true; x.classList.toggle('chosen', x === b); });
          autoStop(false);
          answerPicked(res, res.options[+b.getAttribute('data-i')]);
        });
      });
    } else if (res.partial) {
      var near = res.top.chunk;
      var gap = res.unknown.length ? 'The guide never mentions ' + quoteList(res.unknown).slice(0, 2).join(' or ') + '.' : 'Only part of your question matches the guide.';
      addMsg('bot miss', '<b>I\'m not sure, so I won\'t guess.</b> ' + gap +
        ' The closest section is “' + esc((near.kind === 'faq' ? 'FAQ · ' : '') + near.title) + '”, so I\'d check with the staff before answering.' +
        '<span class="miss-tag"><svg><use href="#i-arrow"/></svg>Partial match · to staff (demo)</span>');
      secEls[near.id].classList.add('nohit');
      lightPlane(null);
    } else {
      var why;
      if (res.it) why = ' This page only knows a few Italian words and the guide is in English, so I couldn\'t match it. The real assistant reads Italian, and is set up to pass questions the guide doesn\'t cover to the staff.';
      else {
        var unknown = quoteList(res.unknown);
        why = unknown.length ? ' The guide never mentions ' + unknown.slice(0, 2).join(' or ') + '.' : ' No section of the guide matches it well enough.';
        why += ' I\'d pass your question to the staff, who reply during opening hours.';
      }
      addMsg('bot miss', '<b>That isn\'t in the shop\'s guide, so I won\'t guess.</b>' + why +
        '<span class="miss-tag"><svg><use href="#i-arrow"/></svg>Handed to staff (demo)</span>');
      if (res.top && res.top.score > 0) secEls[res.top.chunk.id].classList.add('nohit');
      lightPlane(null);
    }
    return bubble;
  }

  /* The beam: a light trace from the cited section of the guide to the answer it produced. */
  var consoleBody = $('.console-body'), beamT = 0;
  var beam = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  beam.setAttribute('class', 'beam');
  beam.setAttribute('aria-hidden', 'true');
  beam.innerHTML = '<path/><circle r="3"/>';
  consoleBody.appendChild(beam);
  function animatePath(svg, path, dot, dur, done) {
    var len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    svg.classList.add('show');
    var t0 = performance.now();
    (function f(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      path.style.strokeDashoffset = len * (1 - e);
      var p = path.getPointAtLength(len * e);
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      if (k < 1) requestAnimationFrame(f); else if (done) done();
    })(t0);
  }
  function drawBeam(fromEl, toEl, anchorEl) {
    if (reduced || !fromEl || !toEl || window.innerWidth <= 720) return;
    var b = consoleBody.getBoundingClientRect(), a = fromEl.getBoundingClientRect(), c = toEl.getBoundingClientRect();
    var r = (anchorEl || toEl).getBoundingClientRect();
    var x1 = a.left - b.left + 2, y1 = a.top + a.height / 2 - b.top;
    var x2 = c.right - b.left + 3, y2 = r.top + r.height / 2 - b.top;
    beam.setAttribute('viewBox', '0 0 ' + b.width + ' ' + b.height);
    var path = beam.querySelector('path'), dot = beam.querySelector('circle');
    var dx = Math.max(28, Math.abs(x1 - x2) * 0.5);
    path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + (x1 - dx) + ',' + y1 + ' ' + (x2 + dx) + ',' + y2 + ' ' + x2 + ',' + y2);
    animatePath(beam, path, dot, 650);
    clearTimeout(beamT);
    beamT = setTimeout(function () { beam.classList.remove('show'); }, 2600);
  }

  /* The proof beam: from the first answer across the page to the word it proves. */
  var proofBeam = $('#proof-beam'), heroEl = $('.hero');
  function proveAnswered(bubble) {
    var word = $('.word[data-ch="answered"]'), dotEl = word && $('.dot', word);
    if (reduced || !bubble || !dotEl || !isWide() || proofs.answered) { setProof('answered'); return; }
    var h = heroEl.getBoundingClientRect(), a = bubble.getBoundingClientRect(), d = dotEl.getBoundingClientRect(), row = $('a', word).getBoundingClientRect();
    if (a.bottom < 0 || a.top > window.innerHeight) { setProof('answered'); return; }
    // From the answer, out of the console, along the row's underline, up into the full stop.
    var x1 = a.left - h.left - 2, y1 = a.top + Math.min(a.height / 2, 40) - h.top;
    var xr = row.right - h.left, yb = row.bottom - h.top - 0.5;
    var xd = d.left + d.width / 2 - h.left, yd = d.top + d.height / 2 - h.top;
    proofBeam.setAttribute('viewBox', '0 0 ' + h.width + ' ' + h.height);
    proofBeam.setAttribute('width', h.width);
    proofBeam.setAttribute('height', h.height);
    var path = proofBeam.querySelector('path'), dot = proofBeam.querySelector('circle');
    var bend = Math.max(24, (x1 - xr) * 0.6);
    path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + (x1 - bend) + ',' + y1 + ' ' + (xr + bend) + ',' + yb + ' ' + xr + ',' + yb +
      ' L' + (xd + 10) + ',' + yb + ' Q' + xd + ',' + yb + ' ' + xd + ',' + (yb - 10) + ' L' + xd + ',' + yd);
    consoleEl.classList.add('answered');
    animatePath(proofBeam, path, dot, 1300, function () {
      setProof('answered');
      setTimeout(function () { proofBeam.classList.remove('show'); consoleEl.classList.remove('answered'); }, 1400);
    });
  }

  var busy = false;
  function answerPicked(res, chunk) {
    busy = true;
    addMsg('user', esc((chunk.kind === 'faq' ? 'FAQ · ' : '') + chunk.title));
    var r = RAG.answerFrom(res, chunk);
    r.ms = 0;
    paintScores(res);
    function finish() { renderAnswer(r); busy = false; setProof('answered'); }
    if (reduced) { finish(); return; }
    var typing = addMsg('bot typing', '<span class="dots3"><i></i><i></i><i></i></span>reading that section');
    setTimeout(function () { typing.remove(); finish(); }, 450);
  }
  function ask(q, onDone) {
    q = (q || '').trim();
    if (!q || busy) return;
    busy = true;
    addMsg('user', esc(q));
    var t0 = performance.now();
    var res = RAG.search(idx, q);
    res.ms = performance.now() - t0;
    paintScores(res);
    secList.classList.remove('scan');
    void secList.offsetWidth;
    secList.classList.add('scan');
    function finish() { var b = renderAnswer(res); busy = false; if (onDone) onDone(res, b); }
    if (reduced) { finish(); return; }
    var typing = addMsg('bot typing', '<span class="dots3"><i></i><i></i><i></i></span>searching the guide');
    setTimeout(function () { typing.remove(); finish(); }, 600);
  }

  /* ---------- the auto demo: three real questions, typed by themselves ---------- */
  var AUTO = ['How much is a trekking e-bike for a full day?', 'Do you rent scooters?', 'Posso cancellare gratis?'];
  var autoBtn = $('#auto-btn');
  var auto = { i: 0, timer: 0, pending: null, paused: false, over: false };
  function autoLater(fn, wait) {
    auto.pending = fn;
    clearTimeout(auto.timer);
    if (auto.paused || auto.over || auto.held) return;
    auto.timer = setTimeout(function () { var f = auto.pending; auto.pending = null; if (f && !auto.over) f(); }, wait);
  }
  // held while the Full experience covers the page
  document.addEventListener('xp:open', function () { auto.held = true; clearTimeout(auto.timer); });
  document.addEventListener('xp:close', function () { auto.held = false; var f = auto.pending; if (f && !auto.paused && !auto.over) autoLater(f, 600); });
  function setAutoBtn(label, icon) { autoBtn.querySelector('span').textContent = label; autoBtn.querySelector('use').setAttribute('href', icon); }
  // The questions the page asks by itself are not announced; the log speaks once the visitor takes over.
  function logLive(on) { chatLog.setAttribute('aria-live', on ? 'polite' : 'off'); }
  function autoStop(clearInput) {
    logLive(true);
    if (auto.over) return;
    auto.over = true;
    clearTimeout(auto.timer);
    auto.pending = null;
    autoBtn.hidden = true;
    $('.ask').classList.remove('typing');
    if (clearInput) input.value = '';
  }
  function autoStep() {
    if (auto.i >= AUTO.length) { autoStop(false); return; }
    var q = AUTO[auto.i++], n = 0;
    var formEl = $('.ask');
    formEl.classList.add('typing');
    (function type() {
      input.value = q.slice(0, ++n);
      schedulePaint();
      if (n < q.length) autoLater(type, 22 + Math.random() * 30);
      else autoLater(function () {
        input.value = '';
        formEl.classList.remove('typing');
        ask(q, function (res, bubble) {
          if (auto.i === 1 && res.found) proveAnswered(bubble);
          autoLater(autoStep, auto.i === 1 ? 3600 : 3000);
        });
      }, 320);
    })();
  }
  function autoStart() {
    if (auto.over || auto.started) return;
    auto.started = true;
    logLive(false);
    if (reduced) {
      // Calm version: the first answer is simply there, no typing, no sequence.
      ask(AUTO[0], function () { setProof('answered'); });
      auto.over = true;
      return;
    }
    autoBtn.hidden = false;
    autoStep();
  }
  autoBtn.addEventListener('click', function () {
    if (auto.over) return;
    auto.paused = !auto.paused;
    if (auto.paused) { clearTimeout(auto.timer); setAutoBtn('Play', '#i-play'); }
    else { setAutoBtn('Pause', '#i-pause'); var f = auto.pending; if (f) autoLater(f, 250); }
  });
  // On wide screens the console is in view at once; on phones, start when it scrolls in.
  if (isWide() || !hasIO) setTimeout(autoStart, reduced ? 0 : 900);
  else whenVisible(consoleEl, 0.45, function () { setTimeout(autoStart, reduced ? 0 : 400); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value;
    autoStop(false);
    input.value = '';
    ask(q, function (res) { if (res.found) setProof('answered'); });
  });
  input.addEventListener('focus', function () { if (!auto.over) autoStop(true); });
  input.addEventListener('input', function () { autoStop(false); schedulePaint(); });

  // the two questions that show the assistant's honesty come first
  var SUGGEST = [
    ['Do you rent scooters?', 'trick', 'A question the guide cannot answer'],
    ['Is it free?', 'trick', 'A question with more than one possible answer'],
    ['Open on Sunday?'],
    ['How much is the deposit?'],
    ['Posso pagare con carta?'],
    ['How far does a city e-bike go?'],
    ['Do I need a licence?'],
    ['What if I don\'t show up?'],
    ['Guided tours?']
  ];
  var chipsEl = $('#chips');
  var chipBtns = SUGGEST.map(function (s) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (s[1] ? ' ' + s[1] : '');
    b.textContent = s[0];
    if (s[2]) b.title = s[2];
    b.addEventListener('click', function () {
      autoStop(true);
      if (busy) return;
      b.classList.add('used');
      ask(s[0], function (res) { if (res.found) setProof('answered'); });
    });
    chipsEl.appendChild(b);
    return b;
  });

  /* Wider screens: the chips wrap in two rows and a "More" chip pages through the rest (no hidden sideways
     scroller that a mouse wheel can't reach). Phones keep the swipeable strip. */
  (function chipPages() {
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'chip chip-more';
    more.innerHTML = '<svg aria-hidden="true"><use href="#i-replay"/></svg><span>More</span>';
    more.setAttribute('aria-label', 'Show more suggested questions');
    chipsEl.appendChild(more);
    var pages = [], page = 0, lastW = -1;
    // a page: { chips: [row 1..., row 2...], moreAt: how many of them come before the "More" chip }
    function show(n, animate) {
      page = n;
      var pg = pages[page], focused = document.activeElement === more;
      chipBtns.forEach(function (b) { b.hidden = pg.chips.indexOf(b) < 0; });
      pg.chips.forEach(function (b, k) { chipsEl.appendChild(b); b.style.setProperty('--k', animate ? k : 0); });
      if (pg.moreAt < pg.chips.length) chipsEl.insertBefore(more, pg.chips[pg.moreAt]); else chipsEl.appendChild(more);
      if (focused) more.focus({ preventScroll: true });
      more.hidden = pages.length < 2;
      more.setAttribute('aria-label', 'More suggested questions (' + (page + 1) + ' of ' + pages.length + ')');
    }
    function layout() {
      var narrow = window.innerWidth <= 720, W = narrow ? 0 : chipsEl.clientWidth;  // phones: no measuring (no forced layout)
      if (W === lastW) return;
      lastW = W;
      chipBtns.forEach(function (b) { b.hidden = false; });
      if (narrow || !W) {
        chipsEl.classList.remove('paged');
        pages = [{ chips: chipBtns, moreAt: chipBtns.length }];
        show(0, false);
        more.hidden = true;
        return;
      }
      chipsEl.classList.add('paged');
      more.hidden = false;
      var cs = getComputedStyle(chipsEl), gap = parseFloat(cs.columnGap) || 6;
      var inner = W - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 1, moreW = more.offsetWidth + 1;
      var widths = chipBtns.map(function (b) { return b.offsetWidth + 1; });  // layout widths: the console may still be scaling in
      var left = chipBtns.map(function (b, i) { return i; });
      function fill(limit) {  // first fit, in priority order
        var row = [], x = 0;
        for (var j = 0; j < left.length;) {
          var nx = x ? x + gap + widths[left[j]] : widths[left[j]];
          if (nx <= limit) { x = nx; row.push(left.splice(j, 1)[0]); } else j++;
        }
        return { ids: row, x: x };
      }
      function room(r) { return (r.x ? r.x + gap : 0) + moreW <= inner; }
      pages = [];
      while (left.length) {
        var r1 = fill(inner), r2 = fill(inner), moreAt;
        // "More" goes at the end of row 2, else of row 1; failing both, row 2 gives back its last question
        while (!room(r2) && !room(r1) && r2.ids.length) {
          var back = r2.ids.pop();
          r2.x -= widths[back] + (r2.ids.length ? gap : 0);
          left.push(back); left.sort(function (a, b) { return a - b; });
        }
        moreAt = room(r2) || !room(r1) ? r1.ids.length + r2.ids.length : r1.ids.length;
        var ids = r1.ids.concat(r2.ids);
        if (!ids.length) ids.push(left.shift());
        pages.push({ chips: ids.map(function (i) { return chipBtns[i]; }), moreAt: moreAt });
      }
      show(Math.min(page, pages.length - 1), false);
    }
    more.addEventListener('click', function () { if (pages.length > 1) show((page + 1) % pages.length, !reduced); });
    layout();
    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(layout, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { lastW = -1; layout(); });
    // phones: drop the fade at the end of the strip once it is scrolled to the end
    chipsEl.addEventListener('scroll', function () {
      chipsEl.classList.toggle('at-end', chipsEl.scrollLeft + chipsEl.clientWidth >= chipsEl.scrollWidth - 2);
    }, { passive: true });
  })();

  /* ---------- hero teaser (phones, small laptops): the same engine answers three questions by itself
     (an answer, a "not in the guide", an "asks, doesn't guess"), right under the four words. It plays them
     once (about 10 s) and then rests on the last answer; it waits while it is off screen, in a background tab,
     or under the pointer or keyboard focus, and its own Pause button (outside the link, so touch can use it)
     stops it (WCAG 2.2.2). ---------- */
  (function teaser() {
    var el = $('#teaser'), qEl = $('#tz-q'), aEl = $('#tz-a'), srcEl = $('#tz-src'), pauseBtn = $('#tz-pause');
    if (!el) return;
    var QS = ['Do you rent scooters?', 'Is it free?', 'Open on Sunday?'];  // ends on an answer that fits a 320px screen
    function reply(q) {
      var r = RAG.search(idx, q);
      if (r.ambiguous) return { text: 'That could mean ' + r.options.length + ' things. Which one?', src: 'asks, doesn\'t guess', gap: true };
      if (r.found) {
        var u = r.units[0];
        return { text: u.kind === 'row' ? u.cells[0] + ': ' + u.cells.slice(1).join(' · ') : u.text, src: r.best.chunk.title };
      }
      return { text: 'Not in the guide, so I won\'t guess.', src: 'handed to staff', gap: true };
    }
    var R = QS.map(reply);
    el.setAttribute('aria-label', 'Live demo: try it. The shop assistant answering from its guide; jump to it and ask your own question.');
    if (reduced) return;  // calm version: the first question and its real answer, already in the HTML
    var i = 0, timer = 0, on = false, hold = false, stopped = false, phase = null, xpHeld = false;
    function running() { return on && !hold && !stopped && !xpHeld; }
    function later(fn, ms) { clearTimeout(timer); phase = fn; if (running()) timer = setTimeout(function () { phase = null; fn(); }, ms); }
    function setBtn(state) {  // running: Pause · paused: Play · done: Replay (only when the visitor asks)
      if (!pauseBtn) return;
      pauseBtn.setAttribute('aria-label', state === 'running' ? 'Pause the live strip' : state === 'paused' ? 'Play the live strip' : 'Replay the live strip');
      pauseBtn.querySelector('use').setAttribute('href', state === 'running' ? '#i-pause' : state === 'paused' ? '#i-play' : '#i-replay');
    }
    function finish() { phase = null; clearTimeout(timer); el.classList.add('done'); setBtn('done'); }
    function step() {
      var q = QS[i], r = R[i], n = 0;
      el.classList.remove('answered', 'gap');
      aEl.textContent = '';
      el.classList.add('asking');
      (function type() {
        qEl.textContent = q.slice(0, ++n);
        if (n < q.length) later(type, 34 + Math.random() * 30);
        else later(function () {
          el.classList.remove('asking');
          el.classList.add('thinking');
          later(function () {
            el.classList.remove('thinking');
            aEl.textContent = r.text;
            srcEl.textContent = r.src;
            el.classList.add('answered');
            el.classList.toggle('gap', !!r.gap);
            i++;
            if (i >= QS.length) finish();  // one pass through the questions, then it stays still
            else later(step, 2900);
          }, 520);
        }, 260);
      })();
    }
    function resume() { if (phase && running()) { var f = phase; phase = null; clearTimeout(timer); timer = setTimeout(f, 300); } }
    function pause() { hold = true; clearTimeout(timer); }
    function unpause() { hold = false; resume(); }
    document.addEventListener('xp:open', function () { xpHeld = true; clearTimeout(timer); });
    document.addEventListener('xp:close', function () { xpHeld = false; resume(); });
    el.addEventListener('pointerenter', pause);
    el.addEventListener('pointerleave', unpause);
    el.addEventListener('focus', pause);
    el.addEventListener('blur', unpause);
    if (pauseBtn && hasIO) {
      pauseBtn.hidden = false;
      pauseBtn.parentNode.classList.add('has-btn');
      pauseBtn.addEventListener('click', function () {
        if (el.classList.contains('done')) {  // replay the three questions once more
          el.classList.remove('done');
          i = 0; stopped = false; el.classList.remove('paused');
          setBtn('running');
          later(step, 200);
          return;
        }
        stopped = !stopped;
        el.classList.toggle('paused', stopped);
        setBtn(stopped ? 'paused' : 'running');
        if (stopped) clearTimeout(timer); else resume();
      });
    }
    if (!hasIO) return;
    new IntersectionObserver(function (es) {
      var vis = es[es.length - 1].isIntersecting && el.offsetParent !== null;
      if (vis === on) return;
      on = vis;
      if (!on) { clearTimeout(timer); return; }
      if (phase) resume(); else if (!el.dataset.started) { el.dataset.started = '1'; later(step, 700); }
    }).observe(el);
    document.addEventListener('visibilitychange', function () { if (document.hidden) clearTimeout(timer); else if (on) resume(); });
  })();

  /* ---------- hero: hover a word, see the real recording ---------- */
  (function heroPreview() {
    var pv = $('#preview'), img = pv && $('.preview-img', pv), cap = pv && $('.preview-cap', pv), list = $('.words');
    if (!pv || !list || !canHover || reduced) return;
    var tx = 0, ty = 0, x = 0, y = 0, raf = 0, on = false, lastX = 0, rot = 0;
    function loop() {
      raf = 0;
      x += (tx - x) * 0.16; y += (ty - y) * 0.16;
      rot += ((Math.max(-6, Math.min(6, (tx - lastX) * 0.2))) - rot) * 0.1;
      lastX = x;
      pv.style.setProperty('--px', x.toFixed(1) + 'px');
      pv.style.setProperty('--py', y.toFixed(1) + 'px');
      pv.style.setProperty('--pr', rot.toFixed(2) + 'deg');
      if (on && (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3 || Math.abs(rot) > 0.05)) raf = requestAnimationFrame(loop);
    }
    function aim(cx, cy) {
      var h = heroEl.getBoundingClientRect();
      tx = cx - h.left + 28; ty = cy - h.top - 250;
      if (!raf) raf = requestAnimationFrame(loop);
    }
    function show(li) {
      if (!isWide()) return;
      var f = li.getAttribute('data-preview');
      img.style.backgroundImage = 'url("' + ASSETS + f + '")';
      cap.textContent = li.getAttribute('data-cap');
      if (!on) { on = true; pv.classList.add('on'); }
    }
    function hide() { on = false; pv.classList.remove('on'); }
    $$('.word', list).forEach(function (li) {
      li.addEventListener('pointerenter', function (e) {
        if (!on) { var h = heroEl.getBoundingClientRect(); x = tx = e.clientX - h.left + 28; y = ty = e.clientY - h.top - 250; }
        show(li); aim(e.clientX, e.clientY);
      });
      li.addEventListener('focusin', function () {
        var r = li.getBoundingClientRect();
        var h = heroEl.getBoundingClientRect();
        x = tx = r.right - h.left - 300; y = ty = r.top - h.top - 236;
        show(li); aim(r.right - 328, r.top + 14);
      });
      li.addEventListener('focusout', hide);
    });
    list.addEventListener('pointermove', function (e) { if (on) aim(e.clientX, e.clientY); }, { passive: true });
    list.addEventListener('pointerleave', hide);
  })();

  /* ==================================================================
     LAB 02: Telegram Mini App quote (prices + hours parsed from the guide)
     ================================================================== */
  soon('#booked .bench-tg', function miniApp() {
    var R = RAG.shopRules(GUIDE);
    var rangeOf = {};
    GUIDE.replace(/(\w+) e-bike range: about (\d+) km/g, function (_, k, km) { rangeOf[k.toLowerCase()] = km; return _; });
    var BIKES = Object.keys(R.prices).filter(function (k) { return /e-bike/i.test(k); });
    var SEAT = Object.keys(R.prices).filter(function (k) { return /seat/i.test(k); })[0];
    var DURS = R.cols.map(function (c, i) {
      var h = c.match(/(\d+)\s*h/);
      return { label: c, short: c.replace(/\s*\(.*\)/, ''), hours: /full/i.test(c) ? null : (h ? +h[1] : 1), col: i };
    });
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var DOW_L = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var MAX_BIKES = 6;
    var days = [];
    var base = new Date();
    base.setHours(12, 0, 0, 0);
    for (var d = 1; d <= 7; d++) {
      var dt = new Date(base.getTime() + d * 864e5);
      var hol = R.closed.filter(function (c) { return c.d === dt.getDate() && c.m === dt.getMonth(); })[0];
      days.push({ date: dt, dow: dt.getDay(), hours: R.hours[dt.getDay()], holiday: hol });
    }
    // Same booking as the real Mini App in the recording: 2 trekking e-bikes, full day, 1 child seat.
    var trekking = BIKES.filter(function (b) { return /trekking/i.test(b); })[0] || BIKES[0];
    var full = DURS.filter(function (x) { return x.hours === null; })[0];
    var st = { bike: trekking, dur: full ? full.col : 0, day: 0, time: null, bikes: 2, seats: 1 };
    while (st.day < days.length - 1 && (days[st.day].holiday || !days[st.day].hours)) st.day++;

    var bikesEl = $('#m-bikes'), durEl = $('#m-dur'), daysEl = $('#m-days'), timesEl = $('#m-times');
    var bookBtn = $('#m-book'), mini = $('#mini'), done = $('#mini-done');
    var nBikes = $('#m-n-bikes'), nSeats = $('#m-n-seats');

    bikesEl.innerHTML = BIKES.map(function (b, i) {
      var k = b.split(' ')[0].toLowerCase();
      return '<label class="opt"><input type="radio" name="bike" value="' + i + '"' + (b === st.bike ? ' checked' : '') + '>' +
        '<span><svg><use href="#i-bike"/></svg><b>' + esc(b) + '</b><small>' + (rangeOf[k] ? 'about ' + rangeOf[k] + ' km per charge' : '&nbsp;') + '</small><em>from €' + R.prices[b][0] + '/h</em></span></label>';
    }).join('');
    durEl.innerHTML = DURS.map(function (x, i) {
      return '<label class="opt"><input type="radio" name="dur" value="' + i + '"' + (i === st.dur ? ' checked' : '') + '><span>' + esc(x.short) + '</span></label>';
    }).join('');
    daysEl.innerHTML = days.map(function (x, i) {
      return '<label class="opt"><input type="radio" name="day" value="' + i + '"' + (i === st.day ? ' checked' : '') + (x.holiday || !x.hours ? ' disabled' : '') +
        ' aria-label="' + DOW_L[x.dow] + ' ' + x.date.getDate() + ' ' + MON[x.date.getMonth()] + '">' +
        '<span><small>' + DOW[x.dow] + '</small>' + x.date.getDate() + '</span></label>';
    }).join('');

    // phones: the day strip scrolls sideways; drop its edge fade once the last day is in view
    daysEl.addEventListener('scroll', function () {
      daysEl.classList.toggle('at-end', daysEl.scrollLeft + daysEl.clientWidth >= daysEl.scrollWidth - 2);
    }, { passive: true });

    function validTimes() {
      var day = days[st.day], dur = DURS[st.dur], out = [];
      if (!day.hours) return out;
      for (var h = Math.ceil(day.hours.open); h < day.hours.close; h++) {
        out.push({ h: h, ok: dur.hours ? h + dur.hours <= day.hours.close : true });
      }
      return out;
    }
    function renderTimes() {
      var ts = validTimes();
      var ok = ts.filter(function (t) { return t.ok; });
      if (!ok.some(function (t) { return t.h === st.time; })) {
        var want = st.time === null ? 9 : st.time;
        var pick = ok.filter(function (t) { return t.h <= want; }).pop() || ok[0];
        st.time = pick ? pick.h : null;
      }
      timesEl.innerHTML = ts.map(function (t) {
        return '<label class="opt"><input type="radio" name="time" value="' + t.h + '"' + (t.h === st.time ? ' checked' : '') + (t.ok ? '' : ' disabled title="Would return after closing time"') + '><span>' + hhmm(t.h) + '</span></label>';
      }).join('');
    }

    mini.addEventListener('change', function (e) {
      var t = e.target;
      if (t.name === 'bike') st.bike = BIKES[+t.value];
      else if (t.name === 'dur') st.dur = +t.value;
      else if (t.name === 'day') st.day = +t.value;
      else if (t.name === 'time') st.time = +t.value;
      else return;
      if (t.name !== 'time') renderTimes();
      update(true);
    });
    $$('.stepper', mini).forEach(function (s) {
      var key = s.getAttribute('data-step');
      $$('button', s).forEach(function (b) {
        b.addEventListener('click', function () {
          var dlt = +b.getAttribute('data-d');
          if (key === 'bikes') { st.bikes = Math.max(1, Math.min(MAX_BIKES, st.bikes + dlt)); st.seats = Math.min(st.seats, st.bikes); }
          else st.seats = Math.max(0, Math.min(st.bikes, st.seats + dlt));
          update(true);
        });
      });
    });

    var totalEl = $('#q-total'), subEl = $('#q-sub'), rulesEl = $('#q-rules'), retEl = $('#m-return');
    var shown = null, prevRules = {};
    // Screen readers hear one short line, the final total, after the visitor changes something
    // (the panel itself is not a live region: it is rebuilt and the total counts up frame by frame).
    var sayEl = $('#q-say'), sayT = 0;
    function sayTotal(total) {
      clearTimeout(sayT);
      sayT = setTimeout(function () { sayEl.textContent = 'Total €' + total; }, 500);
    }
    function animateTotal(to) {
      if (reduced || shown === null) { totalEl.textContent = '€' + to; shown = to; return; }
      var from = shown, t0 = performance.now();
      shown = to;
      (function f(now) {
        var k = Math.min(1, (now - t0) / 420), e = 1 - Math.pow(1 - k, 3);
        totalEl.textContent = '€' + Math.round(from + (to - from) * e);
        if (k < 1 && shown === to) requestAnimationFrame(f);
      })(t0);
    }
    function quote() {
      var dur = DURS[st.dur], day = days[st.day];
      var unit = R.prices[st.bike][dur.col], seatUnit = SEAT ? R.prices[SEAT][dur.col] : 0;
      var bikeP = unit * st.bikes, seatP = seatUnit * st.seats;
      var ret = day.hours ? (dur.hours ? st.time + dur.hours : day.hours.close) : null;
      return { dur: dur, day: day, unit: unit, seatUnit: seatUnit, bikeP: bikeP, seatP: seatP, total: bikeP + seatP, ret: ret };
    }
    function dayLabel(day) { return DOW[day.dow] + ' ' + day.date.getDate() + ' ' + MON[day.date.getMonth()]; }
    function bikeLine(q) { return st.bikes + '× ' + st.bike + ' · ' + q.dur.label + (st.seats ? ' · ' + st.seats + ' child seat' + (st.seats > 1 ? 's' : '') : ''); }

    var ownerBody = $('#owner-body'), ownerState = $('#owner-state'), count = 0, ghost = null;
    function ghostHtml(q, n) {
      return '<b>NordLight Bikes bot</b>New booking #' + n + ' (demo)<br>' + esc(bikeLine(q)) +
        '<br>' + dayLabel(q.day) + ', ' + hhmm(st.time) + ' → ' + hhmm(q.ret) + '<br>Total €' + q.total + ', pay at pickup';
    }
    function renderGhost(q) {
      if (!ghost) {
        ghost = document.createElement('div');
        ghost.className = 'tg-msg ghost';
        ownerBody.appendChild(ghost);
      }
      ghost.innerHTML = ghostHtml(q, count + 1) + '<span class="t"></span>';
    }

    function update(byVisitor) {
      var q = quote(), day = q.day;
      var closedTxt = R.closed.map(function (c) { return c.d + ' ' + MON[c.m]; }).join(', ');
      var rows = [
        ['price', true, st.bikes + '× ' + esc(st.bike) + ' · ' + esc(q.dur.label) + ' <span class="why">€' + q.unit + ' each = €' + q.bikeP + '</span>', 'guide › Prices'],
        st.seats ? ['seat', true, st.seats + '× child seat <span class="why">€' + q.seatUnit + ' each = €' + q.seatP + '</span>', 'guide › Prices'] : null,
        ['open', !!day.hours, 'Open ' + DOW_L[day.dow] + ' <span class="why">' + (day.hours ? hhmm(day.hours.open) + '–' + hhmm(day.hours.close) : 'closed') + '</span>', 'guide › Opening hours'],
        ['ret', q.ret !== null && q.ret <= day.hours.close, 'Return by ' + hhmm(q.ret) + ' <span class="why">' + (q.dur.hours ? 'before closing, ' + hhmm(day.hours.close) : 'closing time') + '</span>', 'guide › Opening hours'],
        ['hol', !day.holiday, dayLabel(day) + ' <span class="why">is not a closing day (' + closedTxt + ')</span>', 'guide › Opening hours'],
        ['gear', true, 'Helmet and lock <span class="why">included</span>', 'guide › Prices'],
        // The €100 is the guide's; charging it per bike is the real Mini App's own rule (the recording shows €200 for 2 bikes).
        ['dep', true, '€' + R.deposit * st.bikes + ' deposit <span class="why">the guide\'s €' + R.deposit + ', per bike, held on the card until the ' +
          (st.bikes > 1 ? 'bikes come' : 'bike comes') + ' back undamaged</span>', 'Mini App rule, as recorded'],
        ['canc', true, 'Free cancellation <span class="why">up to 24 h before pickup</span>', 'guide › Cancellation']
      ].filter(Boolean);
      rulesEl.innerHTML = rows.map(function (r) {
        var changed = prevRules[r[0]] !== undefined && prevRules[r[0]] !== r[2];
        return '<li class="' + (r[1] ? '' : 'bad ') + (changed && !reduced ? 'flash' : '') + '"><svg><use href="#i-check"/></svg><span>' + r[2] + ' <span class="from">' + r[3] + '</span></span></li>';
      }).join('');
      prevRules = {};
      rows.forEach(function (r) { prevRules[r[0]] = r[2]; });
      animateTotal(q.total);
      if (byVisitor && sayEl) sayTotal(q.total);
      subEl.textContent = 'pay at pickup, card or cash · ' + dayLabel(day) + ', ' + hhmm(st.time) + '–' + hhmm(q.ret);
      retEl.textContent = 'return by ' + hhmm(q.ret);
      bookBtn.textContent = 'Book · €' + q.total;
      // <output> is a status region: touch it only when the number really changes
      if (nBikes.textContent !== String(st.bikes)) nBikes.textContent = st.bikes;
      if (nSeats.textContent !== String(st.seats)) nSeats.textContent = st.seats;
      $('[data-step="bikes"] [data-d="-1"]', mini).disabled = st.bikes <= 1;
      $('[data-step="bikes"] [data-d="1"]', mini).disabled = st.bikes >= MAX_BIKES;
      $('[data-step="seats"] [data-d="-1"]', mini).disabled = st.seats <= 0;
      $('[data-step="seats"] [data-d="1"]', mini).disabled = st.seats >= st.bikes;
      $('#m-seat-price').textContent = SEAT ? '€' + q.seatUnit + ' each for ' + q.dur.short.toLowerCase() : 'add-on';
      renderGhost(q);
    }

    mini.addEventListener('submit', function (e) {
      e.preventDefault();
      setProof('booked');
      var q = quote();
      count++;
      $('#done-list').innerHTML = [
        ['Bikes', st.bikes + '× ' + esc(st.bike)], ['Child seats', String(st.seats)], ['Duration', esc(q.dur.label)],
        ['Pickup', dayLabel(q.day) + ', ' + hhmm(st.time)], ['Return by', hhmm(q.ret)], ['Deposit', '€' + R.deposit * st.bikes + ' on card'], ['Total', '€' + q.total]
      ].map(function (r, i, a) { return '<div' + (i === a.length - 1 ? ' class="tot"' : '') + '><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('');
      mini.hidden = true;
      done.hidden = false;
      var doneH = $('h3', done);
      if (doneH) { doneH.tabIndex = -1; doneH.focus(); }
      if (ghost) {
        ghost.className = 'tg-msg sent';
        ghost.innerHTML = ghostHtml(q, count) + '<span class="t">just now <svg><use href="#i-check"/></svg></span>';
        ghost = null;
      }
      ownerState.textContent = count + (count > 1 ? ' new messages' : ' new message');
      var lane = $('.tg-owner');
      if (lane && !reduced) { lane.classList.remove('ping'); void lane.offsetWidth; lane.classList.add('ping'); }
      while (ownerBody.children.length > 2) ownerBody.removeChild(ownerBody.firstChild);
    });
    $('#m-again').addEventListener('click', function () { done.hidden = true; mini.hidden = false; update(); bookBtn.focus(); });

    renderTimes();
    update();
  });

  /* ---------- shared: speed controls + run buttons ---------- */
  function speedControl(root) {
    var el = $('.speed', root);
    var speeds = el.getAttribute('data-speeds').split(',').map(Number);
    var cur = +el.getAttribute('data-default');
    el.innerHTML = speeds.map(function (s) {
      return '<button type="button" aria-pressed="' + (s === cur) + '" data-s="' + s + '">' + (s === 1 ? 'real time' : s + '×') + '</button>';
    }).join('');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      cur = +b.getAttribute('data-s');
      $$('button', el).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
    return function () { return cur; };
  }
  function setRunBtn(btn, state, label) {
    btn.classList.toggle('running', state === 'running');
    btn.querySelector('span').textContent = label;
    btn.querySelector('use').setAttribute('href', state === 'running' ? '#i-pause' : state === 'paused' ? '#i-play' : '#i-replay');
  }

  /* ==================================================================
     LAB 03: scraper replay (real log, real counts, real sample rows)
     ================================================================== */
  function parseCSV(text) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    var head = rows.shift();
    return rows.map(function (r) { var o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o; });
  }

  soon('#scraper', function scraper() {
    var root = $('#scraper');
    var lines = parseLog(raw('data-scraper-log'));
    var books = parseCSV(raw('data-books'));
    var getSpeed = speedControl(root);
    var btn = $('#sc-run'), logEl = $('#sc-log'), histEl = $('#sc-hist'), body = $('#sc-body');
    var tscroll = $('#sc-tscroll');
    var ctr = {};
    $$('[data-k]', root).forEach(function (b) { ctr[b.getAttribute('data-k')] = b; });

    // Requests per line, derived from the log: 1 for the catalogue home page, then one listing
    // page per 20 books in each category; afterwards one request per book page. The total
    // matches the "1081 requests" the run reports at the end.
    var cats = [], req = 0, listing = 0, fetchT = null, checkpoints = [], final = null;
    lines.forEach(function (l) {
      var m;
      if (/^start:/.test(l.msg)) { req = 1; l.kind = 'ln-dim'; }
      else if ((m = l.msg.match(/^category (.+): (\d+) books$/))) {
        req += Math.ceil(+m[2] / 20);
        l.cat = cats.length;
        cats.push({ name: m[1], n: +m[2] });
        l.kind = 'ln-cat';
      } else if (/^fetching/.test(l.msg)) { listing = req; fetchT = l.t; checkpoints.push({ t: l.t, k: 0 }); l.kind = 'ln-parse'; }
      else if ((m = l.msg.match(/^parsed (\d+)\/(\d+) books$/))) { checkpoints.push({ t: l.t, k: +m[1] }); l.kind = 'ln-parse'; }
      else if ((m = l.msg.match(/^done: (\d+) books, (\d+) requests, (\d+) retries, (\d+) errors, (\d+) s$/))) {
        l.done = final = { books: +m[1], requests: +m[2], retries: +m[3], errors: +m[4], seconds: +m[5] };
        l.kind = 'ln-ok';
      } else if (/^(database|saved)/.test(l.msg)) { l.kind = 'ln-ok'; }
      l.req = req;
    });
    var maxN = Math.max.apply(null, cats.map(function (c) { return c.n; }));
    histEl.innerHTML = cats.map(function (c) { return '<i style="--h:' + Math.max(4, c.n / maxN * 100).toFixed(1) + '%" title="' + esc(c.name) + ': ' + c.n + ' books"></i>'; }).join('');
    var bars = $$('i', histEl);
    var END = lines[lines.length - 1].t;
    var totalBooks = cats.reduce(function (a, c) { return a + c.n; }, 0);

    function stars(n) { var s = ''; for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '<s>★</s>'; return s; }
    function bookRow(b, i, fresh) {
      return '<tr' + (fresh ? ' class="new"' : '') + '><td>' + (i + 1) + '</td><td class="t" title="' + esc(b.title) + '">' + esc(b.title) + '</td><td class="num">£' + (+b.price_gbp).toFixed(2) + '</td><td class="stars" aria-label="' + b.rating + ' of 5 stars">' + stars(+b.rating) + '</td><td class="num">' + esc(b.stock_count) + '</td></tr>';
    }
    function lineHtml(l) { return '<div class="ln ' + (l.kind || '') + '"><span class="ts">[' + l.ts + ']</span> ' + esc(l.msg) + '</div>'; }
    function booksAt(v) {
      if (fetchT === null || v < fetchT) return 0;
      for (var i = 1; i < checkpoints.length; i++) {
        var a = checkpoints[i - 1], b = checkpoints[i];
        if (v <= b.t) return a.k + (b.k - a.k) * (v - a.t) / Math.max(1e-6, b.t - a.t);
      }
      return checkpoints[checkpoints.length - 1].k;
    }
    function setPhase(t) { $('#sc-phase').textContent = t; }
    function showFinal() {
      logEl.classList.remove('live');
      logEl.innerHTML = lines.map(lineHtml).join('');
      requestAnimationFrame(function () { logEl.scrollTop = logEl.scrollHeight; });
      bars.forEach(function (b) { b.classList.add('on'); b.classList.remove('last'); });
      body.innerHTML = books.map(function (b, i) { return bookRow(b, i, false); }).join('');
      tscroll.scrollTop = 0;
      ctr.books.textContent = fmt(final.books);
      ctr.requests.textContent = fmt(final.requests);
      ctr.seconds.textContent = final.seconds;
      ctr.retries.textContent = final.retries;
      ctr.errors.textContent = final.errors;
      $$('.file', root).forEach(function (f) { f.classList.add('on'); });
      setPhase('done in ' + final.seconds + ' s');
      $('#sc-cat').textContent = cats.length + ' categories · ' + fmt(totalBooks) + ' books';
      $('#sc-rows').textContent = books.length + ' / ' + books.length;
    }

    var run = null;
    function start() {
      logEl.innerHTML = '';
      logEl.classList.add('live');
      bars.forEach(function (b) { b.classList.remove('on', 'last'); });
      body.innerHTML = '';
      $$('.file', root).forEach(function (f) { f.classList.remove('on'); });
      Object.keys(ctr).forEach(function (k) { ctr[k].textContent = '0'; });
      $('#sc-cat').innerHTML = '&nbsp;';
      $('#sc-rows').textContent = '0 / ' + books.length;
      run = { v: 0, next: 0, rows: 0, last: performance.now(), paused: false };
      setRunBtn(btn, 'running', 'Pause');
      setPhase('listing categories');
      requestAnimationFrame(frame);
    }
    function frame(now) {
      if (!run || run.paused) return;
      var dt = Math.min(0.1, (now - run.last) / 1000);
      run.last = now;
      run.v = Math.min(END, run.v + dt * getSpeed());
      var v = run.v, finished = null;
      while (run.next < lines.length && lines[run.next].t <= v) {
        var l = lines[run.next++];
        logEl.insertAdjacentHTML('beforeend', lineHtml(l));
        if (l.cat !== undefined) {
          bars.forEach(function (b) { b.classList.remove('last'); });
          bars[l.cat].classList.add('on', 'last');
          $('#sc-cat').textContent = cats[l.cat].name + ' · ' + cats[l.cat].n + ' books';
        }
        if (/^fetching/.test(l.msg)) setPhase('fetching book pages');
        if (/^database/.test(l.msg)) setPhase('saving files');
        if (/^saved/.test(l.msg)) $$('.file', root).forEach(function (f, i) { setTimeout(function () { f.classList.add('on'); }, i * 140); });
        if (l.done) finished = l.done;
        run.req = l.req;
      }
      logEl.scrollTop = logEl.scrollHeight;
      var bk = booksAt(v);
      ctr.books.textContent = fmt(bk);
      ctr.requests.textContent = fmt(fetchT !== null && v >= fetchT ? listing + bk : (run.req || 0));
      ctr.seconds.textContent = Math.floor(v);
      var want = Math.min(books.length, Math.floor(bk / (1000 / books.length)));
      while (run.rows < want) {
        body.insertAdjacentHTML('beforeend', bookRow(books[run.rows], run.rows, true));
        run.rows++;
        tscroll.scrollTop = tscroll.scrollHeight;
        $('#sc-rows').textContent = run.rows + ' / ' + books.length;
      }
      if (finished) {
        ctr.books.textContent = fmt(finished.books);
        ctr.requests.textContent = fmt(finished.requests);
        ctr.seconds.textContent = finished.seconds;
        ctr.retries.textContent = finished.retries;
        ctr.errors.textContent = finished.errors;
        setPhase('done in ' + finished.seconds + ' s');
        $('#sc-cat').textContent = cats.length + ' categories · ' + fmt(totalBooks) + ' books';
        bars.forEach(function (b) { b.classList.remove('last'); });
        run = null;
        setRunBtn(btn, 'done', 'Replay the run');
        setProof('measured');
        return;
      }
      requestAnimationFrame(frame);
    }
    btn.addEventListener('click', function () {
      if (!run) { start(); return; }
      run.paused = !run.paused;
      if (run.paused) setRunBtn(btn, 'paused', 'Resume');
      else { run.last = performance.now(); setRunBtn(btn, 'running', 'Pause'); requestAnimationFrame(frame); }
    });

    $('#sc-download').addEventListener('click', function () {
      var cols = ['title', 'category', 'price_gbp', 'rating', 'in_stock', 'stock_count', 'url'];
      var csv = cols.join(',') + '\n' + books.map(function (b) {
        return cols.map(function (c) { var s = String(b[c] == null ? '' : b[c]); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
      }).join('\n') + '\n';
      var url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'books_sample.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    });

    showFinal();
    if (hasIO) new IntersectionObserver(function (es) { if (es[0].isIntersecting && !run) logEl.scrollTop = logEl.scrollHeight; }).observe(logEl);
    if (reduced) whenVisible(root, 0.4, function () { setProof('measured'); });
    else whenVisible(root, 0.35, function () { if (!run) start(); });
  });

  /* ==================================================================
     LAB 04: deploy replay (real deploy + HTTPS logs) with the crash test
     ================================================================== */
  soon('#deploy', function deploy() {
    var root = $('#deploy');
    // Two real runs: deploy.sh, then (5 s later, by hand) deploy/https_tunnel.sh. Times are measured from the first line.
    var dLines = parseLog(raw('data-deploy-log'));
    var lines = dLines.concat(parseLog(raw('data-https-log')));
    var t0 = lines[0].abs;
    lines.forEach(function (l) { l.t = l.abs - t0; });
    var HTTPS_CMD = 'bash deploy/https_tunnel.sh';
    if (lines[dLines.length]) lines[dLines.length].run = HTTPS_CMD;
    var getSpeed = speedControl(root);
    var btn = $('#dp-run'), term = $('#dp-term'), stepsEl = $('#dp-steps'), mon = $('#dp-monitor');
    var statusEl = $('#dp-status'), restartsEl = $('#dp-restarts'), elapsedEl = $('#dp-elapsed');
    var crash = $('#dp-crash'), crashTitle = $('#dp-crash-title'), crashSub = $('#dp-crash-sub'), countEl = $('#dp-count');

    var SHORT = ['System packages', 'Dedicated user', 'Application code', 'Python venv', 'Secrets file', 'systemd service', 'Nginx proxy', 'Daily backup', 'Crash test', 'Install cloudflared', 'Tunnel service', 'Public HTTPS'];
    var steps = [];
    lines.forEach(function (l, i) {
      var m;
      if ((m = l.msg.match(/^== (\d)\/9 (.+)/))) { l.step = steps.length; steps.push({ name: m[2], t: l.t, i: i }); }
      else if ((m = l.msg.match(/^== HTTPS (\d)\/3 (.+)/))) { l.step = steps.length; steps.push({ name: m[2], t: l.t, i: i, https: true }); }
      // "== Deployed" closes the last deploy.sh step (the crash test): the idle gap before the HTTPS script is nobody's step
      else if (/^== Deployed/.test(l.msg) && steps.length) { steps[steps.length - 1].end = l.t; l.closes = true; }
    });
    var killIdx = -1;
    lines.forEach(function (l, i) { if (killIdx < 0 && /systemctl kill -s KILL/.test(l.msg)) killIdx = i; });
    var reviveIdx = -1;
    for (var k = killIdx + 1; k < lines.length; k++) { if (lines[k].msg === 'active') { reviveIdx = k; break; } }
    var END = lines[lines.length - 1].t;
    var finalRestarts = '0';
    lines.forEach(function (l) { var m = l.msg.match(/^NRestarts=(\d+)/); if (m) finalRestarts = m[1]; });

    stepsEl.innerHTML = steps.map(function (s, i) {
      var first = s.https && !steps[i - 1].https;  // the HTTPS script's steps get their own heading: its command
      return '<li class="' + (first ? 'sep-https' : '') + (/crash/i.test(s.name) ? ' step-crash' : '') + '"' + (first ? ' data-run="then # ' + esc(HTTPS_CMD) + '"' : '') + ' title="' + esc(s.name) + '"><span class="n">' + (s.https ? 'H' + (i - 8) : i + 1) + '</span><span class="nm">' + esc(SHORT[i] || s.name) + '</span><span class="tm"></span></li>';
    }).join('');
    var stepEls = $$('li', stepsEl);
    function stepDur(i) {
      var s = steps[i], end = s.end !== undefined ? s.end : i + 1 < steps.length ? steps[i + 1].t : END;
      return Math.max(0, end - s.t);
    }
    function closeStep(i) {
      stepEls[i].classList.remove('active');
      stepEls[i].classList.add('done');
      $('.tm', stepEls[i]).textContent = stepDur(i) + ' s';
    }

    /* --- ECG / health monitor --- */
    /* The trace only moves during a replay (and a few seconds after it), and only while it is on screen;
       the rest of the time it is a still picture of a healthy beat. */
    var canvas = $('#dp-ecg'), ctx = canvas.getContext('2d');
    var ecg = { state: 'idle', pts: [], beat: 0, boost: 0, raf: 0, visible: false, w: 0, h: 0, until: 0 };
    var ECG_TAIL = 2500;
    var BEAT = [0, .04, .08, .04, 0, 0, -.08, .95, -.4, .05, 0, 0, .1, .16, .1, 0];
    function sizeCanvas() {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
      ecg.w = r.width; ecg.h = r.height; ecg.dpr = dpr;
      var n = Math.ceil(r.width / 2) + 2;
      while (ecg.pts.length < n) ecg.pts.unshift(0);
      if (ecg.pts.length > n) ecg.pts = ecg.pts.slice(ecg.pts.length - n);
      if (reduced || !ecgMoving()) staticTrace();
      drawEcg();
    }
    // a paused replay holds the trace still too (WCAG 2.2.2: Pause stops everything that moves in this window)
    function ecgMoving() { return !reduced && ((!!run && !run.paused) || performance.now() < ecg.until); }
    function staticTrace() { ecg.pts = ecg.pts.map(function (_, i) { return ecg.state === 'ok' ? (BEAT[i % 46] || 0) * 0.8 : 0; }); }
    function sample() {
      if (ecg.state === 'ok') {
        ecg.beat++;
        var period = 46, p = ecg.beat % period;
        var v = p < BEAT.length ? BEAT[p] * (ecg.boost > 0 ? 1.25 : 0.8) : 0;
        if (p === 0 && ecg.boost > 0) ecg.boost--;
        return v + (Math.random() - 0.5) * 0.03;
      }
      if (ecg.state === 'dead') return (Math.random() - 0.5) * 0.015;
      return 0;
    }
    function drawEcg() {
      var w = ecg.w, h = ecg.h, dpr = ecg.dpr || 1;
      if (!w) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(160,190,220,.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5); ctx.stroke();
      var col = ecg.state === 'ok' ? '#4fd18b' : ecg.state === 'dead' ? '#ff5b4f' : '#3a4a5a';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.shadowColor = col;
      ctx.shadowBlur = ecg.state === 'idle' ? 0 : 8;
      ctx.beginPath();
      for (var i = 0; i < ecg.pts.length; i++) {
        var x = w - (ecg.pts.length - 1 - i) * 2, y = h / 2 - ecg.pts[i] * (h * 0.42);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      var g = ctx.createLinearGradient(0, 0, 60, 0);
      g.addColorStop(0, 'rgba(13,21,30,1)'); g.addColorStop(1, 'rgba(13,21,30,0)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = g; ctx.fillRect(0, 0, 60, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    function ecgLoop() {
      ecg.raf = 0;
      // stops off screen, in a background tab, and once the replay is over (the last frame stays as it is)
      if (!ecg.visible || ecg.state === 'idle' || document.hidden || !ecgMoving()) return;
      for (var s = 0; s < 2; s++) { ecg.pts.push(sample()); ecg.pts.shift(); }
      drawEcg();
      ecg.raf = requestAnimationFrame(ecgLoop);
    }
    function kickEcg() { if (!ecg.raf && ecg.visible && !document.hidden && ecgMoving()) ecg.raf = requestAnimationFrame(ecgLoop); }
    function setEcg(state) {
      ecg.state = state;
      if (!ecgMoving()) { staticTrace(); drawEcg(); return; }
      kickEcg();
      if (state !== 'ok') drawEcg();
    }
    if (hasIO) {
      new IntersectionObserver(function (es) {
        ecg.visible = es[es.length - 1].isIntersecting;
        if (ecg.visible && !ecg.w) sizeCanvas();
        if (ecg.visible && !run) term.scrollTop = term.scrollHeight;
        if (ecg.visible) kickEcg();
      }).observe(canvas);
    } else ecg.visible = true;
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kickEcg(); });
    window.addEventListener('resize', sizeCanvas);

    function setStatus(cls, txt) {
      mon.classList.remove('ok', 'dead');
      if (cls) mon.classList.add(cls);
      statusEl.textContent = txt;
    }

    function lineEl(l) {
      var d = document.createElement('div'), m = l.msg;
      if (m === '') { d.className = 'ln'; d.innerHTML = '&nbsp;'; d.style.lineHeight = '.7'; return d; }
      if (/^== /.test(m)) { d.className = 'ln ' + (/^== Deployed/.test(m) ? 'ln-live' : 'ln-h'); d.textContent = m; return d; }
      if (/^\$ /.test(m)) {
        d.className = 'ln ln-c' + (/kill -s KILL/.test(m) ? ' ln-kill' : '');
        d.innerHTML = '<span class="pr">$</span> ' + esc(m.slice(2));
        return d;
      }
      d.className = 'ln ' + (/^\{"ok":true/.test(m) || /^(active|NRestarts|dependencies ok|backup ok|public url|nginx: .*(ok|successful))/.test(m) ? 'ln-j' : 'ln-o');
      d.textContent = m;
      return d;
    }
    /* a log line, preceded by the command that started its run when it is the first line of the HTTPS log */
    function addLine(target, l) {
      if (l.run) {
        var c = document.createElement('div');
        c.className = 'ln ln-run';
        c.innerHTML = '<span class="pr">#</span> ' + esc(l.run);
        target.appendChild(c);
      }
      target.appendChild(lineEl(l));
    }
    function showFinal() {
      term.classList.remove('live');
      term.innerHTML = '';
      var frag = document.createDocumentFragment();
      lines.forEach(function (l) { addLine(frag, l); });
      term.appendChild(frag);
      requestAnimationFrame(function () { term.scrollTop = term.scrollHeight; });
      stepEls.forEach(function (li, i) { closeStep(i); });
      setStatus('ok', 'live on HTTPS · all services up');
      restartsEl.textContent = finalRestarts;
      elapsedEl.textContent = END + ' s';
      root.classList.remove('is-crash', 'shake');
      root.classList.add('is-live');
      crash.classList.remove('show', 'revived');
      setEcg('ok');
    }

    /* --- playback --- */
    var run = null;
    function start(byVisitor) {
      // the crash card is a live region only for a replay the visitor asked for, not the one that starts by itself
      crash.setAttribute('aria-live', byVisitor ? 'polite' : 'off');
      term.innerHTML = '';
      term.classList.add('live');
      stepEls.forEach(function (li) { li.classList.remove('active', 'done'); $('.tm', li).textContent = ''; });
      setStatus('', 'not installed yet');
      restartsEl.textContent = '0';
      elapsedEl.textContent = '0 s';
      root.classList.remove('is-crash', 'is-live', 'shake');
      crash.classList.remove('show', 'revived');
      setEcg('idle');
      run = { v: 0, next: 0, queue: [], lastEmit: 0, last: performance.now(), crashMode: false, step: -1, wait: null, healthy: false, paused: false };
      setRunBtn(btn, 'running', 'Pause');
      requestAnimationFrame(frame);
    }
    function emit(i) {
      var l = lines[i];
      if (run.wait) { run.wait.remove(); run.wait = null; }
      addLine(term, l);
      if (l.step !== undefined) {
        if (run.step >= 0) closeStep(run.step);
        run.step = l.step;
        stepEls[l.step].classList.add('active');
      }
      if (l.closes && run.step >= 0) { closeStep(run.step); run.step = -1; }
      var m = l.msg;
      if (m === 'active' && i < killIdx) { setStatus('ok', 'active (running)'); setEcg('ok'); run.healthy = true; }
      if (/^\{"ok":true/.test(m)) {
        ecg.boost = 2;
        if (i > reviveIdx && reviveIdx > 0) setTimeout(function () { crash.classList.remove('show'); root.classList.remove('is-crash'); }, 1400);
        else if (run.healthy) setStatus('ok', 'active · health ok');
      }
      if (i === killIdx) {
        run.crashMode = true;
        setStatus('dead', 'killed (SIGKILL)');
        setEcg('dead');
        root.classList.add('is-crash');
        if (!reduced) { root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake'); }
        $('#dp-crash-icon').setAttribute('href', '#i-zap');
        crashTitle.textContent = 'App killed on purpose';
        crashSub.textContent = 'SIGKILL sent · the script now waits 5 s';
        countEl.textContent = '5';
        crash.classList.remove('revived');
        crash.classList.add('show');
      }
      if (i === reviveIdx) {
        run.crashMode = false;
        setStatus('ok', 'active again, by itself');
        setEcg('ok');
        ecg.boost = 3;
        crash.classList.add('revived');
        $('#dp-crash-icon').setAttribute('href', '#i-revive');
        crashTitle.textContent = 'systemd brought it back';
        crashSub.textContent = 'nobody touched the server';
        countEl.textContent = 'OK';
        setProof('alwayson');
      }
      if (/^NRestarts=(\d+)/.test(m)) restartsEl.textContent = m.split('=')[1];
      if (/^== Deployed/.test(m)) setStatus('ok', 'deployed behind Nginx');
      if (/^public url:/.test(m)) { setStatus('ok', 'live on public HTTPS'); root.classList.add('is-live'); }
      term.scrollTop = term.scrollHeight;
    }
    function frame(now) {
      if (!run || run.paused) return;
      var dt = Math.min(0.1, (now - run.last) / 1000);
      run.last = now;
      var gap = getSpeed() === 1 ? 30 : 42;
      if (run.queue.length) {
        if (now - run.lastEmit >= gap) { emit(run.queue.shift()); run.lastEmit = now; }
      } else {
        run.v = Math.min(END, run.v + dt * (run.crashMode ? 1 : getSpeed()));
        while (run.next < lines.length && lines[run.next].t <= run.v) run.queue.push(run.next++);
        // waiting on a slow command: show it is still running
        var lastL = lines[run.next - 1], nextL = lines[run.next];
        if (lastL && nextL && run.v - lastL.t >= 1 && !run.crashMode && /^\$ /.test(lastL.msg)) {
          if (!run.wait) { run.wait = document.createElement('div'); run.wait.className = 'ln wait'; term.appendChild(run.wait); term.scrollTop = term.scrollHeight; }
          var sp = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[Math.floor(now / 90) % 10];
          run.wait.innerHTML = '<span class="spin">' + sp + '</span> running · ' + Math.floor(run.v - lastL.t) + ' s';
        }
        if (run.crashMode) {
          var left = String(Math.max(0, Math.ceil(lines[killIdx].t + 5 - run.v)));
          if (countEl.textContent !== left) countEl.textContent = left;
        }
      }
      var secs = Math.floor(run.v) + ' s';
      if (elapsedEl.textContent !== secs) elapsedEl.textContent = secs;
      if (run.next >= lines.length && !run.queue.length) {
        if (run.step >= 0) closeStep(run.step);
        elapsedEl.textContent = END + ' s';
        setStatus('ok', 'live on HTTPS · all services up');
        run = null;
        ecg.until = performance.now() + ECG_TAIL;  // the trace runs on for a moment, then holds still
        setRunBtn(btn, 'done', 'Replay the deploy');
        return;
      }
      requestAnimationFrame(frame);
    }
    btn.addEventListener('click', function () {
      if (!run) { start(true); return; }
      run.paused = !run.paused;
      if (run.paused) setRunBtn(btn, 'paused', 'Resume');
      else { run.last = performance.now(); setRunBtn(btn, 'running', 'Pause'); requestAnimationFrame(frame); kickEcg(); }
    });

    sizeCanvas();
    showFinal();
    if (reduced) whenVisible(root, 0.4, function () { setProof('alwayson'); });
    else whenVisible(root, 0.35, function () { if (!run) start(false); });
  });

  if (document.readyState === 'complete') idle(drainSoon);
  else window.addEventListener('load', function () { idle(drainSoon); });

  /* ---------- how we'll work: every station turns to GO as it scrolls in ---------- */
  (function () {
    var items = $$('#golist li');
    if (!hasIO) { items.forEach(function (li) { li.classList.add('go'); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = items.indexOf(e.target);
        setTimeout(function () { e.target.classList.add('go'); }, reduced ? 0 : (window.innerWidth > 980 ? i * 220 : 0));
        io.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    items.forEach(function (li) { io.observe(li); });
  })();
})();

/* Full experience: loaded (next to this script) only on click, which also makes the audio context. Esc or a 2nd click cancels a load. */
(function () {
  var me = document.currentScript, base = (me && me.src) || location.href, asked = false, st, cur = null, D = document;
  function quiet(p) { if (p && p.catch) p.catch(function () {}); }
  function reset(c) {
    cur = null; D.removeEventListener('keydown', esc, true); c.from.removeAttribute('aria-busy'); window.__xp.state = 'closed';
    if (window.__xpBoot === c) window.__xpBoot = null;
    if (c.audio) try { quiet(c.audio.close()); } catch (x) {}
  }
  function cancel() { if (!cur || cur.open) return false; cur.cancelled = true; reset(cur); return true; }
  function esc(e) { if (/^Esc/.test(e.key) && cancel()) e.preventDefault(); }
  function start(e) {
    if (e.detail > 1) return;   // the second click of a double-click: keep the load going
    var b = e.currentTarget, w = window, AC = w.AudioContext || w.webkitAudioContext, s = w.speechSynthesis, ac = null, u, t = b.querySelector('small');
    if (w.__xp && /^(loading|question|playing|paused|finale)$/.test(w.__xp.state)) { cancel(); return; }
    if (b.xpL == null) { b.xpL = b.getAttribute('aria-label'); b.xpT = t && t.textContent; }
    if (b.xpL) b.setAttribute('aria-label', b.xpL);
    if (t) t.textContent = b.xpT;
    if (!st) { st = D.createElement('p'); st.className = 'sr-only'; st.setAttribute('role', 'status'); D.body.appendChild(st); }
    st.textContent = '';
    try { if (AC) { ac = new AC(); quiet(ac.resume()); } } catch (x) { ac = null; }
    try { if (s && w.SpeechSynthesisUtterance) { s.cancel(); u = new SpeechSynthesisUtterance(' '); u.volume = 0; s.speak(u); } } catch (x) {}
    w.__xp = { state: 'loading', scene: 'loading', t: 0, quality: '', fps: 0 };
    cur = w.__xpBoot = { audio: ac, from: b };
    D.addEventListener('keydown', esc, true);
    b.setAttribute('aria-busy', 'true');
    if (w.__xpStart) { w.__xpStart(w.__xpBoot); return; }
    if (asked) return;
    asked = true;
    var sc = D.createElement('script');
    sc.type = 'module'; sc.src = new URL('xp/experience.js', base).href;
    sc.onload = function () { sc.onload = sc.onerror = null; sc.remove(); };  // keeps nothing alive
    sc.onerror = function () {
      sc.onload = sc.onerror = null; sc.remove();
      asked = false; reset(w.__xpBoot || { from: b, audio: ac });
      if (t) t.textContent = 'Could not load · try again';
      b.setAttribute('aria-label', 'Full experience could not load. Try again.');
      setTimeout(function () { st.textContent = 'The full experience could not load. Try again.'; }, 60);
    };
    D.head.appendChild(sc);
  }
  var bs = D.querySelectorAll('[data-xp-start]');
  for (var i = 0; i < bs.length; i++) bs[i].addEventListener('click', start);
})();
