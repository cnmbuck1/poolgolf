// Computer opponents. To pick a shot, the computer plays candidate shots out in a copy of the hole, using
// the same physics and the moving obstacles at the moment it will shoot, and keeps the one that sinks or
// leaves the shortest way to the cup. Then its skill decides how far the real shot strays from the plan.
import { LevelDef } from './levels';
import { routeDistance, shotSpeed, World } from './physics';

export interface Opponent {
  id: string;
  name: string;
  /** Avatar shown on cards and during the computer's turn. */
  emoji: string;
  color: string;
  blurb: string;
  /** Aim error (degrees, one standard deviation) and power error (fraction). */
  aimErr: number;
  powErr: number;
  /** Chooses at random among this many of its best plans (sloppier players don't always see the best line). */
  choice: number;
  /** How much of the slopes and craters it reads when planning (1 = all of it, 0 = plans as if flat). */
  reads: number;
  /** Coins for beating them the first time; a smaller amount for later wins. */
  reward: number;
}

export const OPPONENTS: Opponent[] = [
  { id: 'ricky', name: 'Rookie Ricky', emoji: '🧢', color: '#5ab0ff', blurb: 'Keen, wild, and a little too fond of full power.', aimErr: 5, powErr: 0.15, choice: 3, reads: 0.4, reward: 60 },
  { id: 'carla', name: 'Cue-Ball Carla', emoji: '🎱', color: '#ff7a9a', blurb: 'Pool hall regular. Loves a bank shot.', aimErr: 5, powErr: 0.14, choice: 2, reads: 0.6, reward: 120 },
  { id: 'bob', name: 'Bankshot Bob', emoji: '🎩', color: '#ffc04a', blurb: 'Smooth, steady, rarely three-putts.', aimErr: 4.4, powErr: 0.13, choice: 1, reads: 0.8, reward: 200 },
  { id: 'prof', name: 'The Professor', emoji: '🧐', color: '#9a8aff', blurb: 'Has calculated every angle. Twice.', aimErr: 3.3, powErr: 0.1, choice: 1, reads: 1, reward: 350 },
  { id: 'galaxy', name: 'Ace Galaxy', emoji: '👽', color: '#5ae08a', blurb: 'From a planet where everyone shoots aces.', aimErr: 2.8, powErr: 0.09, choice: 1, reads: 1, reward: 500 },
];

/** A planned shot; `delay` is how long after the planned moment to wait for moving obstacles. */
export interface Plan { deg: number; power: number; delay: number; score: number }

const simWorlds = new Map<string, WeakMap<LevelDef, World>>();
/** The hole as a player who only partly reads the ground sees it: slopes and craters scaled down. */
function misread(L: LevelDef, k: number): LevelDef {
  if (k >= 1) return L;
  return {
    ...L,
    slopes: (L.slopes ?? []).map((s) => (s.kind === 'hill' ? { ...s, h: s.h * k } : { ...s, drop: s.drop * k })),
    craters: (L.craters ?? []).map((c) => ({ ...c, depth: (c.depth ?? 7) * k, rim: (c.rim ?? 4) * k })),
    // Volcano flanks can't be scaled: weak readers see just the cone's core as a boulder
    volcanoes: k >= 0.5 ? L.volcanoes : [],
    rocks: k >= 0.5 ? L.rocks : [...(L.rocks ?? []), ...(L.volcanoes ?? []).map((v) => ({ x: v.x, y: v.y, r: v.r * 0.42 }))],
  };
}

/** Play one candidate shot out in a copy of the hole; lower scores are better (a sink is best). */
function trial(world: World, sim: World, at: number, x: number, y: number, deg: number, power: number) {
  sim.ball.x = x; sim.ball.y = y;
  sim.time = at;
  sim.spinners.forEach((s, i) => (s.angle = world.spinners[i].angle + s.speed * (at - world.time)));
  const a = (deg * Math.PI) / 180, sp = shotSpeed(power);
  sim.shoot(Math.cos(a) * sp, Math.sin(a) * sp);
  for (let k = 0; k < 240 && sim.moving; k++) {
    const ev = sim.step(1 / 40);
    if (ev.some((e) => e.type === 'sink')) return -600 + power * 10; // prefer the gentler of two sinks
    if (ev.some((e) => e.type === 'water')) return routeDistance(world, x, y) + 400; // a stroke and back to here
  }
  const d = routeDistance(world, sim.ball.x, sim.ball.y);
  return Number.isFinite(d) ? d : 5000;
}

/**
 * Plans a shot a little at a time (so the game keeps animating while the computer "lines up"). The shot is
 * for world time `at`: the computer fires exactly then, so moving obstacles are where it expected.
 */
export class Planner {
  done = false;
  private queue: [number, number, number][] = [];
  private results: Plan[] = [];
  private robust: Plan[] = [];
  private phase = 0;
  private sim: World;

  constructor(private world: World, private opp: Opponent, readonly at: number, private rand: () => number) {
    if (!simWorlds.has(opp.id)) simWorlds.set(opp.id, new WeakMap());
    const cache = simWorlds.get(opp.id)!;
    let sim = cache.get(world.level);
    if (!sim) { sim = new World(misread(world.level, opp.reads)); cache.set(world.level, sim); }
    this.sim = sim;
    // Coarse sweep all the way round; with moving obstacles, also try waiting a moment for a gap
    const moving = hasMovers(world.level);
    const delays = moving ? [0, 0.5, 1] : [0];
    for (const dl of delays) for (let deg = 0; deg < 360; deg += moving ? 7 : 5) for (const p of [0.13, 0.22, 0.34, 0.48, 0.64, 0.82, 1]) this.queue.push([deg, p, dl]);
  }

  /** Work for up to `ms` milliseconds; returns the plan once finished. */
  step(ms: number): Plan | null {
    const t0 = performance.now();
    const { x, y } = this.world.ball;
    while (this.queue.length && performance.now() - t0 < ms) {
      const [deg, p, dl] = this.queue.pop()!;
      this.results.push({ deg, power: p, delay: dl, score: trial(this.world, this.sim, this.at + dl, x, y, deg, p) });
    }
    if (this.queue.length) return null;
    if (this.phase === 1) {
      // Play it safe for its skill: score the best few lines by how they turn out with typical misses
      this.phase = 2;
      const { aimErr, powErr } = this.opp;
      for (const t of this.best(6)) {
        let sum = t.score;
        for (const [dd, dp] of [[aimErr, 0], [-aimErr, 0], [0, powErr], [0, -powErr]]) {
          sum += trial(this.world, this.sim, this.at + t.delay, x, y, t.deg + dd, Math.min(1, Math.max(0.05, t.power * (1 + dp))));
        }
        this.robust.push({ ...t, score: sum / 5 });
      }
      this.results = this.robust;
    }
    if (this.phase === 0) {
      // Refine round the best distinct lines
      this.phase = 1;
      const top = this.best(2);
      for (const t of top) for (let dd = -3; dd <= 3; dd += 0.75) for (let dp = -0.09; dp <= 0.0901; dp += 0.03) {
        const p = Math.min(1, Math.max(0.06, t.power + dp));
        this.queue.push([(t.deg + dd + 360) % 360, p, t.delay]);
      }
      return null;
    }
    this.done = true;
    const picks = this.best(this.opp.choice);
    return picks[Math.floor(this.rand() * picks.length)];
  }

  /** The n best plans, each at least 6 degrees or a different wait from the others. */
  private best(n: number) {
    const sorted = [...this.results].sort((a, b) => a.score - b.score);
    const out: Plan[] = [];
    for (const r of sorted) {
      if (out.every((o) => o.delay !== r.delay || Math.abs(((o.deg - r.deg + 540) % 360) - 180) >= 6)) out.push(r);
      if (out.length >= n) break;
    }
    return out;
  }
}

/** Does anything on the hole move (so the moment of the shot matters)? */
export function hasMovers(L: LevelDef) {
  return !!(L.spinners?.length || L.tumbleweeds?.length || L.dinos?.length || L.asteroids?.length || L.aliens?.length || L.astronauts?.length || L.rockets?.length || L.meteors?.length);
}

/** Gaussian noise for the computer's aim and power. */
export function gauss(rand: () => number) {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Where the computer actually hits it: the plan plus its skill's error. */
export function execute(plan: Plan, opp: Opponent, rand: () => number) {
  return {
    delay: plan.delay,
    deg: plan.deg + gauss(rand) * opp.aimErr,
    power: Math.min(1, Math.max(0.05, plan.power * (1 + gauss(rand) * opp.powErr))),
  };
}
