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
    wonderland: { sky: ['#5b3f8c', '#f4a7c9'], ground: '#3a2d4a', grass: '#3a2d4a', scenery: wonderland },
    chocolate: { sky: ['#ff9ccf', '#fff1d6'], ground: '#4a2a1a', grass: '#7de07a', scenery: chocolate, animate: chocolateFlow },
    gatsby: { sky: ['#070a18', '#23455a'], ground: '#14110b', grass: '#d4af37', scenery: gatsby },
    gothic: { sky: ['#3b3846', '#8e8a99'], ground: '#1d1b22', grass: '#4a4656', scenery: gothic, animate: bats },
    pines: { sky: ['#4b5d6b', '#aebfc4'], ground: '#2d3b33', grass: '#56705c', scenery: pines, weather: rain },
    winter: { sky: ['#16213e', '#51658f'], ground: '#3a3642', grass: '#cfd8e6', scenery: winter, animate: twinkle, weather: snow },
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
    if (!t.scenery) {
      g.fillStyle = t.sun;
      disc(g, 408, 52, 16);
      g.fillStyle = t.hill;
      polygon(g, [[20, GROUND_Y], [180, 104], [340, GROUND_Y]]);
      g.fillStyle = t.cap;
      polygon(g, [[152, 128], [180, 104], [208, 128], [196, 124], [188, 132], [180, 126], [170, 133], [162, 125]]);
    }
    g.fillStyle = t.ground;
    g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    g.fillStyle = t.grass;
    g.fillRect(0, GROUND_Y, W, 3);
    if (t.scenery) t.scenery(g);
    backgrounds[name] = c;
    return c;
  }

  // ---------- themed scenery for levels 4-9 (drawn once into the cached background) ----------

  function wonderland(g) {
    // Cheshire cat grin
    const x = 400, y = 50;
    g.save();
    g.beginPath();
    g.arc(x, y - 10, 24, 0.2 * Math.PI, 0.8 * Math.PI);
    g.arc(x, y - 20, 26, 0.75 * Math.PI, 0.25 * Math.PI, true);
    g.closePath();
    g.fillStyle = '#fdf6ff';
    g.fill();
    g.clip();
    g.fillStyle = '#c7a9d9';
    for (let tx = x - 18; tx <= x + 18; tx += 6) g.fillRect(tx, y - 20, 1, 30);
    g.restore();
    for (const ex of [x - 12, x + 12]) {
      g.fillStyle = '#e8e04a';
      g.beginPath();
      g.ellipse(ex, y - 14, 5, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a1a3a';
      g.fillRect(ex, y - 17, 1, 6);
    }

    // floating playing cards
    for (const [cx, cy, angle, suit] of [[250, 64, 0.4, '#e0453a'], [318, 96, -0.3, '#2a1a3a'], [206, 110, 0.15, '#e0453a']]) {
      g.save();
      g.translate(cx, cy);
      g.rotate(angle);
      g.fillStyle = '#3a2d4a';
      g.fillRect(-6, -8, 12, 16);
      g.fillStyle = '#fff';
      g.fillRect(-5, -7, 10, 14);
      g.fillStyle = suit;
      polygon(g, [[0, -3], [3, 0], [0, 3], [-3, 0]]);
      g.restore();
    }

    // giant mushrooms
    for (const [mx, top, stemW, rx, ry] of [[150, 176, 14, 34, 22], [214, 202, 8, 20, 13]]) {
      g.fillStyle = '#f3e3c3';
      g.fillRect(mx - stemW / 2, top, stemW, GROUND_Y - top);
      g.fillStyle = '#e0453a';
      g.beginPath();
      g.ellipse(mx, top + 2, rx, ry, 0, Math.PI, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      for (const [dx, dy, r] of [[-0.5, -0.45, 0.14], [0.1, -0.7, 0.12], [0.55, -0.35, 0.13]]) {
        disc(g, mx + dx * rx, top + 2 + dy * ry, r * rx);
      }
    }

    // checkerboard floor
    for (let row = 0; GROUND_Y + row * 8 < H; row++) {
      for (let col = 0; col * 8 < W; col++) {
        g.fillStyle = (row + col) % 2 ? '#3a2d4a' : '#f2e9dc';
        g.fillRect(col * 8, GROUND_Y + row * 8, 8, 8);
      }
    }
  }

  function chocolate(g) {
    // candy hills and a meadow of candy grass
    g.fillStyle = '#f7b6d2';
    for (const [hx, hy, r] of [[158, 204, 64], [330, 214, 50], [455, 208, 40]]) {
      g.beginPath();
      g.arc(hx, hy, r, Math.PI, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#9be58a';
    g.fillRect(0, 196, W, GROUND_Y - 196);

    // chocolate river and waterfall
    for (let x = 0; x < W; x += 2) {
      const top = Math.round(206 + Math.sin(x / 30) * 3);
      g.fillStyle = '#6b3a22';
      g.fillRect(x, top, 2, 9);
      if (x % 14 === 0) {
        g.fillStyle = '#8f5635';
        g.fillRect(x, top + 3, 5, 1);
      }
    }
    // cliff with a rocky shoulder; the stream flows out from behind it towards the brink
    g.fillStyle = '#c98aa8';
    polygon(g, [[100, 212], [103, 150], [108, 132], [114, 122], [122, 112], [128, 113], [133, 121], [150, 121], [150, 212]]);
    g.fillStyle = '#b77596';
    polygon(g, [[100, 212], [103, 150], [108, 132], [114, 122], [118, 118], [110, 140], [107, 212]]);

    // The waterfall, shaped like a real free overfall: the stream's surface dips as it speeds up
    // towards the brink, then the falling sheet leaves the edge horizontally with both of its
    // surfaces following free-fall parabolas (animated froth and ripples are in chocolateFlow)
    const pour = [];
    for (let x = 124; x <= 150; x += 2) pour.push([x, streamSurface(x)]);
    for (let t = 0.1; t <= 1.001; t += 0.1) pour.push(fallPoint(t, 1));
    for (let t = 1; t >= -0.001; t -= 0.1) pour.push(fallPoint(t, 0));
    pour.push([124, 121]);
    g.fillStyle = '#6b3a22';
    polygon(g, pour);
    g.fillStyle = '#c98aa8'; // the shoulder hides where the stream comes from
    polygon(g, [[114, 122], [122, 112], [128, 113], [133, 121], [133, 122]]);

    g.fillStyle = '#f0dcc0'; // foam where it lands
    for (const [fx, fy, r] of [[161, 210, 3], [166, 207, 4], [173, 205, 5], [179, 207, 4], [184, 210, 3]]) disc(g, fx, fy, r);
    g.fillStyle = 'rgba(245, 228, 205, 0.35)'; // spray and mist
    for (const [mx, my, r] of [[167, 201, 7], [179, 200, 6], [173, 196, 7]]) disc(g, mx, my, r);

    // lollipop trees
    for (const [lx, top, r, color] of [[222, 150, 14, '#ff4f7b'], [252, 184, 10, '#5ec8f2'], [470, 140, 12, '#ffb000']]) {
      g.fillStyle = '#fbf3ea';
      g.fillRect(lx - 1, top, 2, GROUND_Y - top);
      for (let i = 0; r - i * 4 > 0; i++) {
        g.fillStyle = i % 2 ? '#fff' : color;
        disc(g, lx, top, r - i * 4);
      }
    }

    // gumdrops
    for (const [gx, color] of [[108, '#ff6fa5'], [120, '#ffd23f'], [196, '#6fd3ff']]) {
      g.fillStyle = color;
      g.beginPath();
      g.arc(gx, GROUND_Y, 5, Math.PI, Math.PI * 2);
      g.fill();
    }
  }

  function gatsby(g) {
    // stars and fireworks
    g.fillStyle = '#e8e2c8';
    for (const [x, y] of [[40, 30], [96, 18], [150, 52], [212, 26], [262, 60], [330, 16], [470, 70], [120, 90]]) {
      g.fillRect(x, y, 1, 1);
    }
    for (const [fx, fy, color] of [[300, 54, '#ffd86b'], [372, 90, '#ff9ecf'], [438, 42, '#fff4d6']]) {
      g.fillStyle = color;
      g.fillRect(fx - 1, fy - 1, 2, 2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        for (const d of [5, 9, 13]) {
          const s = d === 13 ? 1 : 2;
          g.fillRect(Math.round(fx + Math.cos(a) * d), Math.round(fy + Math.sin(a) * d), s, s);
        }
      }
    }

    // the bay, with the green light at the end of the dock
    g.fillStyle = '#0e2433';
    g.fillRect(0, 200, W, GROUND_Y - 200);
    g.fillStyle = 'rgba(255, 216, 107, 0.35)';
    for (let i = 0; i < 18; i++) g.fillRect((i * 53) % W, 206 + (i * 7) % 30, 6, 1);
    g.fillStyle = '#05070c';
    g.fillRect(248, 196, 28, 4);
    g.fillRect(261, 186, 2, 12);
    g.fillStyle = 'rgba(57, 255, 136, 0.25)';
    disc(g, 262, 185, 6);
    g.fillStyle = '#39ff88';
    disc(g, 262, 185, 2);
    g.fillStyle = 'rgba(57, 255, 136, 0.35)';
    for (let y = 204; y < 236; y += 4) g.fillRect(260, y, 4, 1);

    // art deco mansion with lit windows
    g.fillStyle = '#10131f';
    g.fillRect(100, 168, 116, 72);
    g.fillRect(100, 150, 16, 18);
    g.fillRect(200, 150, 16, 18);
    g.fillRect(142, 132, 32, 36);
    g.fillRect(148, 124, 20, 8);
    g.fillRect(154, 116, 8, 8);
    g.fillRect(157, 104, 2, 12);
    g.fillStyle = '#ffd86b';
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 13; col++) {
        if ((row * 5 + col * 3) % 7 !== 0) g.fillRect(104 + col * 9, 174 + row * 14, 3, 5);
      }
    }
    for (const [wx, wy] of [[148, 138], [156, 138], [164, 138], [148, 152], [164, 152], [106, 156], [206, 156]]) {
      g.fillRect(wx, wy, 4, 6);
    }
    g.fillRect(154, 226, 8, 14);

    // gold trim on the terrace
    g.fillStyle = '#d4af37';
    g.fillRect(0, GROUND_Y + 6, W, 1);
  }

  function gothic(g) {
    g.fillStyle = '#e9e6f0';
    disc(g, 408, 52, 18);

    // gothic academy silhouette
    g.fillStyle = '#16141c';
    g.fillRect(96, 168, 124, 72);
    g.fillRect(102, 132, 22, 36);
    polygon(g, [[100, 132], [113, 104], [126, 132]]);
    g.fillRect(146, 126, 28, 42);
    polygon(g, [[144, 126], [160, 90], [176, 126]]);
    g.fillRect(194, 140, 20, 28);
    polygon(g, [[192, 140], [204, 116], [216, 140]]);
    for (let x = 96; x < 220; x += 12) polygon(g, [[x, 168], [x + 6, 160], [x + 12, 168]]);
    g.fillStyle = '#a89cc8'; // pointed windows
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 10; col++) {
        if ((row * 4 + col * 3) % 5 === 0) continue;
        const wx = 101 + col * 12, wy = 178 + row * 18;
        g.fillRect(wx, wy, 3, 6);
        g.fillRect(wx + 1, wy - 1, 1, 1);
      }
    }
    for (const [wx, wy] of [[110, 142], [110, 154], [201, 148]]) g.fillRect(wx, wy, 3, 6);

    // spiderweb rose window: one half colourful, the other black and white
    const cx = 160, cy = 144, r = 10;
    g.fillStyle = '#d8d8de';
    g.beginPath();
    g.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5);
    g.fill();
    ['#b28dff', '#6fd3ff', '#ffd23f', '#ff7eb6'].forEach((color, i) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, -Math.PI / 2 + (i * Math.PI) / 4, -Math.PI / 2 + ((i + 1) * Math.PI) / 4);
      g.fill();
    });
    g.strokeStyle = '#16141c';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    for (const ring of [4, 7.5]) {
      for (let i = 0; i <= 8; i++) {
        const a = (i * Math.PI) / 4, px = cx + Math.cos(a) * ring, py = cy + Math.sin(a) * ring;
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
    }
    g.stroke();

    // dead tree and gravestones
    g.strokeStyle = '#16141c';
    g.lineWidth = 2;
    g.beginPath();
    for (const [x1, y1, x2, y2] of [[250, 240, 250, 160], [250, 196, 234, 176], [234, 176, 228, 168],
      [250, 184, 266, 164], [266, 164, 274, 160], [250, 170, 244, 154], [258, 174, 262, 186]]) {
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    }
    g.stroke();
    for (const [gx, h] of [[234, 12], [264, 9], [468, 11]]) {
      g.fillStyle = '#6e6b78';
      g.fillRect(gx - 4, GROUND_Y - h, 8, h);
      disc(g, gx, GROUND_Y - h, 4);
      g.fillStyle = '#4a4754';
      g.fillRect(gx, GROUND_Y - h - 1, 1, 6);
      g.fillRect(gx - 2, GROUND_Y - h + 1, 5, 1);
    }

    // low fog
    g.fillStyle = 'rgba(200, 195, 215, 0.15)';
    g.fillRect(0, 222, W, GROUND_Y - 222);
  }

  function bats(g, now) {
    g.fillStyle = '#0b0a0f';
    for (let i = 0; i < 3; i++) {
      const x = Math.round(((now * 0.02 + i * 170) % (W + 40)) - 20);
      const y = Math.round(40 + i * 22 + Math.sin(now / 400 + i * 2) * 6);
      const wing = Math.floor(now / 150 + i) % 2 ? -3 : 1;
      g.fillRect(x - 1, y - 1, 3, 3);
      g.fillRect(x - 5, y + wing, 4, 1);
      g.fillRect(x + 2, y + wing, 4, 1);
      g.fillRect(x - 3, y + wing / 2, 2, 1);
      g.fillRect(x + 2, y + wing / 2, 2, 1);
    }
  }

  // Pine tree of three stacked tiers, optionally with snow on each tier.
  function pine(g, x, base, h, color, snowy) {
    for (let k = 0; k < 3; k++) {
      const top = base - h + k * h * 0.25, half = h * (0.225 + k * 0.1125), tierH = h * 0.45;
      g.fillStyle = color;
      polygon(g, [[x, top], [x + half, top + tierH], [x - half, top + tierH]]);
      if (snowy) {
        g.fillStyle = '#e8eef8';
        polygon(g, [[x, top], [x + half * 0.4, top + tierH * 0.4], [x - half * 0.4, top + tierH * 0.4]]);
      }
    }
    g.fillStyle = color;
    g.fillRect(x - 1, base - h * 0.1, 2, h * 0.1);
  }

  function pines(g) {
    g.fillStyle = 'rgba(255, 255, 255, 0.25)'; // sun hidden behind cloud
    disc(g, 408, 52, 16);
    g.fillStyle = 'rgba(235, 240, 242, 0.35)';
    for (const [x, y, rx] of [[120, 40, 70], [330, 70, 90], [460, 34, 50]]) {
      g.beginPath();
      g.ellipse(x, y, rx, 6, 0, 0, Math.PI * 2);
      g.fill();
    }

    // layered pine forest fading into the mist
    for (let i = 0; i < 36; i++) pine(g, i * 14 + 4, 204, 30 + ((i * 37) % 15), '#8aa3a6');
    g.fillStyle = 'rgba(230, 238, 240, 0.35)';
    g.fillRect(0, 184, W, 22);
    for (let i = 0; i < 19; i++) pine(g, i * 26 + 10, 226, 48 + ((i * 29) % 22), '#56766f');
    g.fillStyle = 'rgba(230, 238, 240, 0.25)';
    g.fillRect(0, 214, W, 14);
    pine(g, 186, GROUND_Y, 110, '#26403b');
    pine(g, 470, GROUND_Y, 104, '#26403b');

    // a few sparkles
    g.fillStyle = '#ffffff';
    for (const [x, y] of [[296, 36], [352, 64], [436, 26]]) {
      g.fillRect(x, y - 2, 1, 5);
      g.fillRect(x - 2, y, 5, 1);
    }

    // old red pickup truck
    g.fillStyle = '#a8322a';
    g.fillRect(198, 226, 34, 8);
    g.fillRect(218, 218, 12, 8);
    g.fillStyle = '#9fb4bd';
    g.fillRect(221, 220, 7, 4);
    g.fillStyle = '#1a1a1a';
    disc(g, 205, 235, 3);
    disc(g, 225, 235, 3);
  }

  // Rain and snow share a simple camera: each particle sits at a fixed distance from it,
  // spread uniformly through the volume in view, and perspective scales its speed and size.
  const FOCAL_PX = H / (2 * Math.tan((15 * Math.PI) / 180)); // 30 degree vertical field of view
  const inVolume = (near, far) => Math.cbrt(near ** 3 + Math.random() * (far ** 3 - near ** 3));
  const breeze = (now, mean, gust) => mean + gust * Math.sin(now * 0.0007) * Math.sin(now * 0.00023 + 1); // m/s

  function frameSeconds(now, last) {
    return (last && now - last < 100 ? now - last : 16) / 1000;
  }

  // Rain, modelled on real drops:
  // - sizes follow the Marshall-Palmer distribution (exponential, slope 4.1 * R^-0.21 per mm);
  //   drops under 0.8 mm are too small to see as streaks, so they are left out
  // - each drop falls at the terminal velocity for its size, 9.65 - 10.3 * e^(-0.6 D) m/s
  //   (Atlas et al. 1973 fit to Gunn & Kinzer 1949)
  // - quadratic air drag balances gravity at that speed, so drops lag behind wind gusts
  // - only drops within a few metres of the camera show up as separate streaks (rain farther
  //   away blurs into haze), so those are the only ones drawn, in front of the scene
  // - streaks are as long as a film camera's 1/48 s shutter would blur them
  const RAIN_SLOPE = 4.1 * Math.pow(50, -0.21); // heavy rain, 50 mm per hour
  const RAIN_NEAR = 1.5, RAIN_FAR = 7; // metres from the camera
  const RAIN_DROPS = 150;
  const SHUTTER = 1 / 48; // s
  const drops = [];
  const splashes = [];
  let rainLast = 0;

  function newDrop(d, wind, anywhere) {
    const size = Math.min(4, 0.8 - Math.log(1 - Math.random()) / RAIN_SLOPE); // mm
    const near = (RAIN_FAR - d.dist) / (RAIN_FAR - RAIN_NEAR); // 1 = closest to the camera
    d.vt = 9.65 - 10.3 * Math.exp(-0.6 * size);
    d.pxPerM = FOCAL_PX / d.dist;
    d.floor = GROUND_Y + 2 + (H - GROUND_Y - 4) * near; // nearer drops land lower on the ground strip
    d.alpha = (0.18 + (0.4 * RAIN_NEAR) / d.dist) * (0.6 + 0.4 * Math.min(1, size / 2.5));
    d.width = d.dist < 2.5 ? 2 : 1;
    d.x = rand(-40, W + 10);
    d.y = anywhere ? rand(-20, d.floor) : rand(-40, 0);
    d.vx = wind; // already falling at terminal velocity
    d.vy = d.vt;
    return d;
  }

  function rain(g, now) {
    const dt = frameSeconds(now, rainLast);
    rainLast = now;
    const wind = breeze(now, 0.5, 0.3);
    while (drops.length < RAIN_DROPS) drops.push(newDrop({ dist: inVolume(RAIN_NEAR, RAIN_FAR) }, wind, true));

    for (const d of drops) {
      const ux = d.vx - wind, uy = d.vy; // velocity relative to the air
      const drag = (9.8 / (d.vt * d.vt)) * Math.hypot(ux, uy);
      d.vx -= drag * ux * dt;
      d.vy += (9.8 - drag * uy) * dt;
      d.x += d.vx * d.pxPerM * dt;
      d.y += d.vy * d.pxPerM * dt;
      if (d.y >= d.floor) {
        if (Math.random() < 0.4) { // most splashes are too small to see
          splashes.push({ x: d.x, y: d.floor, vx: rand(-0.03, 0.03), vy: -rand(0.03, 0.06), life: 110 });
        }
        newDrop(d, wind, false);
      }
    }

    for (const d of drops) {
      const blur = d.pxPerM * SHUTTER;
      g.strokeStyle = `rgba(222, 234, 242, ${d.alpha.toFixed(2)})`;
      g.lineWidth = d.width;
      g.beginPath();
      g.moveTo(d.x, d.y);
      g.lineTo(d.x - d.vx * blur, d.y - d.vy * blur);
      g.stroke();
    }

    g.fillStyle = 'rgba(222, 234, 242, 0.4)';
    for (let i = splashes.length - 1; i >= 0; i--) {
      const sp = splashes[i];
      sp.vy += GRAVITY * dt * 1000;
      sp.x += sp.vx * dt * 1000;
      sp.y += sp.vy * dt * 1000;
      sp.life -= dt * 1000;
      if (sp.life <= 0) splashes.splice(i, 1);
      else g.fillRect(Math.round(sp.x), Math.round(sp.y), 1, 1);
    }
  }

  // Snow:
  // - flakes fall at 0.8 * D^0.16 m/s for a flake D mm across (Locatelli & Hobbs 1974,
  //   unrimed aggregates of dendrites), about 1 m/s whatever their size
  // - they are so light that they move with the air almost at once, drifting on the breeze
  //   and fluttering from side to side as they tumble
  // - flakes at the depth of the fruit structures or beyond settle on the ground, building a
  //   snow layer that slumps sideways wherever it gets steeper than loose snow can hold
  const SNOW_NEAR = 1.5, SNOW_FAR = 14; // metres from the camera
  const SNOW_SETTLES = 8; // flakes nearer than this fall past the bottom of the screen
  const SNOW_FLAKES = 240;
  const SNOW_MAX = 5; // px of settled snow
  const SNOW_REPOSE = 1.2; // steepest step between neighbouring columns, px
  const SETTLE_BUMP = [0.09, 0.22, 0.45, 0.22, 0.09]; // px added around the spot a flake lands on
  const flakes = [];
  const snowDepth = new Float32Array(W);
  let snowLast = 0;
  let snowGame = null;

  function newFlake(f, anywhere) {
    const size = Math.min(15, 2 - Math.log(1 - Math.random()) * 3); // mm
    f.vt = 0.8 * Math.pow(size, 0.16);
    f.pxPerM = FOCAL_PX / f.dist;
    f.settles = f.dist >= SNOW_SETTLES;
    f.px = f.dist < 3 ? 2 : 1;
    f.alpha = Math.min(1, 0.35 + 2 / f.dist);
    f.flutter = rand(0.15, 0.4); // m/s
    f.freq = rand(0.5, 1.3) * Math.PI * 2; // rad/s
    f.phase = rand(0, Math.PI * 2);
    f.x = rand(-60, W + 10);
    f.y = anywhere ? rand(-10, GROUND_Y) : rand(-20, 0);
    return f;
  }

  function snow(g, now) {
    const dt = frameSeconds(now, snowLast);
    snowLast = now;
    if (snowGame !== game) { // a new level starts with bare ground
      snowGame = game;
      snowDepth.fill(0);
    }
    while (flakes.length < SNOW_FLAKES) flakes.push(newFlake({ dist: inVolume(SNOW_NEAR, SNOW_FAR) }, true));
    const wind = breeze(now, 0.4, 0.3), t = now / 1000;

    for (const f of flakes) {
      const vx = wind + f.flutter * Math.sin(f.freq * t + f.phase);
      f.x += vx * f.pxPerM * dt;
      f.y += f.vt * f.pxPerM * dt;
      const col = Math.round(f.x);
      if (f.settles && f.y >= GROUND_Y - (col >= 0 && col < W ? snowDepth[col] : 0)) {
        if (col >= 0 && col < W) {
          SETTLE_BUMP.forEach((amount, i) => {
            const c = col + i - 2;
            if (c >= 0 && c < W) snowDepth[c] = Math.min(SNOW_MAX, snowDepth[c] + amount);
          });
        }
        newFlake(f, false);
      } else if (f.y > H + 4) {
        newFlake(f, false);
      }
    }
    for (let x = 0; x < W - 1; x++) { // slump
      const step = snowDepth[x] - snowDepth[x + 1];
      if (Math.abs(step) > SNOW_REPOSE) {
        const move = ((Math.abs(step) - SNOW_REPOSE) / 2) * Math.sign(step);
        snowDepth[x] -= move;
        snowDepth[x + 1] += move;
      }
    }

    g.fillStyle = '#f4f7fb';
    for (let x = 0; x < W; x++) {
      const d = Math.round(snowDepth[x]);
      if (d > 0) g.fillRect(x, GROUND_Y - d, 1, d + 3);
    }
    for (const f of flakes) {
      g.fillStyle = `rgba(255, 255, 255, ${f.alpha.toFixed(2)})`;
      g.fillRect(Math.round(f.x), Math.round(f.y), f.px, f.px);
    }
  }

  const TREES = [[186, GROUND_Y, 110], [470, GROUND_Y, 104]]; // the two big pines: x, base, height

  function winter(g) {
    g.fillStyle = '#f4f1e0';
    disc(g, 408, 48, 14);
    g.fillStyle = '#dfe6ff';
    for (const [x, y] of [[40, 30], [96, 18], [150, 52], [212, 26], [262, 60], [330, 16], [460, 90], [120, 90]]) {
      g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 36; i++) pine(g, i * 14 + 4, 204, 30 + ((i * 37) % 15), '#3d4f78', true);
    g.fillStyle = 'rgba(210, 222, 255, 0.18)';
    g.fillRect(0, 184, W, 22);
    for (let i = 0; i < 19; i++) pine(g, i * 26 + 10, 226, 48 + ((i * 29) % 22), '#2a3c5f', true);
    g.fillStyle = 'rgba(210, 222, 255, 0.12)';
    g.fillRect(0, 214, W, 14);
    for (const [x, base, h] of TREES) pine(g, x, base, h, '#1f3b35', true);

    // snowman
    g.fillStyle = '#f4f7fb';
    disc(g, 250, 233, 7);
    disc(g, 250, 221, 5.5);
    disc(g, 250, 212, 4.5);
    g.fillStyle = '#d62828';
    g.fillRect(246, 216, 9, 2);
    g.fillStyle = '#1a1a1a';
    for (const [x, y] of [[248, 210], [251, 210], [250, 220], [250, 224]]) g.fillRect(x, y, 1, 1);
    g.fillStyle = '#ff8a2a';
    polygon(g, [[251, 212], [256, 213], [251, 214]]);
    g.strokeStyle = '#5a3a1e';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(245, 220);
    g.lineTo(238, 214);
    g.moveTo(255, 220);
    g.lineTo(262, 215);
    g.stroke();
  }

  // Christmas lights strung diagonally across each tier of the big pines, plus a star on top.
  const LIGHT_COLORS = ['#ff5a5a', '#ffd23f', '#5ad1ff', '#7dff7a', '#ff8ff0'];
  const lights = [];
  for (const [x, base, h] of TREES) {
    for (let k = 0; k < 3; k++) {
      const top = base - h + k * h * 0.25, half = h * (0.225 + k * 0.1125), tierH = h * 0.45;
      const count = Math.round((half * 2) / 6);
      for (let i = 0; i < count; i++) {
        const u = (i + 0.5) / count, reach = half * (0.35 + 0.5 * u);
        lights.push({
          x: Math.round(x + (-0.85 + 1.7 * u) * reach), y: Math.round(top + tierH * (0.35 + 0.5 * u)),
          color: LIGHT_COLORS[lights.length % LIGHT_COLORS.length],
          phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.8,
        });
      }
    }
  }

  function twinkle(g, now) {
    for (const l of lights) {
      const on = Math.sin(now * 0.003 * l.speed + l.phase) > -0.3;
      g.fillStyle = l.color;
      if (on) { // glow around a lit bulb
        g.globalAlpha = 0.3;
        g.fillRect(l.x - 1, l.y - 1, 4, 4);
      }
      g.globalAlpha = on ? 1 : 0.3;
      g.fillRect(l.x, l.y, 2, 2);
      g.globalAlpha = 1;
    }
    for (const [x, base, h] of TREES) {
      const glow = 0.25 + 0.2 * Math.sin(now * 0.004 + x);
      g.fillStyle = `rgba(255, 210, 63, ${glow.toFixed(2)})`;
      disc(g, x, base - h, 5);
      g.fillStyle = '#ffd23f';
      polygon(g, [[x, base - h - 4], [x + 1.2, base - h - 1.2], [x + 4, base - h - 1], [x + 1.8, base - h + 1],
        [x + 2.5, base - h + 4], [x, base - h + 2], [x - 2.5, base - h + 4], [x - 1.8, base - h + 1],
        [x - 4, base - h - 1], [x - 1.2, base - h - 1.2]]);
    }
  }

  // Chocolate waterfall geometry (canvas px). The stream is 6 px deep upstream and thins to
  // about 0.7 of that at the brink, x = 150, where the bed ends.
  function streamSurface(x) {
    return 115 + 1.7 * ((x - 124) / 26) ** 2;
  }

  // A point on the falling sheet at time t (0 = brink, 1 = splashdown), across it from its
  // lower surface (0), which leaves the edge of the rock, to its upper surface (1).
  // Free fall: horizontal distance grows with t, drop with t squared.
  function fallPoint(t, across) {
    return [150 + (19 + 9 * across) * t, 121 - 4.3 * across + (87 + 4 * across) * t * t];
  }

  function chocolateFlow(g, now) {
    // ripples speeding up towards the brink
    g.fillStyle = '#8f5635';
    for (let i = 0; i < 3; i++) {
      const u = (now * 0.0009 + i / 3) % 1, x = 131 + 19 * u * u;
      g.fillRect(Math.round(x), Math.round(streamSurface(x)) + 1, 2, 1);
    }
    // streaks falling with the sheet, turning frothy and pale as air mixes in lower down
    for (let i = 0; i < 14; i++) {
      const t = (now * 0.0011 + i * 0.29) % 1;
      const [x, y] = fallPoint(t, (i % 3) / 2);
      g.fillStyle = t > 0.7 ? '#e8cfae' : t > 0.35 ? '#b98556' : '#8f5635';
      g.fillRect(Math.round(x), Math.round(y), 1, 2 + Math.round(t * 4));
    }
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
    const theme = THEMES[game.level.theme], now = performance.now();
    ctx.drawImage(background(game.level.theme), 0, 0);
    if (theme.animate) theme.animate(ctx, now);

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

    if (theme.weather) theme.weather(ctx, now); // rain and snow fall in front of the scene
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
