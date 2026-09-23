/* Angry Ninjas: levels, physics and rules. No DOM code here, so tests can run it in Node. */
(function (root) {
  'use strict';

  const Matter = root.Matter || require('./lib/matter.min.js');
  const { Engine, Bodies, Body, Composite, Events } = Matter;

  // Everything is laid out in canvas pixels. The physics world is S times larger
  // because Matter.js behaves best with bodies a few tens of units across.
  const W = 480;
  const H = 270;
  const S = 2;
  const GROUND_Y = 240;
  const SLING = { x: 80, y: 196 };
  const MAX_PULL = 36;
  const MIN_PULL = 6;
  const LAUNCH_SPEED = 16; // physics units per 1/60 s at full pull
  const NINJA_R = 6;
  const STEP = 1000 / 120; // fixed physics step, ms
  const MIN_IMPACT = 1.5; // slower impacts do no damage
  const SETTLE_MS = 1000; // no damage while a fresh level settles
  const NINJA_BONUS = 10000;

  // absorb: share of speed a body keeps after smashing through this material
  const MATERIALS = {
    wood: { density: 0.0012, health: 3, score: 500, absorb: 0.6 },
    ice: { density: 0.0009, health: 1.5, score: 300, absorb: 0.8 },
    stone: { density: 0.003, health: 10, score: 800, absorb: 0.4 },
  };

  const SHAPES = {
    sq: [12, 12],
    post: [6, 36],
    plank: [36, 6],
    long: [60, 6],
    beam: [96, 6],
  };

  const FRUITS = {
    apple: { r: 6, health: 1 },
    orange: { r: 6, health: 1.2 },
    melon: { r: 9, health: 2.5 },
  };
  const FRUIT_SCORE = 5000;
  const FRUIT_ABSORB = 0.9;

  // blocks: [material, shape, centre x, height of its bottom above the ground]
  // fruits: [type, centre x, height of its bottom above the ground]
  const LEVELS = [
    {
      name: 'First Slice',
      theme: 'day',
      ninjas: 3,
      blocks: [
        ['wood', 'post', 275, 0], ['wood', 'post', 305, 0], ['wood', 'plank', 290, 36],
        ['wood', 'post', 365, 0], ['wood', 'post', 395, 0], ['wood', 'plank', 380, 36],
        ['wood', 'post', 365, 42], ['wood', 'post', 395, 42], ['wood', 'plank', 380, 78],
      ],
      fruits: [['orange', 290, 42], ['apple', 380, 0]],
    },
    {
      name: 'Thin Ice',
      theme: 'dusk',
      ninjas: 4,
      blocks: [
        ['wood', 'post', 285, 0], ['wood', 'post', 315, 0], ['ice', 'plank', 300, 36],
        ['wood', 'post', 345, 0], ['wood', 'post', 375, 0], ['ice', 'plank', 360, 36],
        ['wood', 'long', 330, 42], ['ice', 'sq', 306, 48], ['ice', 'sq', 354, 48],
        ['ice', 'post', 415, 0], ['ice', 'post', 445, 0], ['wood', 'plank', 430, 36],
        ['ice', 'post', 415, 42], ['ice', 'post', 445, 42], ['wood', 'plank', 430, 78],
      ],
      fruits: [['apple', 300, 0], ['orange', 360, 0], ['melon', 330, 48], ['apple', 430, 84]],
    },
    {
      name: 'Stone Temple',
      theme: 'night',
      ninjas: 4,
      blocks: [
        ['stone', 'post', 283, 0], ['stone', 'post', 337, 0], ['stone', 'long', 310, 36],
        ['stone', 'post', 367, 0], ['stone', 'post', 421, 0], ['stone', 'long', 394, 36],
        ['wood', 'beam', 352, 42],
        ['ice', 'post', 316, 48], ['ice', 'post', 388, 48], ['wood', 'beam', 352, 84],
        ['stone', 'sq', 322, 90], ['stone', 'sq', 382, 90],
      ],
      fruits: [['apple', 310, 0], ['orange', 412, 42], ['melon', 352, 48], ['apple', 352, 90]],
    },
    {
      name: 'Mad Tea Party',
      theme: 'wonderland',
      ninjas: 4,
      blocks: [
        ['wood', 'post', 284, 0], ['wood', 'post', 372, 0], ['wood', 'beam', 328, 36],
        ['ice', 'sq', 316, 42], ['ice', 'sq', 356, 42],
        ['wood', 'post', 415, 0], ['wood', 'post', 445, 0], ['wood', 'plank', 430, 36],
        ['stone', 'sq', 430, 42], ['stone', 'sq', 430, 54],
      ],
      fruits: [['apple', 296, 42], ['orange', 336, 42], ['melon', 328, 0], ['apple', 430, 66]],
    },
    {
      name: 'Chocolate River',
      theme: 'chocolate',
      ninjas: 4,
      blocks: [
        ['ice', 'sq', 302, 0], ['ice', 'sq', 302, 12], ['ice', 'sq', 302, 24],
        ['wood', 'sq', 386, 0], ['wood', 'sq', 398, 0], ['wood', 'sq', 386, 12],
        ['wood', 'sq', 398, 12], ['wood', 'sq', 386, 24], ['wood', 'sq', 398, 24],
        ['stone', 'beam', 344, 36], ['ice', 'sq', 316, 42],
        ['ice', 'post', 430, 0], ['ice', 'post', 450, 0], ['wood', 'plank', 440, 36],
        ['ice', 'post', 430, 42], ['ice', 'post', 450, 42], ['wood', 'plank', 440, 78],
      ],
      fruits: [['apple', 344, 0], ['melon', 344, 42], ['orange', 372, 42], ['apple', 440, 84]],
    },
    {
      name: "Gatsby's Party",
      theme: 'gatsby',
      ninjas: 4,
      blocks: [
        ['stone', 'post', 312, 0], ['stone', 'post', 396, 0], ['stone', 'beam', 354, 36],
        ['ice', 'sq', 330, 42], ['ice', 'sq', 342, 42], ['ice', 'sq', 354, 42], ['ice', 'sq', 366, 42], ['ice', 'sq', 378, 42],
        ['ice', 'sq', 336, 54], ['ice', 'sq', 348, 54], ['ice', 'sq', 360, 54], ['ice', 'sq', 372, 54],
        ['ice', 'sq', 342, 66], ['ice', 'sq', 354, 66], ['ice', 'sq', 366, 66],
        ['ice', 'sq', 348, 78], ['ice', 'sq', 360, 78],
        ['stone', 'post', 428, 0], ['stone', 'post', 452, 0], ['stone', 'plank', 440, 36],
        ['stone', 'post', 428, 42], ['stone', 'post', 452, 42], ['stone', 'plank', 440, 78],
      ],
      fruits: [['apple', 354, 0], ['melon', 354, 90], ['orange', 440, 84], ['apple', 440, 0]],
    },
    {
      name: 'Gloom Academy',
      theme: 'gothic',
      ninjas: 4,
      blocks: [
        ['stone', 'post', 285, 0], ['stone', 'post', 315, 0], ['stone', 'plank', 300, 36],
        ['wood', 'post', 285, 42], ['wood', 'post', 315, 42], ['wood', 'plank', 300, 78],
        ['ice', 'sq', 300, 84],
        ['stone', 'post', 395, 0], ['stone', 'post', 425, 0], ['stone', 'plank', 410, 36],
        ['wood', 'post', 395, 42], ['wood', 'post', 425, 42], ['wood', 'plank', 410, 78],
      ],
      fruits: [['apple', 300, 0], ['orange', 300, 42], ['apple', 410, 0], ['melon', 410, 84]],
    },
    {
      name: 'Misty Pines',
      theme: 'pines',
      ninjas: 4,
      blocks: [
        ['wood', 'post', 290, 0], ['ice', 'post', 317, 0], ['wood', 'post', 344, 0], ['wood', 'long', 317, 36],
        ['ice', 'post', 293, 42], ['ice', 'post', 341, 42], ['wood', 'long', 317, 78],
        ['wood', 'post', 380, 0], ['ice', 'post', 407, 0], ['wood', 'post', 434, 0], ['wood', 'long', 407, 36],
        ['wood', 'sq', 395, 42], ['ice', 'sq', 425, 42],
      ],
      fruits: [['apple', 303, 0], ['apple', 317, 42], ['apple', 420, 0], ['apple', 317, 84]],
    },
    {
      name: 'Winter Lights',
      theme: 'winter',
      ninjas: 4,
      blocks: [
        ['stone', 'sq', 284, 0], ['wood', 'sq', 296, 0], ['ice', 'sq', 290, 12],
        ['stone', 'post', 383, 0], ['stone', 'post', 437, 0], ['stone', 'long', 410, 36],
        ['ice', 'post', 398, 42], ['ice', 'post', 422, 42], ['wood', 'plank', 410, 78],
        ['wood', 'sq', 410, 84],
      ],
      fruits: [['apple', 290, 24], ['apple', 410, 0], ['orange', 410, 42], ['orange', 410, 96]],
    },
  ];

  // Limit a slingshot pull to its maximum length and keep the ninja above the ground.
  function clampPull(x, y) {
    const k = Math.min(1, MAX_PULL / (Math.hypot(x, y) || 1));
    return { x: x * k, y: Math.min(y * k, GROUND_Y - NINJA_R - SLING.y) };
  }

  // Velocity of the point on a body, including spin, so toppling blocks hit hard.
  function pointVelocity(body, point) {
    const v = Body.getVelocity(body), w = Body.getAngularVelocity(body);
    return { x: v.x - w * (point.y - body.position.y), y: v.y + w * (point.x - body.position.x) };
  }

  class Game {
    constructor(levelIndex) {
      this.levelIndex = levelIndex;
      this.level = LEVELS[levelIndex];
      this.engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
      this.world = this.engine.world;
      this.state = 'aim'; // aim -> fly -> settle -> aim ... -> clear -> won | lost
      this.stateTime = 0;
      this.time = 0;
      this.score = 0;
      this.ninjasLeft = this.level.ninjas; // includes the one waiting on the sling
      this.fruitsLeft = this.level.fruits.length;
      this.ninja = null;
      this.launched = false;
      this.trail = [];
      this.fx = []; // visual events for the renderer to consume
      this.broken = [];

      Composite.add(this.world, Bodies.rectangle(W / 2 * S, (GROUND_Y + 50) * S, (W + 800) * S, 100 * S, {
        isStatic: true, friction: 1, label: 'ground',
      }));

      for (const [mat, shape, x, b] of this.level.blocks) {
        const [w, h] = SHAPES[shape];
        const m = MATERIALS[mat];
        Composite.add(this.world, Bodies.rectangle(x * S, (GROUND_Y - b - h / 2) * S, w * S, h * S, {
          label: 'block', density: m.density, friction: 0.8, frictionStatic: 1, restitution: 0,
          plugin: { mat, w, h, health: m.health, maxHealth: m.health },
        }));
      }

      for (const [type, x, b] of this.level.fruits) {
        const f = FRUITS[type];
        Composite.add(this.world, Bodies.circle(x * S, (GROUND_Y - b - f.r) * S, f.r * S, {
          label: 'fruit', density: 0.0008, friction: 0.6, restitution: 0.2,
          plugin: { type, r: f.r, health: f.health, maxHealth: f.health },
        }));
      }

      Events.on(this.engine, 'collisionStart', (e) => this.onCollision(e.pairs));
    }

    launch(px, py) {
      if (this.state !== 'aim' || Math.hypot(px, py) < MIN_PULL) return false;
      const pull = clampPull(px, py);
      const ninja = Bodies.circle((SLING.x + pull.x) * S, (SLING.y + pull.y) * S, NINJA_R * S, {
        label: 'ninja', density: 0.004, friction: 0.6, restitution: 0.2, frictionAir: 0,
      });
      const vx = -pull.x / MAX_PULL * LAUNCH_SPEED;
      const vy = -pull.y / MAX_PULL * LAUNCH_SPEED;
      Body.setVelocity(ninja, { x: vx, y: vy });
      Body.setAngularVelocity(ninja, vx >= 0 ? 0.25 : -0.25);
      Composite.add(this.world, ninja);
      this.ninja = ninja;
      this.ninjasLeft--;
      this.launched = true;
      this.trail = [];
      this.stillTime = 0;
      this.setState('fly');
      return true;
    }

    step(dt) {
      this.time += dt;
      this.stateTime += dt;
      Engine.update(this.engine, dt);

      for (const body of this.broken) this.remove(body, true);
      this.broken.length = 0;

      for (const body of Composite.allBodies(this.world)) {
        if (body.isStatic || body === this.ninja) continue;
        const x = body.position.x / S, y = body.position.y / S;
        if (x < -60 || x > W + 60 || y > H + 60) this.remove(body, false);
      }

      this.updateState(dt);
    }

    updateState(dt) {
      if (this.fruitsLeft === 0 && this.state !== 'clear' && this.state !== 'won') this.setState('clear');

      if (this.state === 'fly') {
        const n = this.ninja;
        const x = n.position.x / S, y = n.position.y / S;
        const last = this.trail[this.trail.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) > 10) this.trail.push({ x, y });
        this.stillTime = n.speed < 0.3 ? this.stillTime + dt : 0;
        if (x < -40 || x > W + 40 || y > H + 40 || this.stillTime > 700 || this.stateTime > 8000) {
          this.fx.push({ type: 'poof', x, y });
          Composite.remove(this.world, n);
          this.ninja = null;
          this.setState('settle');
        }
      } else if (this.state === 'settle') {
        if (this.stateTime > 4000 || (this.stateTime > 500 && this.isCalm())) {
          this.setState(this.ninjasLeft > 0 ? 'aim' : 'lost');
        }
      } else if (this.state === 'clear') {
        if (this.stateTime > 1500) {
          this.bonus = this.ninjasLeft * NINJA_BONUS;
          this.score += this.bonus;
          this.setState('won');
        }
      }
    }

    setState(state) {
      this.state = state;
      this.stateTime = 0;
    }

    isCalm() {
      return Composite.allBodies(this.world).every((b) => b.isStatic || (b.speed < 0.2 && b.angularSpeed < 0.01));
    }

    onCollision(pairs) {
      if (!this.launched && this.time < SETTLE_MS) return;
      for (const pair of pairs) {
        const a = pair.bodyA, b = pair.bodyB, c = pair.collision;
        const point = c.supports[0];
        const va = pointVelocity(a, point), vb = pointVelocity(b, point), n = c.normal;
        const dv = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
        if (dv <= MIN_IMPACT) continue;
        const mass = a.isStatic ? b.mass : b.isStatic ? a.mass : a.mass * b.mass / (a.mass + b.mass);
        const damage = (dv - MIN_IMPACT) * mass;
        const brokeA = this.hurt(a, damage, b);
        const brokeB = this.hurt(b, damage, a);
        // Skip the collision response so the other body carries on through the wreckage.
        if (brokeA || brokeB) pair.isActive = false;
      }
    }

    // Damage a block or fruit. Returns true if this hit broke it.
    hurt(body, damage, other) {
      const p = body.plugin;
      if (p.health === undefined || p.broken) return false;
      p.health -= damage;
      if (p.health > 0) return false;
      p.broken = true;
      this.broken.push(body);
      if (!other.isStatic) {
        const keep = body.label === 'fruit' ? FRUIT_ABSORB : MATERIALS[p.mat].absorb;
        const v = Body.getVelocity(other);
        Body.setVelocity(other, { x: v.x * keep, y: v.y * keep });
      }
      return true;
    }

    remove(body, smashed) {
      Composite.remove(this.world, body);
      const p = body.plugin;
      const v = Body.getVelocity(body);
      const fx = {
        x: body.position.x / S, y: body.position.y / S, angle: body.angle,
        vx: v.x / S / (1000 / 60), vy: v.y / S / (1000 / 60), // canvas px per ms
      };
      if (body.label === 'fruit') {
        this.fruitsLeft--;
        this.score += FRUIT_SCORE;
        if (smashed) this.fx.push({ ...fx, type: 'fruit', fruit: p.type, r: p.r });
      } else if (smashed) {
        this.score += MATERIALS[p.mat].score;
        this.fx.push({ ...fx, type: 'block', mat: p.mat, w: p.w, h: p.h });
      }
    }
  }

  const Sim = {
    W, H, S, GROUND_Y, SLING, MAX_PULL, NINJA_R, STEP, SHAPES, FRUITS, LEVELS, clampPull, Game,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
  else root.Sim = Sim;
})(typeof window !== 'undefined' ? window : globalThis);
