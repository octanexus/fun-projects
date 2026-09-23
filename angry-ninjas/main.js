/* Angry Ninjas: drawing, input and menus. Game rules live in sim.js. */
(function () {
  'use strict';

  const { W, H, S, GROUND_Y, SLING, NINJA_R, STEP, LEVELS, clampPull, Game } = window.Sim;
  const { Composite } = window.Matter;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  const BLOCK_COLORS = { // fill, edge
    wood: ['#c98c4a', '#7d5129'],
    ice: ['#bfeefc', '#6cc4e0'],
    stone: ['#a3a9b3', '#5d636d'],
  };
  const FRUIT_COLORS = {
    apple: { skin: '#e5383b', flesh: '#fff1d0', leaf: '#4caf50' },
    orange: { skin: '#f79431', flesh: '#ffd07a', leaf: '#4caf50' },
    melon: { skin: '#2e8b3e', flesh: '#ff5c6c', stripe: '#1d5e28' },
  };
  const THEMES = {
    day: { sky: ['#7ec8f2', '#d4f1fd'], sun: '#fff7cf', hill: '#a9cfe0', cap: '#f4fbff', ground: '#4f7f36', grass: '#78c152' },
    dusk: { sky: ['#e9795d', '#ffd49a'], sun: '#fff1c4', hill: '#b86a6a', cap: '#f6d7d0', ground: '#4a5e32', grass: '#7f9a47' },
    night: { sky: ['#141a36', '#34407a'], sun: '#f2eecb', hill: '#2b3463', cap: '#9aa6d6', ground: '#243522', grass: '#3f6a3a' },
  };
  const GRAVITY = 0.0005; // canvas px per ms², matches the physics world

  // ---------- progress ----------

  const SAVE_KEY = 'angry-ninjas-best';
  let best = {};
  try { best = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { /* storage unavailable */ }
  function saveBest(level, score) {
    if (score <= (best[level] || 0)) return;
    best[level] = score;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(best)); } catch (e) { /* storage unavailable */ }
  }

  // ---------- background ----------

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(',')})`;
  }

  function polygon(g, points) {
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.fill();
  }

  function disc(g, x, y, r) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const backgrounds = {};
  function background(name) {
    if (backgrounds[name]) return backgrounds[name];
    const t = THEMES[name];
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const bands = 8, bandH = GROUND_Y / bands;
    for (let i = 0; i < bands; i++) {
      g.fillStyle = mix(t.sky[0], t.sky[1], i / (bands - 1));
      g.fillRect(0, Math.floor(i * bandH), W, Math.ceil(bandH) + 1);
    }
    g.fillStyle = t.sun;
    disc(g, 408, 52, 16);
    g.fillStyle = t.hill;
    polygon(g, [[20, GROUND_Y], [180, 104], [340, GROUND_Y]]);
    g.fillStyle = t.cap;
    polygon(g, [[152, 128], [180, 104], [208, 128], [196, 124], [188, 132], [180, 126], [170, 133], [162, 125]]);
    g.fillStyle = t.ground;
    g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    g.fillStyle = t.grass;
    g.fillRect(0, GROUND_Y, W, 3);
    backgrounds[name] = c;
    return c;
  }

  // ---------- sprites (plain shapes) ----------

  function drawNinja(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#d62828'; // headband tails
    ctx.fillRect(-NINJA_R - 4, -4, 5, 2);
    ctx.fillRect(-NINJA_R - 3, -1, 4, 2);
    ctx.fillStyle = '#23262e';
    disc(ctx, 0, 0, NINJA_R);
    ctx.fillStyle = '#d62828';
    ctx.fillRect(-NINJA_R + 1, -5, NINJA_R * 2 - 2, 2);
    ctx.fillStyle = '#f2c9a0'; // eye slit
    ctx.fillRect(-1, -2, 6, 3);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, -1, 1, 1);
    ctx.fillRect(3, -1, 1, 1);
    ctx.restore();
  }

  function drawBlock(body) {
    const { mat, w, h, health, maxHealth } = body.plugin;
    const [fill, edge] = BLOCK_COLORS[mat];
    ctx.save();
    ctx.translate(body.position.x / S, body.position.y / S);
    ctx.rotate(body.angle);
    ctx.fillStyle = edge;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    if (health < maxHealth * 0.6) { // crack along the long side
      const len = Math.max(w, h) / 2 - 2, off = Math.min(w, h) / 4, across = w >= h;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const along = -len * 0.6 + i * len * 0.3, side = i % 2 ? off : -off;
        if (across) ctx.lineTo(along, side);
        else ctx.lineTo(side, along);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFruitShape(type, r, half) {
    const c = FRUIT_COLORS[type];
    const end = half ? Math.PI : Math.PI * 2;
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, end);
    ctx.fill();
    if (half) {
      ctx.fillStyle = c.flesh;
      ctx.beginPath();
      ctx.arc(0, 0, r - 1.5, 0, Math.PI);
      ctx.fill();
      return;
    }
    if (c.stripe) {
      ctx.strokeStyle = c.stripe;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.4, r - 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (c.leaf) {
      ctx.fillStyle = '#5a3a1e';
      ctx.fillRect(-0.5, -r - 2, 1, 3);
      ctx.fillStyle = c.leaf;
      ctx.fillRect(0.5, -r - 2, 3, 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-r * 0.55, -r * 0.55, 2, 2);
  }

  function drawFruit(body) {
    ctx.save();
    ctx.translate(body.position.x / S, body.position.y / S);
    ctx.rotate(body.angle);
    drawFruitShape(body.plugin.type, body.plugin.r, false);
    ctx.restore();
  }

  // ---------- slingshot ----------

  const TIP_BACK = { x: SLING.x + 7, y: SLING.y - 2 };
  const TIP_FRONT = { x: SLING.x - 6, y: SLING.y - 2 };

  function band(from, to) {
    ctx.strokeStyle = '#3a2415';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function drawSlingshot() {
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(SLING.x, GROUND_Y);
    ctx.lineTo(SLING.x, SLING.y + 12);
    ctx.lineTo(TIP_BACK.x, TIP_BACK.y);
    ctx.moveTo(SLING.x, SLING.y + 12);
    ctx.lineTo(TIP_FRONT.x, TIP_FRONT.y);
    ctx.stroke();
  }

  // ---------- particles ----------

  const particles = [];
  const rand = (a, b) => a + Math.random() * (b - a);

  function spawnFx(e) {
    if (e.type === 'block') {
      const color = BLOCK_COLORS[e.mat][0];
      const n = Math.round((e.w * e.h) / 30) + 4;
      for (let i = 0; i < n; i++) {
        const along = rand(-0.5, 0.5);
        const lx = e.w >= e.h ? along * e.w : 0, ly = e.w >= e.h ? 0 : along * e.h;
        particles.push({
          x: e.x + lx * Math.cos(e.angle) - ly * Math.sin(e.angle),
          y: e.y + lx * Math.sin(e.angle) + ly * Math.cos(e.angle),
          vx: e.vx * 0.5 + rand(-0.06, 0.06), vy: e.vy * 0.5 + rand(-0.12, 0),
          size: Math.random() < 0.5 ? 2 : 1, color, life: rand(600, 1100),
        });
      }
    } else if (e.type === 'fruit') {
      const c = FRUIT_COLORS[e.fruit];
      for (const side of [-1, 1]) {
        particles.push({
          half: e.fruit, r: e.r, angle: e.angle + (side < 0 ? Math.PI : 0), va: side * 0.008,
          x: e.x, y: e.y, vx: e.vx * 0.6 + side * 0.04, vy: e.vy * 0.6 - 0.1, life: 1400,
        });
      }
      for (let i = 0; i < 12; i++) {
        const a = rand(0, Math.PI * 2), sp = rand(0.03, 0.12);
        particles.push({
          x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.05,
          size: Math.random() < 0.4 ? 2 : 1, color: c.flesh, life: rand(400, 800),
        });
      }
    } else if (e.type === 'poof') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        particles.push({
          x: e.x, y: e.y, vx: Math.cos(a) * 0.03, vy: Math.sin(a) * 0.03, float: true,
          size: 2, color: '#e8e8e8', life: 500,
        });
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (!p.float) p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.va) p.angle += p.va * dt;
      if (!p.float && p.y > GROUND_Y - 1 && p.vy > 0) { // bounce on the ground
        p.y = GROUND_Y - 1;
        p.vy *= -0.3;
        p.vx *= 0.6;
      }
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life / 300);
      if (p.half) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        drawFruitShape(p.half, p.r, true);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- game flow ----------

  let game = new Game(0); // shown behind the menu
  let screen = 'menu'; // menu | play | result
  let dragStart = null;
  let pull = null;

  function startLevel(i) {
    game = new Game(i);
    particles.length = 0;
    dragStart = pull = null;
    screen = 'play';
    $('menu').hidden = true;
    $('result').hidden = true;
    $('hud').hidden = false;
    $('hud-level').textContent = `${i + 1}. ${LEVELS[i].name}`;
  }

  function showMenu() {
    screen = 'menu';
    $('hud').hidden = true;
    $('result').hidden = true;
    const list = $('levels');
    list.textContent = '';
    LEVELS.forEach((level, i) => {
      const b = document.createElement('button');
      b.className = 'level';
      b.innerHTML = `<b>${i + 1}</b><span></span><small></small>`;
      b.querySelector('span').textContent = level.name;
      b.querySelector('small').textContent = best[i] ? `Best ${best[i].toLocaleString('en-US')}` : ' ';
      b.addEventListener('click', () => startLevel(i));
      list.appendChild(b);
    });
    $('menu').hidden = false;
  }

  function showResult() {
    screen = 'result';
    const won = game.state === 'won';
    const i = game.levelIndex;
    if (won) saveBest(i, game.score);
    $('result-title').textContent = won ? 'Level clear!' : 'Out of ninjas';
    $('result-score').textContent = `Score ${game.score.toLocaleString('en-US')}`;
    $('result-note').textContent = won
      ? (game.bonus ? `Includes ${game.bonus.toLocaleString('en-US')} bonus for unused ninjas` : 'Every fruit sliced')
      : `${game.fruitsLeft} fruit${game.fruitsLeft === 1 ? '' : 's'} left standing`;
    $('btn-next').hidden = !(won && i + 1 < LEVELS.length);
    $('result').hidden = false;
  }

  $('btn-menu').addEventListener('click', showMenu);
  $('btn-restart').addEventListener('click', () => startLevel(game.levelIndex));
  $('btn-result-menu').addEventListener('click', showMenu);
  $('btn-retry').addEventListener('click', () => startLevel(game.levelIndex));
  $('btn-next').addEventListener('click', () => startLevel(game.levelIndex + 1));

  // ---------- input: drag anywhere to pull the sling back ----------

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (screen !== 'play' || game.state !== 'aim') return;
    dragStart = toCanvas(e);
    pull = { x: 0, y: 0 };
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragStart) return;
    const p = toCanvas(e);
    pull = clampPull(p.x - dragStart.x, p.y - dragStart.y);
  });

  function release(e) {
    if (!dragStart) return;
    if (e.type === 'pointerup') game.launch(pull.x, pull.y);
    dragStart = pull = null;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  // ---------- render ----------

  function render() {
    ctx.drawImage(background(game.level.theme), 0, 0);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const p of game.trail) ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 2, 2);

    const aiming = game.state === 'aim';
    const waiting = game.ninjasLeft - (aiming ? 1 : 0);
    for (let i = 0; i < waiting; i++) drawNinja(SLING.x - 22 - i * 15, GROUND_Y - NINJA_R, 0);

    drawSlingshot();
    const pouch = aiming ? { x: SLING.x + (pull ? pull.x : 0), y: SLING.y + (pull ? pull.y : 0) } : null;
    if (pouch) band(TIP_BACK, pouch);

    for (const body of Composite.allBodies(game.world)) {
      if (body.label === 'block') drawBlock(body);
      else if (body.label === 'fruit') drawFruit(body);
      else if (body.label === 'ninja') drawNinja(body.position.x / S, body.position.y / S, body.angle);
    }

    if (pouch) {
      drawNinja(pouch.x, pouch.y, 0);
      band(TIP_FRONT, pouch);
    } else {
      band(TIP_BACK, TIP_FRONT);
    }

    drawParticles();
  }

  let shownScore = -1;
  function updateHud() {
    if (game.score === shownScore) return;
    shownScore = game.score;
    $('hud-score').textContent = game.score.toLocaleString('en-US');
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc = Math.min(acc + now - last, 250); // don't try to catch up after a stall
    last = now;
    while (acc >= STEP) {
      if (screen !== 'menu') {
        game.step(STEP);
        for (const e of game.fx) spawnFx(e);
        game.fx.length = 0;
        if (screen === 'play' && (game.state === 'won' || game.state === 'lost')) showResult();
      }
      updateParticles(STEP);
      acc -= STEP;
    }
    render();
    updateHud();
    requestAnimationFrame(frame);
  }

  showMenu();
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
  }
})();
