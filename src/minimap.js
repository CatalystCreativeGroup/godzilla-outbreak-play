// Minimap (top-right): roads, districts, mission targets, monsters, army and vehicles, turning with Joseph.
// Tap it to open the whole city map.
import { ROADS, DISTRICTS, WORLD } from './map.js';
import { missionTargets, objective } from './missions.js';
import { world, P, $ } from './world.js';

const DISTRICT_COLORS = {
  downtown: '#3a3f47', residential: '#2f4a2c', harbor: '#2e3a40', airport: '#3b3f3a', military: '#3a3d2a', volcano: '#4a2418',
};
let ctx = null, canvas = null, big = false, frame = 0;

export function initMinimap() {
  canvas = $('minimap');
  ctx = canvas.getContext('2d');
  canvas.addEventListener('click', () => { big = !big; canvas.classList.toggle('big', big); resize(); });
  resize();
}
function resize() {
  const px = Math.min(window.devicePixelRatio || 1, 2);
  const css = canvas.getBoundingClientRect();
  canvas.width = Math.round(css.width * px); canvas.height = Math.round(css.height * px);
}
window.addEventListener('resize', () => canvas && resize());

function drawWorld(toScreen, scale) {
  // grass and water
  ctx.fillStyle = '#28331f';
  const a = toScreen(-WORLD - 200, -WORLD - 200), b = toScreen(WORLD + 200, WORLD + 200);
  ctx.save();
  for (const [id, d] of Object.entries(DISTRICTS)) {
    ctx.fillStyle = DISTRICT_COLORS[id];
    polygon([[d.x0, d.z0], [d.x1, d.z0], [d.x1, d.z1], [d.x0, d.z1]], toScreen);
  }
  ctx.fillStyle = '#1c4d66';
  polygon([[-700, 262], [700, 262], [700, 900], [-700, 900]], toScreen);
  ctx.restore();
  ctx.lineCap = 'round';
  for (const r of ROADS) {
    const p0 = toScreen(r.x0, r.z0), p1 = toScreen(r.x1, r.z1);
    ctx.strokeStyle = r.kind === 'highway' ? '#c9c2a8' : '#8b8f96';
    ctx.lineWidth = Math.max(1, r.w * scale * (r.kind === 'highway' ? 0.9 : 0.6));
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
  }
  // runway
  ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = Math.max(2, 30 * scale);
  const r0 = toScreen(335, -150), r1 = toScreen(335, 240);
  ctx.beginPath(); ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]); ctx.stroke();
  return [a, b];
}
function polygon(pts, toScreen) {
  ctx.beginPath();
  pts.forEach(([x, z], i) => { const p = toScreen(x, z); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
  ctx.closePath(); ctx.fill();
}

function dot(p, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fill(); }

export function updateMinimap() {
  if (!ctx || (frame++ % 2 && !big)) return;
  // it was hidden while loading: measure again once it's on screen
  if (canvas.clientWidth && Math.abs(canvas.width - canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2)) > 2) resize();
  const W = canvas.width, H = canvas.height, px = W / (big ? 600 : 150);
  ctx.clearRect(0, 0, W, H);
  const radius = big ? WORLD + 40 : (P.vehicle?.type === 'jet' ? 220 : P.vehicle ? 150 : 100);
  const scale = (Math.min(W, H) / 2) / radius;
  const cx = W / 2, cy = H / 2;
  // small map turns with Joseph (forward is up); the big map is north-up
  const yaw = big ? Math.PI : P.yaw, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const ox = big ? 0 : P.pos.x, oz = big ? 0 : P.pos.z;
  const toScreen = (x, z) => {
    const dx = x - ox, dz = z - oz;
    // forward (sin yaw, cos yaw) maps to up (0, -1)
    const rx = dx * cos - dz * sin, fz = dx * sin + dz * cos;
    return [cx - rx * scale, cy - fz * scale];
  };
  ctx.save();
  if (!big) { ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) / 2, 0, Math.PI * 2); ctx.clip(); }
  ctx.fillStyle = '#28331f'; ctx.fillRect(0, 0, W, H);
  drawWorld(toScreen, scale);
  if (big) {
    ctx.font = `${12 * px}px "Russo One", sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const d of Object.values(DISTRICTS)) { const p = toScreen((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2); ctx.fillText(d.name, p[0], p[1]); }
  }
  const inView = p => big || Math.hypot(p[0] - cx, p[1] - cy) < Math.min(W, H) / 2 - 4 * px;
  for (const v of world.vehicles || []) {
    if (v.dead || v.occupied) continue;
    const p = toScreen(v.pos.x, v.pos.z);
    if (!inView(p)) continue;
    ctx.fillStyle = v.type === 'jet' ? '#9fd3ff' : v.type === 'tank' ? '#b8c46a' : '#ffffff';
    ctx.fillRect(p[0] - 2.5 * px, p[1] - 2.5 * px, 5 * px, 5 * px);
  }
  for (const e of world.enemies) if (e.alive) { const p = toScreen(e.pos.x, e.pos.z); if (inView(p)) dot(p, 2 * px, '#ff4d4d'); }
  for (const a of world.allies) { const p = toScreen(a.pos.x, a.pos.z); if (inView(p)) dot(p, 2 * px, '#7dff6a'); }
  for (const t of missionTargets()) {
    let p = toScreen(t.pos.x, t.pos.z);
    if (!inView(p)) { // pin to the edge so you know which way to go
      const ang = Math.atan2(p[1] - cy, p[0] - cx), rr = Math.min(W, H) / 2 - 6 * px;
      p = [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr];
    }
    dot(p, 4 * px, '#ffc23d');
  }
  if (world.bossTarget?.alive) { const p = toScreen(world.bossTarget.pos.x, world.bossTarget.pos.z); dot(p, 6 * px, '#ff2a2a'); }
  const goal = objective();
  if (goal) { const p = toScreen(goal.x, goal.z); if (inView(p)) { ctx.strokeStyle = '#ffc23d'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.arc(p[0], p[1], 7 * px, 0, Math.PI * 2); ctx.stroke(); } }
  // Joseph: an arrow pointing the way he faces
  const me = toScreen(P.pos.x, P.pos.z);
  ctx.save();
  ctx.translate(me[0], me[1]);
  ctx.rotate(big ? Math.PI - P.yaw : 0);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 * px;
  ctx.beginPath(); ctx.moveTo(0, -7 * px); ctx.lineTo(5 * px, 6 * px); ctx.lineTo(0, 3 * px); ctx.lineTo(-5 * px, 6 * px); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

export const minimapOpen = () => big;
