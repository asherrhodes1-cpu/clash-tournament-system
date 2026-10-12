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
    });
  });
})();
