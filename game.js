"use strict";

/* ============================================================
 * 《最后一班巴士》 game.js（平行时间线轮回 · House 式）
 *   GameState  灵力/轮回/档案
 *   Spirit     微重力水滴灵体
 *   Interaction 弱力道具交互
 *   Timeline   全局实时时钟：世界不等你；同一时刻只能见证一人；
 *              错过的事件本轮沉默（玩家决策：不提示）
 *   Ruins      废墟（轮回之间的元界面）
 * 缺图时全部色块/占位 SVG 运行。
 * ============================================================ */

const game = document.getElementById("game");
const stageEl = document.getElementById("stage");
const rainEl = document.getElementById("rain");
const spiritEl = document.getElementById("spirit");
const spiritShape = document.getElementById("spirit-shape");
const hudEl = document.getElementById("hud");
const archiveEl = document.getElementById("archive");
const endveilEl = document.getElementById("endveil");
const toastEl = document.getElementById("toast");

const VIEW_W = 1280;
const VIEW_H = 720;
const PX = (p) => p / 100 * VIEW_W;
const PY = (p) => p / 100 * VIEW_H;
const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}
function gamePoint(event) {
  const rect = game.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * VIEW_W / rect.width, y: (event.clientY - rect.top) * VIEW_H / rect.height };
}

/* ============================================================
 * GameState
 * ============================================================ */
const GameState = {
  screen: "ruins",
  saved: { chenbo: false, linwan: false, shuche: false, laozhou: false },
  orbs: 0,
  energyCap: CONFIG.BASE_ENERGY,
  energy: CONFIG.BASE_ENERGY,
  cycleIv: { chenbo: new Set(), linwan: new Set() },  // 本轮每人已完成干预
  cycleClues: new Set(),
  foundClues: new Set(),
  archiveEntries: [],
  recalcCap() { this.energyCap = CONFIG.BASE_ENERGY + this.orbs * CONFIG.ENERGY_PER_ORB; },
  resetCycle() {
    this.recalcCap();
    this.energy = this.energyCap;
    this.cycleIv = { chenbo: new Set(), linwan: new Set() };
    this.cycleClues.clear();
  },
  addClue(charId, event, clue) {
    this.cycleClues.add(clue.id);
    const key = `clue:${charId}:${clue.id}`;
    if (this.foundClues.has(key)) return false;
    this.foundClues.add(key);
    this.archiveEntries.push({ when: `${event.time} ${event.name}`, name: clue.name, text: clue.text });
    Archive.render();
    return true;
  }
};

/* ============================================================
 * 素材加载
 * ============================================================ */
const ASSETS = {};
function preload(names) {
  return Promise.all(names.map((name) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { ASSETS[name] = img; resolve(); };
    img.onerror = () => { ASSETS[name] = null; resolve(); };
    img.src = "assets/" + name;
  })));
}

/* ============================================================
 * Spirit（微重力水滴）
 * ============================================================ */
const Spirit = {
  pointer: { x: 640, y: 360 },
  x: 640, y: 360,
  vx: 0, vy: 0,
  effort: 0,
  workTarget: null,
  update(t, dt) {
    const driftX = Math.sin(t * 0.0009) * 7 + Math.sin(t * 0.0023 + 2) * 3;
    const driftY = Math.cos(t * 0.0011) * 6 + Math.sin(t * 0.0019) * 3;
    const tx = this.workTarget ? this.workTarget.x : this.pointer.x + driftX;
    const ty = this.workTarget ? this.workTarget.y : this.pointer.y + driftY;
    const ax = (tx - this.x) * CONFIG.SPIRIT_STIFFNESS - this.vx * CONFIG.SPIRIT_DAMPING;
    const ay = (ty - this.y) * CONFIG.SPIRIT_STIFFNESS - this.vy * CONFIG.SPIRIT_DAMPING;
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const speed = Math.hypot(this.vx, this.vy);
    const stretch = Math.min(speed / 1400, 0.3);
    const moveAng = Math.atan2(this.vy, this.vx) * 180 / Math.PI;
    const w1 = Math.sin(t * 0.0021);
    const w2 = Math.sin(t * 0.0037 + 1.3);
    const w3 = Math.cos(t * 0.0017);
    const tilt = speed > 25 ? moveAng : Math.sin(t * 0.0013) * 6;
    spiritShape.style.transform = `rotate(${tilt}deg) scale(${1 + stretch + w1 * 0.05}, ${1 - stretch * 0.75 + w2 * 0.05})`;
    spiritShape.style.borderRadius =
      `${50 + w1 * 6}% ${50 - w1 * 6}% ${50 + w2 * 6}% ${50 - w2 * 6}% / ` +
      `${50 + w3 * 6}% ${50 - w3 * 6}% ${50 + w1 * 5}% ${50 - w1 * 5}%`;
    this.effort += ((this.workTarget ? 0.9 : 0) - this.effort) * (1 - Math.exp(-8 * dt));
    const tremble = Math.sin(t * 0.085) * this.effort * 1.7;
    spiritEl.style.transform = `translate(${this.x + tremble}px, ${this.y}px)`;
  }
};
window.addEventListener("pointermove", (e) => { Spirit.pointer = gamePoint(e); });

/* ============================================================
 * Interaction（弱力道具，多道具绑定）
 * ============================================================ */
const Interaction = {
  dragged: false,
  bound: [],
  active: null,
  pointerId: null,
  bindAll(list) { this.bound = list; },
  unbind() { this.releaseCapture(); this.bound = []; this.active = null; },
  releaseCapture() {
    const id = this.pointerId;
    this.pointerId = null;
    if (id !== null && game.hasPointerCapture(id)) game.releasePointerCapture(id);
  },
  anchorOf(b) {
    const c = b.cfg;
    /* 抓取点 = 道具节点视觉中心；(c.x, c.y) 是底部中心的渲染约定 */
    return { x: c.x, y: c.y - (c.sizeH || 0) / 2 };
  },
  distTo(b) {
    const p = this.anchorOf(b);
    return Math.hypot(Spirit.x - p.x, Spirit.y - p.y);
  },
  cancel() {
    if (this.pointerId === null || !this.active) return;
    this.active.desired = 0;
    this.active.state = this.active.completed ? "COMPLETED" : "CANCELLED";
    this.releaseCapture();
  },
  onDown(e) {
    if (ItemInfo.isOpen()) return;
    this.dragged = false;
    if (e.button !== 0 || this.pointerId !== null) return;
    if (e.target.closest("aside, #hud, .controller, .chain-panel, .item-overlay")) return;
    /* 点到道具本体即可抓取（灵体会被拉向它），或在作用半径内 */
    const hit = this.bound.find((b) => !b.completed &&
      b.node.contains(e.target));
    if (!hit) return;
    e.preventDefault();
    this.active = hit;
    this.pointerId = e.pointerId;
    hit.startX = gamePoint(e).x;
    hit.desired = 0;
    hit.progress = 0;
    hit.state = "PROBE";
    game.setPointerCapture(this.pointerId);
  },
  onMove(e) {
    if (this.pointerId === null || !this.active || e.pointerId !== this.pointerId) return;
    const a = this.active;
    if (Math.abs(gamePoint(e).x - a.startX) > 6) this.dragged = true;
    a.desired = Math.max(0, Math.min(a.cfg.threshold, gamePoint(e).x - a.startX));
  },
  onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    const active = this.active;
    const inspect = e.type === "pointerup" && !this.dragged;
    this.cancel();
    if (inspect && active) ItemInfo.open(active.cfg, Timeline.currentEvent, active.node);
  },
  update(t, dt) {
    for (const b of this.bound) {
      if (b.completed) continue;
      b.node.classList.toggle("near", this.active !== b && this.distTo(b) < b.cfg.radius);
    }
    if (!this.active) { Spirit.workTarget = null; return; }
    const a = this.active, c = a.cfg;
    const holding = this.pointerId !== null;
    const blend = 1 - Math.exp(-8 * dt);
    a.progress += (a.desired - a.progress) * blend;
    if (holding && !a.completed) {
      a.state = a.desired > 2 ? "DRAGGING" : "PROBE";
      if (a.desired >= c.threshold && a.progress >= c.threshold - 0.5) {
        a.completed = true;
        a.progress = a.desired = c.threshold;
        a.state = "COMPLETED";
        this.releaseCapture();
        if (c.onComplete) c.onComplete(c);
      }
    }
    const ratio = a.progress / c.threshold;
    const targetAngle = c.interactionType === "slide" ? 0 : a.completed ? 96 : ratio * 24;
    a.angle += (targetAngle - a.angle) * (1 - Math.exp(-(a.completed ? 9 : 12) * dt));
    a.shift += ((a.completed ? c.threshold : a.progress) * c.resistance - a.shift) * blend;
    Spirit.workTarget = holding ? this.anchorOf(a) : null;
    const wobble = holding ? Math.sin(t * 0.04) * (0.5 + ratio * 0.5) : 0;
    a.node.style.transform = `translate(-50%, -100%) translateX(${a.shift}px) rotate(${a.angle + wobble}deg)`;
    a.node.classList.toggle("working", holding);
    if (!holding && !a.completed && a.state !== "CANCELLED") a.state = this.distTo(a) < c.radius ? "NEAR" : "FLOAT";
    if (a.state === "CANCELLED" && a.progress < 0.1 && Math.abs(a.angle) < 0.1) {
      a.state = this.distTo(a) < c.radius ? "NEAR" : "FLOAT";
      a.node.style.transform = "translate(-50%, -100%)";
      this.active = null;
    }
  }
};

game.addEventListener("pointerdown", (e) => Interaction.onDown(e));
game.addEventListener("pointermove", (e) => Interaction.onMove(e));
game.addEventListener("pointerup", (e) => Interaction.onUp(e));
game.addEventListener("pointercancel", (e) => Interaction.onUp(e));
game.addEventListener("lostpointercapture", () => Interaction.cancel());
game.addEventListener("pointerleave", () => Interaction.cancel());
window.addEventListener("blur", () => Interaction.cancel());
document.addEventListener("visibilitychange", () => { if (document.hidden) Interaction.cancel(); });

/* ============================================================
 * 场景插画（内联 SVG，扁平可识别；正式素材 bg_*.png 到位后自动替换）
 * 全部填充取自色板变量，符合美术规范。
 * ============================================================ */
function sceneSVG(bg) {
  const key = bg.replace(/\.png$/i, "");
  if (ASSETS[key + ".png"]) return `<img class="scene-bg" src="assets/${key}.png" alt="" draggable="false">`;
  const open = `<svg class="scene-svg" viewBox="0 0 1280 720" preserveAspectRatio="none" aria-hidden="true">`;
  const close = `</svg>`;
  const rainLines = (xs, y, h) => xs.map((x) => `<rect x="${x}" y="${y}" width="2" height="${h}" fill="var(--rain)"/>`).join("");
  switch (key) {
    case "bg_bus_inside":
      return open +
        `<rect x="0" y="520" width="1280" height="200" fill="var(--shadow)"/>` +
        `<rect x="0" y="516" width="1280" height="4" fill="var(--rain)"/>` +
        `<rect x="560" y="300" width="160" height="420" fill="var(--bg)"/>` +
        `<rect x="0" y="0" width="1280" height="36" fill="var(--shadow)"/>` +
        `<rect x="90" y="90" width="240" height="150" rx="8" fill="var(--warm-light)"/>` +
        `<rect x="520" y="90" width="240" height="150" rx="8" fill="var(--warm-light)"/>` +
        `<rect x="950" y="90" width="240" height="150" rx="8" fill="var(--warm-light)"/>` +
        rainLines([140, 200, 260, 570, 630, 690, 1000, 1060, 1120], 100, 120) +
        `<rect x="600" y="36" width="3" height="86" fill="var(--rain)"/><circle cx="601" cy="132" r="11" fill="none" stroke="var(--rain)" stroke-width="3"/>` +
        `<rect x="760" y="36" width="3" height="86" fill="var(--rain)"/><circle cx="761" cy="132" r="11" fill="none" stroke="var(--rain)" stroke-width="3"/>` +
        `<rect x="70" y="360" width="190" height="120" rx="12" fill="var(--mid-blue)"/>` +
        `<rect x="70" y="452" width="230" height="68" rx="10" fill="var(--mid-blue)"/>` +
        `<rect x="1020" y="360" width="190" height="120" rx="12" fill="var(--mid-blue)"/>` +
        `<rect x="980" y="452" width="230" height="68" rx="10" fill="var(--mid-blue)"/>` +
        `<rect x="120" y="318" width="150" height="86" rx="10" fill="var(--mid-blue)" opacity="0.65"/>` +
        `<rect x="1010" y="318" width="150" height="86" rx="10" fill="var(--mid-blue)" opacity="0.65"/>` +
        close;
    case "bg_ward":
      return open +
        `<rect x="0" y="520" width="1280" height="200" fill="var(--shadow)"/>` +
        `<rect x="0" y="516" width="1280" height="4" fill="var(--rain)"/>` +
        `<rect x="880" y="90" width="230" height="170" rx="6" fill="var(--warm-light)"/>` +
        rainLines([920, 980, 1040], 100, 140) +
        `<rect x="150" y="300" width="26" height="220" rx="6" fill="var(--mid-blue)"/>` +
        `<rect x="176" y="400" width="330" height="72" rx="10" fill="var(--mid-blue)"/>` +
        `<rect x="190" y="368" width="84" height="36" rx="8" fill="var(--gray-line)"/>` +
        `<rect x="300" y="392" width="206" height="80" rx="10" fill="var(--mid-blue)" opacity="0.7"/>` +
        `<rect x="190" y="472" width="14" height="48" fill="var(--shadow)"/><rect x="480" y="472" width="14" height="48" fill="var(--shadow)"/>` +
        `<rect x="600" y="250" width="4" height="230" fill="var(--rain)"/><rect x="586" y="262" width="32" height="44" rx="6" fill="var(--warm-light)"/>` +
        `<rect x="560" y="430" width="80" height="90" rx="6" fill="var(--shadow)"/>` +
        `<rect x="572" y="410" width="44" height="20" rx="5" fill="var(--warm-light)"/>` +
        `<rect x="700" y="330" width="4" height="150" fill="var(--rain)" transform="rotate(9 702 405)"/>` +
        close;
    case "bg_hospital_door":
      return open +
        `<rect x="0" y="520" width="1280" height="200" fill="var(--shadow)"/>` +
        `<rect x="0" y="516" width="1280" height="4" fill="var(--rain)"/>` +
        `<rect x="520" y="140" width="200" height="380" fill="var(--warm-light)"/>` +
        `<rect x="520" y="140" width="56" height="380" rx="4" fill="var(--mid-blue)"/>` +
        `<polygon points="520,520 720,520 800,640 440,640" fill="var(--warm-light)" opacity="0.35"/>` +
        `<rect x="820" y="330" width="270" height="14" rx="4" fill="var(--mid-blue)"/>` +
        `<rect x="900" y="292" width="46" height="38" rx="6" fill="var(--mid-blue)"/>` +
        `<circle cx="905" cy="278" r="16" fill="var(--mid-blue)"/><circle cx="935" cy="272" r="14" fill="var(--mid-blue)"/>` +
        rainLines([120, 180, 240, 300, 360], 150, 300) +
        close;
    case "bg_station":
      return open +
        `<rect x="0" y="520" width="1280" height="200" fill="var(--shadow)"/>` +
        `<rect x="0" y="516" width="1280" height="4" fill="var(--rain)"/>` +
        `<rect x="120" y="120" width="640" height="26" rx="8" fill="var(--mid-blue)"/>` +
        `<rect x="140" y="146" width="10" height="374" fill="var(--mid-blue)"/>` +
        `<rect x="720" y="146" width="10" height="374" fill="var(--mid-blue)"/>` +
        `<rect x="240" y="380" width="300" height="12" rx="6" fill="var(--mid-blue)" opacity="0.8"/>` +
        `<rect x="240" y="430" width="300" height="18" rx="6" fill="var(--mid-blue)"/>` +
        `<rect x="260" y="448" width="12" height="72" fill="var(--shadow)"/><rect x="510" y="448" width="12" height="72" fill="var(--shadow)"/>` +
        `<rect x="756" y="120" width="8" height="400" fill="var(--mid-blue)"/><circle cx="760" cy="110" r="11" fill="var(--warm-light)"/>` +
        `<rect x="690" y="300" width="44" height="60" rx="4" fill="var(--mid-blue)"/><rect x="698" y="310" width="28" height="18" fill="var(--warm-light)"/>` +
        `<rect x="300" y="560" width="120" height="4" fill="var(--rain)"/><rect x="700" y="590" width="90" height="4" fill="var(--rain)"/>` +
        close;
    case "bg_nurse_station":
      return open +
        `<rect x="0" y="520" width="1280" height="200" fill="var(--shadow)"/>` +
        `<rect x="0" y="516" width="1280" height="4" fill="var(--rain)"/>` +
        `<rect x="480" y="40" width="320" height="12" rx="6" fill="var(--warm-light)"/>` +
        `<rect x="40" y="180" width="90" height="340" rx="4" fill="var(--mid-blue)"/><rect x="120" y="180" width="8" height="340" fill="var(--warm-light)" opacity="0.6"/>` +
        `<rect x="160" y="400" width="960" height="120" rx="8" fill="var(--mid-blue)"/>` +
        `<rect x="240" y="430" width="180" height="90" fill="var(--shadow)" opacity="0.6"/><rect x="700" y="430" width="180" height="90" fill="var(--shadow)" opacity="0.6"/>` +
        `<rect x="260" y="300" width="120" height="84" rx="6" fill="var(--mid-blue)"/><rect x="270" y="310" width="100" height="56" fill="var(--warm-light)"/>` +
        `<rect x="306" y="384" width="28" height="16" fill="var(--shadow)"/>` +
        `<rect x="700" y="376" width="120" height="14" rx="3" fill="var(--gray-line)"/><rect x="708" y="360" width="110" height="14" rx="3" fill="var(--gray-line)"/><rect x="716" y="344" width="100" height="14" rx="3" fill="var(--gray-line)"/>` +
        `<rect x="480" y="384" width="44" height="12" rx="4" fill="var(--mid-blue)"/><rect x="498" y="330" width="5" height="56" fill="var(--mid-blue)"/><path d="M470 330 L534 330 L520 306 L484 306 Z" fill="var(--mid-blue)"/><circle cx="502" cy="338" r="8" fill="var(--warm-light)"/>` +
        `<path d="M900 396 Q922 362 944 396 Z" fill="var(--gray-line)"/><rect x="894" y="396" width="56" height="8" rx="3" fill="var(--gray-line)"/>` +
        close;
    case "bg_street_rain":
    default:
      return open +
        `<rect x="0" y="470" width="1280" height="250" fill="var(--shadow)"/>` +
        `<rect x="0" y="466" width="1280" height="4" fill="var(--rain)"/>` +
        `<rect x="60" y="180" width="180" height="290" fill="var(--mid-blue)"/>` +
        `<rect x="90" y="210" width="30" height="24" fill="var(--warm-light)" opacity="0.7"/><rect x="150" y="260" width="30" height="24" fill="var(--warm-light)" opacity="0.5"/><rect x="90" y="330" width="30" height="24" fill="var(--warm-light)" opacity="0.6"/>` +
        `<rect x="280" y="120" width="150" height="350" fill="var(--mid-blue)"/>` +
        `<rect x="305" y="160" width="26" height="22" fill="var(--warm-light)" opacity="0.5"/><rect x="360" y="230" width="26" height="22" fill="var(--warm-light)" opacity="0.7"/>` +
        `<rect x="980" y="150" width="210" height="320" fill="var(--mid-blue)"/>` +
        `<rect x="1010" y="190" width="30" height="24" fill="var(--warm-light)" opacity="0.6"/><rect x="1090" y="280" width="30" height="24" fill="var(--warm-light)" opacity="0.5"/>` +
        `<rect x="430" y="150" width="8" height="320" fill="var(--mid-blue)"/><circle cx="434" cy="140" r="11" fill="var(--warm-light)"/>` +
        `<rect x="404" y="470" width="60" height="5" fill="var(--warm-light)" opacity="0.4"/>` +
        `<rect x="760" y="376" width="230" height="94" rx="16" fill="var(--mid-blue)"/>` +
        `<rect x="778" y="392" width="52" height="34" rx="4" fill="var(--warm-light)" opacity="0.85"/><rect x="846" y="392" width="52" height="34" rx="4" fill="var(--warm-light)" opacity="0.85"/><rect x="914" y="392" width="52" height="34" rx="4" fill="var(--warm-light)" opacity="0.85"/>` +
        `<circle cx="806" cy="470" r="16" fill="var(--shadow)"/><circle cx="944" cy="470" r="16" fill="var(--shadow)"/>` +
        `<circle cx="766" cy="440" r="7" fill="var(--warm-light)"/><circle cx="984" cy="440" r="7" fill="var(--warm-light)"/>` +
        `<rect x="200" y="560" width="90" height="6" fill="var(--rain)"/><rect x="420" y="600" width="90" height="6" fill="var(--rain)"/><rect x="640" y="570" width="90" height="6" fill="var(--rain)"/>` +
        rainLines([520, 560, 600, 660, 700], 60, 180) +
        close;
  }
}

function propSVG(prop) {
  switch (prop.id) {
    case "motor":
      return `<svg viewBox="0 0 100 65"><path class="p-body" d="M12 15H68V52H12Z"/><circle class="p-body" cx="73" cy="33" r="23"/><path class="p-line" d="M74 33H96M3 22H12M3 44H12"/></svg>`;
    case "toolbag":
      return `<svg viewBox="0 0 120 85"><path class="p-line" d="M40 25V10H80V25"/><path class="p-body" d="M15 25H105L115 80H5Z"/><path class="p-line" d="M15 38H105"/><path class="p-mid" d="M73 36H94V60H73Z"/></svg>`;
    case "ledger": case "handover":
      return `<svg viewBox="0 0 95 65"><path class="p-body" d="M5 8H90V60H5Z"/><path class="p-line" d="M15 18H77M15 30H70M15 42H53"/></svg>`;
    case "wrap":
      return `<svg viewBox="0 0 90 40"><path class="p-body" d="M4 9L66 3L86 29L25 38Z"/><path class="p-line" d="M24 10L41 28"/></svg>`;
    case "umbrella-stand": case "umbrella-sleeve":
      return `<svg viewBox="0 0 85 150"><path class="p-line" d="M20 76V9Q42 0 42 20V76M57 76V25Q78 17 78 36"/><path class="p-body" d="M8 76H78L70 146H16Z"/><path class="p-line" d="M25 91H60"/></svg>`;
    case "sprinkler":
      return `<svg viewBox="0 0 140 130"><path class="p-line" d="M35 54 C-9 34 -5 103 34 94"/><path class="p-body" d="M30 45 L88 45 L94 116 Q62 125 25 116 Z"/><path class="p-body" d="M86 73 L118 42 L129 49 L97 101 Z"/><path class="p-mid" d="M118 37 L136 48 L130 58 L113 47 Z"/><path class="p-line" d="M28 44 Q59 34 90 44"/></svg>`;
    case "light":
      return `<svg viewBox="0 0 110 60"><path class="p-body" d="M20 8 L90 8 L78 34 L32 34 Z"/><circle class="p-glow" cx="55" cy="44" r="10"/></svg>`;
    case "dispenser":
      return `<svg viewBox="0 0 100 160"><rect class="p-body" x="18" y="60" width="64" height="96" rx="6"/><path class="p-mid" d="M30 60 Q50 6 70 60 Z"/><rect class="p-mid" x="40" y="76" width="20" height="14" rx="3"/></svg>`;
    case "folder":
      return `<svg viewBox="0 0 120 90"><rect class="p-body" x="14" y="62" width="92" height="14" rx="3"/><rect class="p-body" x="20" y="46" width="86" height="14" rx="3"/><rect class="p-body" x="26" y="30" width="80" height="14" rx="3"/></svg>`;
    case "lamp":
      return `<svg viewBox="0 0 90 110"><path class="p-body" d="M18 34 L62 34 L52 8 L28 8 Z"/><circle class="p-glow" cx="40" cy="44" r="9"/><path class="p-line" d="M40 52 L40 92"/><rect class="p-mid" x="20" y="92" width="40" height="10" rx="4"/></svg>`;
    case "bell":
      return `<svg viewBox="0 0 70 50"><path class="p-body" d="M10 38 Q35 2 60 38 Z"/><rect class="p-mid" x="6" y="38" width="58" height="8" rx="3"/><circle class="p-mid" cx="35" cy="8" r="5"/></svg>`;
    default:
      return `<svg viewBox="0 0 60 60"><rect class="p-body" x="8" y="8" width="44" height="44" rx="6"/></svg>`;
  }
}
function makePropNode(prop) {
  const node = el("div", "prop prop-" + prop.id);
  node.dataset.item = prop.id;
  node.setAttribute("role", "button");
  node.tabIndex = 0;
  node.setAttribute("aria-label", "查看物品：" + prop.name);
  node.addEventListener("click", () => {
    if (!Interaction.dragged && !ItemInfo.isOpen()) ItemInfo.open(prop, Timeline.currentEvent, node);
  });
  node.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ItemInfo.open(prop, Timeline.currentEvent, node); }
  });
  node.style.left = PX(prop.x) + "px";
  node.style.top = PY(prop.y) + "px";
  node.style.width = prop.sizeW + "px";
  node.style.height = prop.sizeH + "px";
  node.style.transformOrigin = `${prop.pivotX}px ${prop.pivotY}px`;
  if (ASSETS[prop.img]) {
    const illustration = el("img", "prop-art");
    illustration.src = "assets/" + prop.img;
    illustration.alt = "";
    illustration.draggable = false;
    node.append(illustration);
  } else {
    node.innerHTML = propSVG(prop);
  }
  return node;
}
function applyDone(node, prop) {
  node.classList.add("done-" + prop.anim, "locked");
  node.classList.remove("working", "near");
  node.style.transform = prop.interactionType === "slide"
    ? `translate(-50%, -100%) translateX(${(prop.threshold || 100) * (prop.resistance || 0.12)}px)` : "";
}
// 素材透明留白各不相同，按可见轮廓缩放并以鞋底/坐姿底部落地。
const FIGURE_FRAMES = {
  bus_chenbo: [134, 39, 830, 1438], bus_shuche: [60, 18, 943, 1494],
  bus_laozhou: [108, 9, 899, 1507],
  bus_linwan: [331, 8, 468, 1505],
  char_chenbo: [293, 74, 439, 1400], char_linwan: [354, 53, 369, 1440],
  char_shuche: [302, 49, 397, 1452], char_laozhou: [339, 32, 360, 1476],
  cover_chenbo: [272, 82, 450, 1365], cover_linwan: [311, 61, 877, 953],
  cover_shuche: [271, 76, 509, 1391], cover_laozhou: [75, 61, 1399, 898]
};
function makeFigure(charId, cssVar, ghost = false, pose = null) {
  const figure = el("div", `figure ${charId}`);
  if (cssVar) figure.style.setProperty("--fig", `var(${cssVar})`);
  const key = pose && ASSETS[pose + ".png"] ? pose : (ghost && ASSETS[`cover_${charId}.png`] ? "cover_" : "char_") + charId;
  const asset = ASSETS[key + ".png"];
  if (asset) {
    const portrait = el("img", "figure-art");
    portrait.src = `assets/${key}.png`;
    portrait.alt = "";
    portrait.draggable = false;
    if (cssVar) {
    const [x, y, width, height] = FIGURE_FRAMES[key] || [0, 0, asset.naturalWidth, asset.naturalHeight];
      figure.style.setProperty("--sprite-ratio", width / height);
      portrait.style.width = `${asset.naturalWidth / width * 100}%`;
      portrait.style.height = `${asset.naturalHeight / height * 100}%`;
      portrait.style.left = `${-x / width * 100}%`;
      portrait.style.top = `${-y / height * 100}%`;
    }
    figure.classList.add("illustrated");
    if (key.startsWith("cover_")) figure.classList.add("cover-ghost");
    figure.append(portrait);
    return figure;
  }
  figure.append(el("div", "head"), el("div", "torso"), el("div", "leg l"), el("div", "leg r"));
  return figure;
}

/* ============================================================
 * Ruins：轮回之间的元界面
 * ============================================================ */
const FIGURE_FEET_Y = 620;
const Ruins = {
  figures: [],
  build() {
    GameState.screen = "ruins";
    BusFinale.reset();
    Interaction.unbind();
    stageEl.innerHTML = "";
    const nightCover = !!ASSETS["bg_cover_night.png"];
    rainEl.classList.toggle("hidden", nightCover);
    hudEl.classList.add("hidden");
    endveilEl.classList.add("hidden");

    const header = el("header");
    header.append(el("h1", null, "《最后一班巴士》"), el("p", null, "回到过去，改变本该发生的结局"));
    const tip = el("p", "screen-tip", "点击陈伯或林晚开始回溯：两条时间线同时流动，你只能见证其一");
    const meta = el("p", "screen-meta", `补充剂 ×${GameState.orbs} · 灵力上限 ${GameState.energyCap}`);

    if (nightCover) {
      stageEl.insertAdjacentHTML("beforeend", sceneSVG("bg_cover_night"));
    } else if (ASSETS["bg_ruins.png"]) {
      stageEl.insertAdjacentHTML("beforeend", sceneSVG("bg_ruins"));
    } else {
      stageEl.append(el("div", "ph-ground"));
    }
    const bus = el("div", "ph-bus");
    bus.append(el("div", "bus-win"), el("div", "bus-win"));
    if (!nightCover && !ASSETS["bg_ruins.png"]) stageEl.append(bus);
    stageEl.append(header, tip, meta);

    const layout = [
      { id: "chenbo", x: 14 },
      { id: "linwan", x: 30 },
      { id: "shuche", x: 45, status: "开发中" },
      { id: "laozhou", x: 59, status: "开发中" }
    ];
    this.figures = [];
    layout.forEach((item, i) => {
      const wrap = el("button", "figure-wrap");
      const coverX = { chenbo: 47, linwan: 32, shuche: 19, laozhou: 80 };
      const x = nightCover ? coverX[item.id] : item.x;
      wrap.style.left = PX(x) + "px";
      if (nightCover) wrap.classList.add("cover-choice", item.id);
      wrap.setAttribute("aria-label", CHARS[item.id].name);
      const restored = GameState.saved[item.id];
      const figure = makeFigure(item.id, null, nightCover && !restored);
      figure.style.animationDelay = `${-(i * 0.9)}s`;
      const status = restored ? "已获救 · 平安" : item.status || "可回溯";
      if (restored) wrap.classList.add("restored");
      wrap.append(figure, el("strong", "figure-name", CHARS[item.id].name), el("span", "figure-status", status));
      if (restored) {
        /* 同色光点（补充剂） + 剪影渐变复色 */
        const orb = el("span", "orb-light");
        orb.style.color = CHARS[item.id].color;
        wrap.append(orb);
        setTimeout(() => figure.style.setProperty("--fig", `var(${CHARS[item.id].cssVar})`), 500);
      }
      wrap.addEventListener("click", () => this.select(item.id));
      stageEl.append(wrap);
      this.figures.push({ id: item.id, figure, x: PX(x), y: nightCover ? 540 : FIGURE_FEET_Y });
    });
  },
  select(id) {
    if (id === "chenbo" || id === "linwan") { Timeline.startCycle(id); return; }
    toast(`${CHARS[id].name} · 开发中`, 1800);
  },
  updateNear() {
    for (const f of this.figures) {
      f.figure.classList.toggle("near", dist(Spirit.x, Spirit.y, f.x, f.y - 90) < CONFIG.INTERACT_RADIUS);
    }
  }
};

/* 日常幕：没有关键事件时，人物也在他“该在的地方”走动（世界是活的）。
 * 按时间段选场景与文案：陈伯 22:10 前在医院、之后在去车站的街上；
 * 林晚全程在医院里穿梭。获救者留在医院，不再赶那班车。 */
const DAILY = {
  chenbo: [
    { to: 150, bg: "bg_ward",          note: "他在病房等老伴安顿好，准备离院" },
    { to: 185, bg: "bg_street_rain",   note: "他抱着饭盒，在雨夜的街上慢慢走向车站" }
  ],
  linwan: [
    { to: 185, bg: "bg_nurse_station", note: "她等着交班，检查病历与待交的工具袋" }
  ]
};
const SAVED_DAILY = {
    chenbo: { bg: "bg_ward",          note: "他留下收拾伞具，已无法按时步行赶车；交件安排仍在继续" },
  linwan: { bg: "bg_nurse_station", note: "她留下整理病历，已无法按时步行赶车；工具袋托人代交" }
};
function dailyFor(charId, t) {
  const list = DAILY[charId] || [];
  return list.find((d) => t < d.to) || list[list.length - 1] ||
    { bg: "bg_street_rain", note: "……" };
}

/* ============================================================
 * Timeline：实时平行时间线（House 式轮回核心）
 * ============================================================ */
let pauseBtn = null;
let replayBtn = null;
const Timeline = {
  clock: 0,
  following: null,        // 当前见证的人物
  currentEvent: null,
  frozen: false,
  finished: false,
  crashPlayed: false,
  pauseCompleted: false,
  witnessed: new Set(),
  missed: new Set(),
  evaluated: new Set(),
  offBus: {},
  propNodes: [],
  roamEls: null,

  startCycle(charId = this.startChar || "chenbo") {
    ItemInfo.close();
    BusFinale.reset();
    GameState.screen = "cycle";
    GameState.resetCycle();
    this.startChar = charId;
    this.clock = 0;
    this.following = charId;
    this.currentEvent = null;
    this.frozen = false;
    this.finished = false;
    this.crashPlayed = false;
    this.pauseCompleted = false;
    this.ctrlOpen = false;
    this.viewMode = null;
    this.lifeBand = null;
    this.witnessed = new Set();
    this.missed = new Set();
    this.evaluated = new Set();
    this.offBus = {};
    rainEl.classList.add("hidden");
    endveilEl.classList.add("hidden");
    this.syncView();
    toast(`20:50 · 轮回开始：你附身于${CHARS[charId].name}（右键可切换时间线）`, 3000);
  },
  /* 回溯：保留灵力与干预，重走本轮（仍从起始人物开始） */
  restartKeep() {
    this.startCycle(this.startChar);
    toast("回溯：带着已知重来本轮", 2000);
  },

  eventFor(charId, t) {
    return TIMELINE.find((e) => e.char === charId && t >= e.from && t < e.to && !this.offBus[charId]) || null;
  },
  liveEvents(t) {
    return TIMELINE.filter((e) => t >= e.from && t < e.to && !this.offBus[e.char]);
  },

  /* ---------- 右键控制器：时间悬停，切换时间线 ---------- */
  toggleController() {
    if (ItemInfo.isOpen() || this.finished || this.viewMode === "ensemble") return;
    this.ctrlOpen = !this.ctrlOpen;
    if (this.ctrlOpen) this.buildController();
    else this.removeController();
  },
  removeController() {
    const old = document.getElementById("controller");
    if (old) old.remove();
  },
  buildController() {
    this.removeController();
    const panel = el("div", "controller");
    panel.id = "controller";
    panel.append(el("div", "ctrl-title", `时间悬停 · ${clockText(this.clock)}`));
    panel.append(el("div", "ctrl-tip", "选择此刻要见证的时间线"));
    for (const charId of ["chenbo", "linwan"]) {
      const e = this.eventFor(charId, this.clock);
      const btn = el("button", "ctrl-row" + (charId === this.following ? " current" : ""));
      const dot = el("span", "ctrl-dot");
      dot.style.background = CHARS[charId].color;
      const info = el("span", "ctrl-info");
      info.append(
        el("strong", null, CHARS[charId].name),
        el("em", null, this.offBus[charId] ? "本轮没有上车 · 可查看医院，结局尚未确定"
          : e ? `${e.time} ${e.name}${charId === this.following ? " · 正在见证" : " · 正在发生"}` : "日常 · 随时可切入")
      );
      btn.append(dot, info);
      btn.addEventListener("click", () => {
        if (charId === this.following) this.toggleController();
        else this.switchTo(charId);
      });
      panel.append(btn);
    }
    const free = el("button", "ctrl-row" + (this.following ? "" : " current"));
    const fdot = el("span", "ctrl-dot");
    fdot.style.background = "var(--spirit)";
    const finfo = el("span", "ctrl-info");
    finfo.append(el("strong", null, "自由灵体"), el("em", null, this.following ? "退出所有视角，俯瞰雨夜" : "当前状态"));
    free.append(fdot, finfo);
    free.addEventListener("click", () => this.goFree());
    panel.append(free);
    const close = el("button", "ctrl-close", "继续（时间恢复流动）");
    close.addEventListener("click", () => this.toggleController());
    panel.append(close);
    panel.addEventListener("pointerdown", (ev) => ev.stopPropagation());
    game.append(panel);
  },
  closeController() {
    const old = document.getElementById("controller");
    if (old) old.remove();
    this.ctrlOpen = false;
  },
  /* 切换到另一条时间线的“此时此刻”（无关键事件则进入他的日常） */
  switchTo(charId) {
    const e = this.eventFor(charId, this.clock);
    this.closeController();
    this.following = charId;
    this.currentEvent = e;
    this.pauseCompleted = false;
    this.frozen = false;
    Interaction.unbind();
    if (e) {
      this.witnessed.add(e.id);
      this.renderScene(e);
      this.buildHud(e);
      toast(`切入${CHARS[charId].name}的时间线 · ${e.name}`, 2000);
    } else {
      this.renderLife(charId);
      this.buildHud(null);
      toast(`切入${CHARS[charId].name}的日常`, 1800);
    }
  },
  /* 退出所有视角：自由灵体 */
  goFree() {
    this.closeController();
    this.following = null;
    this.currentEvent = null;
    this.frozen = false;
    this.pauseCompleted = false;
    Interaction.unbind();
    this.renderFree();
    this.buildHud(null);
    toast("你回到自由灵体状态", 1800);
  },

  /* ---------- 见证视图同步：有事件演事件，空窗演“赶路” ---------- */
  syncView() {
    if (this.clock >= 170) {
      if (this.viewMode !== "ensemble") BusFinale.enter();
      return;
    }
    if (!this.following) {
      if (this.viewMode !== "free") { this.renderFree(); this.buildHud(null); }
      else this.syncHud();
      return;
    }
    const e = this.eventFor(this.following, this.clock);
    if (e) {
      if (e !== this.currentEvent) {
        this.currentEvent = e;
        this.pauseCompleted = false;
        this.frozen = false;
        Interaction.unbind();
        this.witnessed.add(e.id);
        this.renderScene(e);
        this.buildHud(e);
      } else {
        this.syncHud();
      }
    } else {
      /* 日常幕：进入空窗、或日常时段（场景/文案）变化时换幕 */
      const saved = !!this.offBus[this.following];
      const d = saved ? SAVED_DAILY[this.following] : dailyFor(this.following, this.clock);
      if (this.currentEvent !== null || this.viewMode !== "life" || this.lifeBand !== d) {
        this.currentEvent = null;
        this.pauseCompleted = false;
        this.frozen = false;
        Interaction.unbind();
        this.renderLife(this.following);
        this.buildHud(null);
      } else {
        this.syncHud();
      }
    }
  },
  /* 日常生活幕：没有关键事件时，人物在他该在的地方走动（世界是活的） */
  renderLife(charId, note) {
    this.propNodes = [];
    stageEl.innerHTML = "";
    const saved = !!this.offBus[charId];
    const d = saved ? SAVED_DAILY[charId] : dailyFor(charId, this.clock);
    const sceneBox = el("div", "scene life");
    sceneBox.dataset.background = d.bg;
    sceneBox.insertAdjacentHTML("beforeend", sceneSVG(d.bg));
    const figure = makeFigure(charId, CHARS[charId].cssVar);
    figure.classList.add("alive");
    if (!saved) figure.classList.add("walking");
    figure.style.left = "30%";
    figure.style.top = d.bg === "bg_ward" ? "77%" : d.bg === "bg_street_rain" ? "78%" : "73%";
    sceneBox.append(figure);
    sceneBox.append(el("div", "scene-note", `${note || d.note}（右键可切换时间线）`));
    stageEl.append(sceneBox);
    this.viewMode = "life";
    this.viewFigure = figure;
    this.lifeBand = d;
    this.walkX = 30;
  },
  /* 自由灵体：不附身任何人，俯瞰雨夜城市 */
  renderFree() {
    this.propNodes = [];
    this.currentEvent = null;
    stageEl.innerHTML = "";
    const sceneBox = el("div", "scene free");
    sceneBox.insertAdjacentHTML("beforeend", sceneSVG("bg_street_rain"));
    sceneBox.append(el("div", "scene-note", "你是自由的光 · 右键进入任何人的视角"));
    stageEl.append(sceneBox);
    this.viewMode = "free";
    this.viewFigure = null;
  },

  renderScene(e) {
    this.propNodes = [];
    stageEl.innerHTML = "";
    const sceneBox = el("div", "scene");
    sceneBox.dataset.background = e.bg.replace(/\.png$/i, "");
    if (ASSETS[e.bg]) {
      const img = el("img", "scene-bg");
      img.src = "assets/" + e.bg;
      img.alt = "";
      sceneBox.append(img);
    } else {
      sceneBox.insertAdjacentHTML("beforeend", sceneSVG(e.bg));
    }
    const figure = makeFigure(e.char, CHARS[e.char].cssVar);
    figure.classList.add("alive");
    figure.style.left = PX(e.charX) + "px";
    figure.style.top = PY(e.charY) + "px";
    sceneBox.append(figure);
    this.viewMode = "event";
    this.viewFigure = figure;
    this.viewBaseX = e.charX;
    for (const clue of e.clues || []) {
      const key = `clue:${e.char}:${clue.id}`;
      const marker = el("button", "clue" + (GameState.foundClues.has(key) ? " found" : ""));
      marker.style.left = PX(clue.x) + "px";
      marker.style.top = PY(clue.y) + "px";
      marker.setAttribute("aria-label", `线索：${clue.name}`);
      marker.addEventListener("click", (ev) => { ev.stopPropagation(); this.clickClue(e, clue, marker); });
      sceneBox.append(marker);
    }
    for (const p of e.props || []) {
      const node = makePropNode(p);
      if (GameState.cycleIv[e.char].has(p.id)) applyDone(node, p);
      sceneBox.append(node);
      this.propNodes.push({ prop: p, node });
    }
    const notes = (e.props || []).filter(p => GameState.cycleIv[e.char].has(p.id)).map(p => p.note);
    if (notes.length) sceneBox.append(el("div", "scene-note", notes.join(" ")));
    if (e.props?.length) sceneBox.append(el("p", "item-scene-hint", "单击物品查看 · 暂停后按住向右拖动"));
    stageEl.append(sceneBox);
  },

  clickClue(event, clue, marker) {
    marker.classList.add("found");
    ItemInfo.open({ ...clue, note: clue.text, clue: true }, event, marker);
  },

  buildHud(e) {
    hudEl.innerHTML = "";
    const charId = this.following;
    const left = el("div", "hud-left");
    const dot = el("span", "hud-dot");
    dot.style.background = charId ? CHARS[charId].color : "var(--spirit)";
    left.append(dot,
      el("strong", null, charId ? CHARS[charId].name : "灵体"),
      el("span", "hud-scene", charId
        ? (e ? `${e.name} · 见证中` : "日常 · 右键切换时间线")
        : "自由漂浮 · 右键进入视角"));
    const right = el("div", "hud-right");
    const energy = el("div", "hud-energy");
    energy.id = "hud-energy";
    const time = el("span", "hud-time", "");
    time.id = "hud-time";
    pauseBtn = el("button", null, "暂停");
    pauseBtn.addEventListener("click", () => this.togglePause());
    replayBtn = el("button", "hidden", "重新播放");
    replayBtn.addEventListener("click", () => this.rewind());
    const archiveBtn = el("button", null, "命运档案");
    archiveBtn.addEventListener("click", () => Archive.toggle());
    right.append(energy, time, pauseBtn, replayBtn, archiveBtn);
    hudEl.append(left, right);
    hudEl.classList.remove("hidden");
    updateEnergy();
    this.syncHud();
  },
  syncHud() {
    const t = document.getElementById("hud-time");
    if (t) t.textContent = clockText(this.clock);
  },

  /* ---------- 暂停 / 干预 / 重播 ---------- */
  togglePause() {
    if (this.finished || this.ctrlOpen) return;
    const e = this.currentEvent;
    if (!e || !e.interactive) { toast("这里没有可以干预的物体", 2200); return; }
    const sceneBox = stageEl.querySelector(".scene");
    if (!this.frozen) {
      if (GameState.energy < CONFIG.PAUSE_COST) { toast("灵力不足，无法暂停", 2200); return; }
      GameState.energy -= CONFIG.PAUSE_COST;
      updateEnergy();
      this.frozen = true;
      this.pauseCompleted = false;
      sceneBox.classList.add("frozen");
      pauseBtn.textContent = "继续";
      this.showReplay(false);
      this.bindProps(e);
      toast(`时间暂停了 · 灵力 -${CONFIG.PAUSE_COST}`, 1800);
    } else {
      this.frozen = false;
      Interaction.unbind();
      sceneBox.classList.remove("frozen");
      pauseBtn.textContent = "暂停";
      this.showReplay(false);
      toast("时间恢复流动", 1400);
    }
  },
  bindProps(e) {
    const list = this.propNodes
      .filter((pn) => !pn.prop.inspectOnly && !GameState.cycleIv[e.char].has(pn.prop.id))
      .map((pn) => ({
        cfg: Object.assign({}, pn.prop, {
          x: PX(pn.prop.x), y: PY(pn.prop.y),
          radius: CONFIG.INTERACT_RADIUS,
          threshold: pn.prop.threshold || CONFIG.DRAG_THRESHOLD,
          resistance: pn.prop.resistance || CONFIG.DRAG_RESISTANCE,
          onComplete: () => this.onPropComplete(e, pn.prop)
        }),
        node: pn.node,
        state: "FLOAT", startX: 0, desired: 0, progress: 0, angle: 0, shift: 0, completed: false
      }));
    Interaction.bindAll(list);
  },
  onPropComplete(e, prop) {
    if (this.pauseCompleted || !this.frozen) return;
    GameState.cycleIv[e.char].add(prop.id);
    this.pauseCompleted = true;
    Interaction.unbind();
    const pn = this.propNodes.find((p) => p.prop.id === prop.id);
    if (pn) applyDone(pn.node, prop);
    this.propNodes.forEach((p) => p.node.classList.add("locked"));
    toast("已改变：" + prop.name, 2400);
    this.showReplay(true);
  },
  showReplay(show) { if (replayBtn) replayBtn.classList.toggle("hidden", !show); },
  /* 重新播放：时钟倒回本事件起点，保留干预与灵力 */
  rewind() {
    if (!this.currentEvent) return;
    this.clock = this.currentEvent.from;
    this.frozen = false;
    this.pauseCompleted = false;
    Interaction.unbind();
    this.renderScene(this.currentEvent);
    this.showReplay(false);
    if (pauseBtn) pauseBtn.textContent = "暂停";
    toast("重新播放这一刻", 1600);
  },

  /* ---------- 主推进 ---------- */
  tick(dt) {
    if (ItemInfo.isOpen() || this.finished || this.frozen || this.ctrlOpen) return;
    if (this.clock >= 170) { BusFinale.tick(dt); return; }
    Story.update();
    this.clock += dt * CYCLE.minPerSec;
    /* 错过的事件：沉默记账（不给提示，玩家决策） */
    for (const e of TIMELINE) {
      if (this.clock >= e.to && !this.witnessed.has(e.id) && !this.missed.has(e.id) && !this.offBus[e.char]) {
        this.missed.add(e.id);
      }
    }
    /* 可干预事件结束：判定获救 */
    for (const e of TIMELINE) {
      if (e.interactive && this.witnessed.has(e.id) && !this.evaluated.has(e.id) && this.clock >= e.to) {
        this.evaluated.add(e.id);
        const saved = CHAR_META[e.char].requires.some((r) => GameState.cycleIv[e.char].has(r));
        if (saved) {
          this.offBus[e.char] = true;
          toast(`${CHARS[e.char].name}没有上那班车。`, 3000);
        }
      }
    }
    this.syncView();
    /* 轮回结束 */
    if (this.clock >= CYCLE.endMin) { this.settle(); return; }
    /* 缓慢向右走，到边缘停下；获救后与车厢内保持原位。 */
    if (!this.frozen && !this.ctrlOpen && this.viewFigure) {
      if (this.viewMode === "life" && !this.offBus[this.following]) {
        this.walkX = Math.min(82, this.walkX + dt * 0.6);
        this.viewFigure.style.left = this.walkX + "%";
        this.viewFigure.classList.toggle("walking", this.walkX < 82);
      } else if (this.viewMode === "event" && this.currentEvent.bg !== "bg_bus_inside.png") {
        this.viewBaseX = Math.min(82, this.viewBaseX + dt * 0.25);
        this.viewFigure.style.left = this.viewBaseX + "%";
      }
    }
  },

  /* ---------- 结算 ---------- */
  settle() { Story.settle(); }
};

/* ============================================================
 * HUD 辅助 / Archive / 提示 / 雨 / 缩放 / 主循环 / 启动
 * ============================================================ */
function updateEnergy() {
  const box = document.getElementById("hud-energy");
  if (!box) return;
  box.innerHTML = "";
  for (let i = 0; i < GameState.energyCap; i++) {
    box.append(el("span", "orb" + (i < GameState.energy ? " full" : "")));
  }
  box.append(el("span", "cap", `${GameState.energy} / ${GameState.energyCap}`));
}

const Archive = {
  open: false,
  toggle() {
    this.open = !this.open;
    archiveEl.classList.toggle("open", this.open);
  },
  build() {
    archiveEl.innerHTML = "";
    const head = el("header");
    const close = el("button", "archive-close", "×");
    close.setAttribute("aria-label", "关闭命运档案");
    close.addEventListener("click", () => this.toggle());
    head.append(el("strong", null, "命运档案"), close);
    const body = el("div", "archive-body");
    const clueSection = el("section");
    const clueList = el("ul");
    clueList.id = "archive-clues";
    clueSection.append(el("h3", null, "已发现的线索"), clueList);
    const attemptSection = el("section");
    const attemptList = el("ul");
    attemptList.id = "archive-attempts";
    attemptList.append(el("li", "empty", "暂无"));
    attemptSection.append(el("h3", null, "尝试记录"), attemptList);
    const chainSection = el("section");
    const chainBtn = el("button", "archive-chain", "展开链条 ▸");
    chainBtn.addEventListener("click", () => ChainView.open());
    chainSection.append(el("h3", null, "事故链"), chainBtn);
    body.append(clueSection, attemptSection, chainSection);
    archiveEl.append(head, body);
  },
  render() {
    const list = document.getElementById("archive-clues");
    if (!list) return;
    list.innerHTML = "";
    if (!GameState.archiveEntries.length) {
      list.append(el("li", "empty", "尚未发现线索"));
      return;
    }
    for (const entry of GameState.archiveEntries) {
      const li = el("li");
      li.append(el("span", "when", entry.when), el("strong", null, entry.name), el("p", null, entry.text));
      list.append(li);
    }
  }
};

/* ============================================================
 * ChainView：事故链视图（v2 §8 / v3 §4.3）
 * 横向方块+直线箭头；林晚获救后：卡门/提速两环切断（删除线+变暗）、
 * ？？？以林晚色高亮、事故结果变“较轻擦撞：仍有人受伤”。
 * 可从结算画面与命运档案打开；初始态隐藏 ？？？ 节点。
 * ============================================================ */
const ChainView = {
  isOpen() { return !!document.getElementById("chainPanel"); },
  open() { Story.showChain(); },
  close() { document.getElementById("chainPanel")?.remove(); }
};

let toastTimer = 0;
function toast(text, ms = 2400) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

function buildRain() {
  rainEl.innerHTML = "";
  for (let i = 0; i < 16; i++) {
    const drop = el("i");
    drop.style.left = Math.random() * 100 + "%";
    drop.style.height = 90 + Math.random() * 60 + "px";
    drop.style.animationDelay = -(Math.random() * 1.6) + "s";
    drop.style.animationDuration = 1.2 + Math.random() * 0.8 + "s";
    rainEl.append(drop);
  }
}

function resize() {
  const scale = Math.min(1, window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  game.style.position = "fixed";
  game.style.left = "50%";
  game.style.top = "50%";
  game.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener("resize", resize);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (ChainView.isOpen()) ChainView.close();
    else if (Timeline.ctrlOpen) Timeline.toggleController();
    else if (Archive.open) Archive.toggle();
  }
});
/* 右键召唤控制器（ House 式随时换线） */
game.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (GameState.screen === "cycle" && !Timeline.finished && !ChainView.isOpen()) Timeline.toggleController();
});

let lastTime = 0;
function frame(t) {
  const dt = lastTime ? Math.min((t - lastTime) / 1000, 0.05) : 0;
  lastTime = t;
  Interaction.update(t, dt);
  Spirit.update(t, dt);
  if (GameState.screen === "cycle") Timeline.tick(dt);
  if (GameState.screen === "ruins") Ruins.updateNear();
  requestAnimationFrame(frame);
}

(function boot() {
  resize();
  buildRain();
  Archive.build();
  Archive.render();
  const names = new Set(["bg_ruins.png", "bg_cover_night.png"]);
  for (const e of TIMELINE) {
    names.add(e.bg);
    for (const p of e.props || []) if (p.img) names.add(p.img);
  }
  for (const c of Object.keys(CHARS)) {
    names.add("char_" + c + ".png");
    names.add("cover_" + c + ".png");
  }
  for (const c of Object.keys(CHARS)) names.add("bus_" + c + ".png");
  preload([...names]).then(() => {
    Ruins.build();
    requestAnimationFrame(frame);
  });
})();
