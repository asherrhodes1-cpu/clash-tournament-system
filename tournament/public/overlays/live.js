/* Keeps an overlay in step with the website's control page (/overlay-control).

   Staff fill the match in once there; it is saved to the site's database and
   every overlay showing in OBS redraws itself the moment it changes. Without
   this file, or with ?live=0 on the address, an overlay works as it did on
   its own: from its address and from what was typed into it in OBS.

   config.js, written when the site is built, says which database to read. */
(function () {
  /* An overlay is drawn for a 1920 by 1080 Browser source. OBS makes new ones
     800 by 600, which draws everything at well under half size and then
     stretches it: soft, with the small text unreadable. Inside OBS, say so on
     the overlay itself until the source is the right size. */
  function checkSize() {
    var note = document.getElementById('sizeNote');
    var wrong = !!window.obsstudio && (window.innerWidth < 1900 || window.innerHeight < 1060);
    if (!wrong) {
      if (note) note.remove();
      return;
    }
    if (!note) {
      note = document.createElement('div');
      note.id = 'sizeNote';
      note.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99999;background:#c81e1e;color:#fff;font:bold 20px/1.3 system-ui,sans-serif;padding:10px 14px;text-align:center';
      document.body.appendChild(note);
    }
    note.textContent = 'This Browser source is ' + window.innerWidth + ' x ' + window.innerHeight + '. In OBS, open its Properties and set Width 1920, Height 1080 - then this overlay will be sharp.';
  }
  window.addEventListener('resize', checkSize);
  window.addEventListener('load', checkSize);
  checkSize();

  /* What the audience is being asked, on the caster desk: the only overlay
     up while a vote or a quiz runs. A quiz question is drawn with its
     answers in a panel that covers the matchup and the vote bar whole; while the vote on a match is
     open, the vote bar's label asks who wins. Staff put these up on the
     control page, and viewers answer on the website, under the stream.
     `league` is the finals section as saved in live/league. */
  var asks = !!window.__overlay && window.__overlay.name === 'caster-desk';
  if (asks) (function promptStyle() {
    var style = document.createElement('style');
    style.textContent = [
      /* The matchup is 130 to 1790 across and starts 804 down; the vote bar
         ends near the foot. The frame is the caster cams' own: the page's
         stone, around a dark inset. */
      '#prompt{position:absolute;left:110px;width:1700px;top:780px;bottom:22px;z-index:9000;pointer-events:none;box-sizing:border-box;border-radius:34px;padding:16px;display:flex;animation:pqIn .45s cubic-bezier(.2,1.3,.4,1)}',
      '@keyframes pqIn{from{opacity:0;transform:translateY(40px) scale(.96)}to{opacity:1;transform:none}}',
      '.pq{position:relative;flex:1;min-width:0;box-sizing:border-box;border-radius:12px;background:linear-gradient(180deg,#1b2566,#10163f);box-shadow:0 0 0 5px var(--stoneEdge),inset 0 12px 16px rgba(0,0,0,.55),inset 0 0 0 2px rgba(0,0,0,.4);padding:10px 24px 14px;display:flex;flex-direction:column;justify-content:center;text-align:center}',
      /* The points, on a tab of the frame's own stone. */
      '.pq .tag{position:absolute;left:14px;top:12px;font-size:18px;line-height:1.3;color:#fff;padding:3px 16px 4px;border-radius:12px;background:linear-gradient(180deg,#7d8fd0,#56669f 45%,#404c80);border:3px solid var(--stoneEdge);box-shadow:inset 0 3px 0 rgba(255,255,255,.3),inset 0 -4px 0 rgba(12,16,48,.45);text-shadow:0 2px 0 var(--ink)}',
      '.pq .foot{font-size:24px;line-height:1.2;color:#9fe8ff;margin-bottom:6px}',
      '.pq .foot b{font-weight:inherit;color:#ffd34d}',
      '.pq .q{font-size:calc(38px*var(--fit,1));line-height:1.15;overflow-wrap:anywhere;-webkit-text-stroke:4px var(--ink);paint-order:stroke fill;text-shadow:0 4px 0 var(--ink)}',
      '.pq .opts{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:14px;margin-top:14px}',
      '.pq .opt{display:flex;align-items:center;justify-content:center;gap:16px;min-width:0;text-align:center;background:rgba(5,7,31,.78);border:3px solid var(--ink);border-radius:14px;padding:calc(12px*var(--fit,1)) 14px;font-size:calc(30px*var(--fit,1));line-height:1.15}',
      '.pq .opt span{min-width:0;overflow-wrap:anywhere}',
      '.pq .opt em{font-style:normal;color:#9fe8ff}',
      '.pq .opt.right{background:linear-gradient(180deg,#3fd16a,#1c8f3f)}',
      '.pq .opt.right em{color:#fff}',
      /* The vote bar while the vote is open. */
      '#vote.asking #vwrap{animation:voteAsk 1.6s ease-in-out infinite}',
      '@keyframes voteAsk{0%,100%{box-shadow:0 0 0 rgba(255,211,77,0)}50%{box-shadow:0 0 34px rgba(255,211,77,.9)}}',
    ].join('');
    document.head.appendChild(style);
  })();

  var MAX_OPTIONS = 4;
  var shown = '';
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function drawPrompt(league) {
    var stage = document.getElementById('stage');
    if (!asks || !stage) return;
    var on = !!league && league.active === true;
    var quiz = on && league.quiz && league.quiz.id && Array.isArray(league.quiz.options) ? league.quiz : null;
    var voting = on && !!league.voting && !!league.voting.matchId && league.voting.status === 'open';
    /* Vote totals arrive every second or so while people vote: only what
       is drawn here counts as a change, so the question doesn't flicker. */
    var now = JSON.stringify([quiz && [quiz.id, quiz.status, quiz.question, quiz.options, quiz.correct, quiz.counts], voting]);
    if (now === shown) return;
    shown = now;
    var where = (location.host + '/league').toUpperCase();

    var vote = document.getElementById('vote');
    var label = document.getElementById('vlabel');
    if (vote && label) {
      vote.classList.toggle('asking', voting);
      label.textContent = voting ? 'WHO WINS? VOTE AT ' + where : 'AUDIENCE VOTE';
    }

    var box = document.getElementById('prompt');
    if (box) box.remove();
    if (!quiz) return;
    var revealed = quiz.status === 'revealed';
    var counts = revealed && Array.isArray(quiz.counts) ? quiz.counts : [];
    var total = counts.reduce(function (sum, n) { return sum + (Number(n) || 0); }, 0);
    box = el('div', 'stone');
    box.id = 'prompt';
    var panel = el('div', 'pq');
    box.appendChild(panel);
    panel.appendChild(el('div', 'tag', (Number(quiz.points) || 100) + ' POINTS'));
    var foot = el('div', 'foot', revealed ? 'THE ANSWER IS IN' : quiz.status === 'open' ? 'ANSWER ON THE WEBSITE! ' : 'ANSWERS ARE CLOSED');
    if (quiz.status === 'open') foot.appendChild(el('b', '', where));
    panel.appendChild(foot);
    panel.appendChild(el('div', 'q', quiz.question));
    var opts = el('div', 'opts');
    quiz.options.slice(0, MAX_OPTIONS).forEach(function (option, i) {
      var opt = el('div', 'opt' + (revealed && quiz.correct === i ? ' right' : ''));
      opt.appendChild(el('span', '', option));
      if (revealed) opt.appendChild(el('em', '', (total ? Math.round(((Number(counts[i]) || 0) / total) * 100) : 0) + '%'));
      opts.appendChild(opt);
    });
    panel.appendChild(opts);
    stage.appendChild(box);
    /* A long question or long answers are drawn smaller, until they fit. */
    for (var fit = 1; fit > 0.5 && panel.scrollHeight > panel.clientHeight; fit -= 0.05) box.style.setProperty('--fit', (fit - 0.05).toFixed(2));
  }
  if (asks) window.__overlay.prompt = drawPrompt;

  /* The overlays outline their text with a stroke drawn behind the letters.
     OBS's built-in browser ignores the "behind" part (paint-order) and draws
     the stroke over the letters instead, eating them away until small text
     can't be read. So every stroked outline is swapped here for the same
     outline made of shadows, which OBS draws correctly: a ring of copies of
     the text in the outline's colour, at half the stroke's width (a stroke
     sits half inside the letter), and the same ring again under any drop the
     text had. Done everywhere, so a preview shows what OBS will. */
  function outlineWithShadows() {
    var RING = 16;
    function ring(radius, drop, colour) {
      var parts = [];
      for (var i = 0; i < RING; i++) {
        var turn = (i / RING) * 2 * Math.PI;
        parts.push((Math.cos(turn) * radius).toFixed(2) + 'px ' + (Math.sin(turn) * radius + drop).toFixed(2) + 'px 0 ' + colour);
      }
      return parts;
    }
    function fix(rules) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.cssRules) fix(rule.cssRules);
        var style = rule.style;
        /* Written as one value, "4px var(--ink)": a width, then a colour. */
        var stroke = style && /^([\d.]+)px\s*(.*)$/.exec((style.getPropertyValue('-webkit-text-stroke') || '').trim());
        var width = stroke ? parseFloat(stroke[1]) : style ? parseFloat(style.webkitTextStrokeWidth) : 0;
        if (!width) continue;
        var colour = (stroke && stroke[2]) || style.webkitTextStrokeColor || 'var(--ink)';
        /* A drop written as "0 Npx 0 colour": how far down it falls. */
        var drop = /^0(?:px)?\s+([\d.]+)px\s+0/.exec(style.textShadow || '');
        var shadows = ring(width / 2, 0, colour);
        if (drop) shadows = shadows.concat(ring(width / 2, parseFloat(drop[1]), colour));
        style.setProperty('-webkit-text-stroke', '0');
        style.removeProperty('paint-order');
        style.textShadow = shadows.join(',');
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      try { fix(document.styleSheets[s].cssRules); } catch (err) { /* a sheet from elsewhere: left alone */ }
    }
  }
  outlineWithShadows();

  /* The glimmer - sparks, glints and dust - is dozens of specks a few pixels
     across, drifting a pixel or so a frame. Left to the page, each is redrawn
     on whole pixels, so it moves in little jumps. Given a layer of its own,
     the graphics card slides it between pixels instead, which is smooth. */
  (function smoothGlimmer() {
    var style = document.createElement('style');
    style.textContent = '.spark,.glint,.dust{will-change:transform,opacity;backface-visibility:hidden}';
    document.head.appendChild(style);
  })();

  var overlay = window.__overlay;
  var config = window.OVERLAY_FIREBASE;
  if (!overlay || !config || !config.projectId) return;
  if (new URLSearchParams(location.search).get('live') === '0') return;

  var SDK = 'https://www.gstatic.com/firebasejs/12.4.0/';
  function load(file, then) {
    var script = document.createElement('script');
    script.src = SDK + file;
    script.onload = then;
    document.head.appendChild(script);
  }

  load('firebase-app-compat.js', function () {
    load('firebase-firestore-compat.js', function () {
      window.firebase.initializeApp(config);
      /* live/overlays holds what each overlay should show, under its name. */
      window.firebase.firestore().doc('live/overlays').onSnapshot(function (snapshot) {
        var mine = (snapshot.data() || {})[overlay.name];
        if (!mine) return;
        Object.keys(mine).forEach(function (key) {
          overlay.state[key] = Array.isArray(mine[key]) ? mine[key].slice() : mine[key];
        });
        overlay.render();
      });
      /* live/league holds the vote and the quiz question that are up. */
      if (asks) {
        window.firebase.firestore().doc('live/league').onSnapshot(function (snapshot) {
          drawPrompt(snapshot.data());
        });
      }
    });
  });
})();
