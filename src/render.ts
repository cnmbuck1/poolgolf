import { LevelDef, WORLD_H, WORLD_W, Zone } from './levels';
import { BALL_R, CUP_R, SPINNER_R, World } from './physics';

export const RAIL = 38;

const C = {
  bg: '#101b29',
  rail: '#364957',
  railHi: '#4a6070',
  felt: '#70b878',
  feltDark: '#5ea566',
  wood: '#e8bd77',
  woodHi: '#f4d59d',
  woodLo: '#c99a55',
  water: '#315f65',
  waterDeep: '#274452',
  sand: '#e6d29c',
  spinner: '#e8e1ca',
  cupRim: '#15272d',
  cup: '#080f16',
  ball: '#dce8ed',
  aim: '#fdf4a4',
  cue: '#b67e49',
  sight: '#e8e1ca',
};

export interface View { scale: number; ox: number; oy: number; dpr: number }

export interface AimState { active: boolean; dx: number; dy: number; power: number }

export interface FX {
  sink?: { t: number };               // 0..1 progress of sinking animation
  splash?: { x: number; y: number; t: number };
  ripples: { x: number; y: number; t: number }[];
}

/** Fit table (felt + rails) into the canvas, leaving room for the HUD bar on top. */
export function computeView(w: number, h: number, dpr: number, topInset: number, bottomInset: number): View {
  const totalW = WORLD_W + RAIL * 2;
  const totalH = WORLD_H + RAIL * 2;
  const pad = 10;
  const availH = h - topInset - bottomInset - pad;
  const scale = Math.min((w - pad * 2) / totalW, availH / totalH);
  const ox = (w - totalW * scale) / 2 + RAIL * scale;
  const oy = topInset + (availH - totalH * scale) / 2 + RAIL * scale;
  return { scale, ox, oy, dpr };
}

export function render(g: CanvasRenderingContext2D, v: View, world: World, aim: AimState, fx: FX, time: number) {
  const { scale, ox, oy, dpr } = v;
  const cw = g.canvas.width / dpr;
  const ch = g.canvas.height / dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bgGrad = g.createRadialGradient(cw / 2, ch / 2, 50, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  bgGrad.addColorStop(0, '#1a2b3e');
  bgGrad.addColorStop(1, C.bg);
  g.fillStyle = bgGrad;
  g.fillRect(0, 0, cw, ch);

  g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  const L = world.level;

  drawTable(g);
  for (const z of L.sand ?? []) drawSand(g, z);
  for (const z of L.water ?? []) drawWater(g, z, time);
  drawTee(g, L);
  drawCup(g, L, time);

  // Shadow pass for raised objects, then the objects themselves.
  g.save();
  g.translate(4, 6);
  g.globalAlpha = 0.22;
  g.fillStyle = '#000';
  g.strokeStyle = '#000';
  drawWallsShape(g, world, true);
  for (const b of L.bumpers ?? []) circle(g, b.x, b.y, b.r);
  g.restore();

  drawWallsShape(g, world, false);
  for (const b of L.bumpers ?? []) drawBumper(g, b.x, b.y, b.r, b.color, b.n);
  for (const s of world.spinners) drawSpinner(g, world, s);

  for (const r of fx.ripples) {
    g.strokeStyle = `rgba(220,240,255,${0.6 * (1 - r.t)})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(r.x, r.y, 10 + r.t * 50, 0, Math.PI * 2);
    g.stroke();
  }

  if (aim.active && aim.power > 0.02) drawAim(g, world, aim);

  // Ball
  const b = world.ball;
  let br = BALL_R;
  let bx = b.x, by = b.y;
  if (fx.sink) {
    const t = Math.min(1, fx.sink.t);
    br = BALL_R * (1 - 0.6 * t);
    bx += (L.cup[0] - bx) * t;
    by += (L.cup[1] - by) * t;
  }
  if (!fx.splash) {
    if (!fx.sink) {
      g.fillStyle = 'rgba(0,0,0,0.28)';
      circle(g, bx + 3, by + 5, br);
    }
    const bg = g.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.55, C.ball);
    bg.addColorStop(1, '#a9bcc6');
    g.fillStyle = bg;
    circle(g, bx, by, br);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    g.stroke();
  }

  if (aim.active && aim.power > 0.02) drawCue(g, world, aim);
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function drawTable(g: CanvasRenderingContext2D) {
  // Drop shadow under the whole table
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 30;
  g.shadowOffsetY = 14;
  g.fillStyle = C.rail;
  roundRect(g, -RAIL, -RAIL, WORLD_W + RAIL * 2, WORLD_H + RAIL * 2, 46);
  g.fill();
  g.restore();

  // Rail bevel highlight
  const rg = g.createLinearGradient(0, -RAIL, 0, WORLD_H + RAIL);
  rg.addColorStop(0, C.railHi);
  rg.addColorStop(0.5, C.rail);
  rg.addColorStop(1, '#2b3c48');
  g.fillStyle = rg;
  roundRect(g, -RAIL + 3, -RAIL + 3, WORLD_W + RAIL * 2 - 6, WORLD_H + RAIL * 2 - 6, 43);
  g.fill();

  // Diamond sights on the rails
  g.fillStyle = C.sight;
  const dia = (x: number, y: number) => {
    g.beginPath();
    g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y);
    g.closePath(); g.fill();
  };
  for (let i = 1; i < 8; i++) {
    dia((WORLD_W * i) / 8, -RAIL / 2);
    dia((WORLD_W * i) / 8, WORLD_H + RAIL / 2);
  }
  for (let i = 1; i < 4; i++) {
    dia(-RAIL / 2, (WORLD_H * i) / 4);
    dia(WORLD_W + RAIL / 2, (WORLD_H * i) / 4);
  }

  // Felt with a soft vignette
  const fg = g.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 60, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.65);
  fg.addColorStop(0, '#78c180');
  fg.addColorStop(1, C.feltDark);
  g.fillStyle = fg;
  roundRect(g, 0, 0, WORLD_W, WORLD_H, 22);
  g.fill();

  // Cushion inner shadow
  g.save();
  roundRect(g, 0, 0, WORLD_W, WORLD_H, 22);
  g.clip();
  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 10;
  roundRect(g, -2, -2, WORLD_W + 4, WORLD_H + 4, 24);
  g.stroke();
  g.restore();
}

function zonePath(g: CanvasRenderingContext2D, z: Zone, grow = 0) {
  g.beginPath();
  if (z.kind === 'circle') g.arc(z.x, z.y, z.r + grow, 0, Math.PI * 2);
  else g.roundRect(z.x - grow, z.y - grow, z.w + grow * 2, z.h + grow * 2, 26 + grow);
}

function drawSand(g: CanvasRenderingContext2D, z: Zone) {
  g.fillStyle = '#cdb87f';
  zonePath(g, z, 3);
  g.fill();
  g.fillStyle = C.sand;
  zonePath(g, z);
  g.fill();
  // Deterministic speckles
  g.fillStyle = 'rgba(150,120,60,0.35)';
  const cx = z.kind === 'circle' ? z.x : z.x + z.w / 2;
  const cy = z.kind === 'circle' ? z.y : z.y + z.h / 2;
  const rr = z.kind === 'circle' ? z.r : Math.min(z.w, z.h) / 2;
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996;
    const d = Math.sqrt((i + 0.5) / 18) * rr * 0.85;
    circle(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.6);
  }
}

function drawWater(g: CanvasRenderingContext2D, z: Zone, time: number) {
  g.fillStyle = C.water;
  zonePath(g, z, 4);
  g.fill();
  g.fillStyle = C.waterDeep;
  zonePath(g, z, -12);
  g.fill();
  // Animated shimmer lines
  g.save();
  zonePath(g, z, -4);
  g.clip();
  g.strokeStyle = 'rgba(160,210,220,0.18)';
  g.lineWidth = 2;
  const x0 = z.kind === 'circle' ? z.x - z.r : z.x;
  const y0 = z.kind === 'circle' ? z.y - z.r : z.y;
  const w = z.kind === 'circle' ? z.r * 2 : z.w;
  const h = z.kind === 'circle' ? z.r * 2 : z.h;
  for (let y = y0 + 14; y < y0 + h; y += 22) {
    g.beginPath();
    for (let x = x0; x <= x0 + w; x += 10) {
      const yy = y + Math.sin(x * 0.05 + time * 1.6 + y) * 3;
      if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.restore();
}

function drawTee(g: CanvasRenderingContext2D, L: LevelDef) {
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 2;
  g.setLineDash([5, 5]);
  g.beginPath();
  g.arc(L.tee[0], L.tee[1], BALL_R + 9, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
}

function drawCup(g: CanvasRenderingContext2D, L: LevelDef, time: number) {
  const [x, y] = L.cup;
  const pulse = (Math.sin(time * 3) + 1) / 2;
  g.strokeStyle = `rgba(255,255,255,${0.12 + pulse * 0.18})`;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, CUP_R + 10 + pulse * 5, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = C.cupRim;
  circle(g, x, y, CUP_R + 9);
  const cg = g.createRadialGradient(x - 4, y - 5, 2, x, y, CUP_R);
  cg.addColorStop(0, '#000');
  cg.addColorStop(1, '#14222a');
  g.fillStyle = cg;
  circle(g, x, y, CUP_R);
}

function drawWallsShape(g: CanvasRenderingContext2D, world: World, shadow: boolean) {
  g.lineCap = 'round';
  for (const s of world.segs) {
    if (!shadow) {
      g.strokeStyle = C.woodLo;
      g.lineWidth = s.r * 2;
      line(g, s.ax, s.ay + 2, s.bx, s.by + 2);
      g.strokeStyle = C.wood;
      g.lineWidth = s.r * 2 - 2;
    } else {
      g.lineWidth = s.r * 2;
    }
    line(g, s.ax, s.ay, s.bx, s.by);
    if (!shadow) {
      g.strokeStyle = C.woodHi;
      g.lineWidth = 3;
      line(g, s.ax, s.ay - s.r * 0.45, s.bx, s.by - s.r * 0.45);
    }
  }
}

function line(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
}

function drawBumper(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, n: number) {
  const bg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(0.25, color);
  bg.addColorStop(1, shade(color));
  g.fillStyle = bg;
  circle(g, x, y, r);
  g.fillStyle = '#fbf6e8';
  circle(g, x, y, r * 0.45);
  g.fillStyle = '#1a1a1a';
  g.font = `bold ${Math.round(r * 0.6)}px Arial`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), x, y + 1);
}

function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.55);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawSpinner(g: CanvasRenderingContext2D, world: World, s: World['spinners'][number]) {
  g.lineCap = 'round';
  const segs = world.spinnerSegs(s);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = SPINNER_R * 2;
  for (const sg of segs) line(g, sg.ax + 4, sg.ay + 6, sg.bx + 4, sg.by + 6);
  g.strokeStyle = C.spinner;
  for (const sg of segs) line(g, sg.ax, sg.ay, sg.bx, sg.by);
  g.fillStyle = '#9f9883';
  circle(g, s.x, s.y, 10);
  g.fillStyle = C.spinner;
  circle(g, s.x, s.y, 5);
}

function drawAim(g: CanvasRenderingContext2D, world: World, aim: AimState) {
  const b = world.ball;
  const len = 120 + aim.power * 420;
  const hit = world.castAim(aim.dx, aim.dy, len);
  g.strokeStyle = C.aim;
  g.lineWidth = 4;
  g.setLineDash([14, 12]);
  line(g, b.x, b.y, hit.x, hit.y);
  if (hit.hit) {
    // Ghost ball at contact + short bank preview
    g.setLineDash([]);
    g.strokeStyle = 'rgba(253,244,164,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(hit.x, hit.y, BALL_R, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([8, 10]);
    g.strokeStyle = 'rgba(253,244,164,0.5)';
    line(g, hit.x, hit.y, hit.x + hit.rx * 90, hit.y + hit.ry * 90);
  }
  g.setLineDash([]);
}

function drawCue(g: CanvasRenderingContext2D, world: World, aim: AimState) {
  const b = world.ball;
  const back = BALL_R + 8 + aim.power * 70;
  const len = 300;
  const sx = b.x - aim.dx * back;
  const sy = b.y - aim.dy * back;
  const ex = b.x - aim.dx * (back + len);
  const ey = b.y - aim.dy * (back + len);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 11;
  line(g, sx + 4, sy + 7, ex + 4, ey + 7);
  // Shaft (tapered by drawing two passes)
  g.strokeStyle = '#7d522c';
  g.lineWidth = 12;
  line(g, b.x - aim.dx * (back + len * 0.55), b.y - aim.dy * (back + len * 0.55), ex, ey);
  g.strokeStyle = C.cue;
  g.lineWidth = 8;
  line(g, sx, sy, b.x - aim.dx * (back + len * 0.6), b.y - aim.dy * (back + len * 0.6));
  // Ferrule + tip
  g.strokeStyle = '#f3efe2';
  g.lineWidth = 8;
  line(g, sx, sy, sx - aim.dx * 10, sy - aim.dy * 10);
  g.strokeStyle = '#3f74a8';
  g.lineWidth = 8;
  line(g, sx, sy, sx - aim.dx * 3, sy - aim.dy * 3);
}
