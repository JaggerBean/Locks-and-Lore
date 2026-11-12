import { TAU, clamp, Mechanism } from "./mechanism.mjs";

const point = (radius, angle) => ({ x: 260 + Math.cos(angle) * radius, y: 248 + Math.sin(angle) * radius });
export function workbenchMarkup() {
  return `<div class="ll-live-stats"><span>WARD <b data-live="ward"></b></span><span data-live="timer"></span><span>PICKS <b data-live="picks"></b></span></div>
    <div class="ll-canvas-wrap"><canvas width="1040" height="992" tabindex="0" aria-label="Rotating lock: aim the pick at the cutout with the mouse or arrow keys; hold Space to turn." data-lock-canvas></canvas><div class="ll-stage-label"><span data-live="direction"></span><b data-live="state">PRESSURE RELEASED</b></div></div>
    <div class="ll-stress"><div><span>PICK STRAIN</span><b data-live="strain">0%</b></div><div class="ll-meter"><span data-live="strain-bar"></span><i></i></div></div>
    <div class="ll-hazard-panel"><div class="ll-hazard spring" data-hazard="spring"><label>SPRING TENSION <b data-live="spring-load"></b></label><div class="ll-meter"><span data-live="spring-bar"></span></div></div></div>
    <div class="ll-live-controls"><button type="button" data-hold="left" aria-label="Move pick counterclockwise">↶</button><button type="button" data-hold="torque" class="ll-torque">Hold to turn <kbd>Space</kbd></button><button type="button" data-hold="right" aria-label="Move pick clockwise">↷</button></div>
    <p class="ll-live-tip">Guide the pick into the cutout. Hold pressure and follow its turn.<br>Release to cool the pick. Square detents mark banked progress.</p>
    <div class="ll-live-event" data-live="event" aria-live="polite"></div>`;
}

/** Frame-driven view. The canvas and buttons are never replaced during play. */
export class Workbench {
  constructor(root, lock, options = {}, callbacks = {}) {
    this.root = root;
    this.engine = new Mechanism(lock, options);
    this.callbacks = callbacks;
    this.preview = Boolean(options.preview);
    this.sound = options.sound !== false;
    this.inputs = new Set();
    this.abort = new AbortController();
    this.frame = null;
    this.lastTime = null;
    this.eventUntil = 0;
    this.soundedAt = 0;
    this.finished = false;
    this.destroyed = false;
    root.innerHTML = workbenchMarkup();
    this.canvas = root.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.nodes = Object.fromEntries([...root.querySelectorAll("[data-live]")].map(el => [el.dataset.live, el]));
    root.dataset.hazardCount = Number(this.engine.lock.trapped);
    root.querySelector("[data-hazard='spring']").hidden = !this.engine.lock.trapped;
    this._bind();
    this._draw();
    this.frame = requestAnimationFrame(time => this._frame(time));
  }
  _bind() {
    const opts = { signal: this.abort.signal };
    this.canvas.addEventListener("pointermove", event => this._pointer(event), opts);
    this.canvas.addEventListener("pointerenter", () => { if (!this.preview) this.canvas.focus({ preventScroll: true }); }, opts);
    this.canvas.addEventListener("pointerdown", event => {
      if (this.preview || event.button !== 0) return;
      this.canvas.focus({ preventScroll: true });
      this.canvas.setPointerCapture(event.pointerId);
      this._pointer(event);
      this._hold("pointer");
      this._audio();
      event.preventDefault();
    }, opts);
    this.canvas.addEventListener("pointerup", () => this._release("pointer"), opts);
    this.canvas.addEventListener("lostpointercapture", () => this._release("pointer"), opts);
    for (const button of this.root.querySelectorAll("[data-hold]")) {
      button.addEventListener("pointerdown", event => {
        if (this.preview || event.button !== 0) return;
        button.setPointerCapture(event.pointerId);
        this._hold(button.dataset.hold);
        this._audio();
        event.preventDefault();
      }, opts);
      for (const type of ["pointerup", "lostpointercapture"]) button.addEventListener(type, () => this._release(button.dataset.hold), opts);
    }
    this.canvas.addEventListener("pointerleave", () => { if (!this.inputs.has("pointer")) this._release("space"); }, opts);
    const isActive = () => !this.preview && (this.root.contains(document.activeElement) || this.root.closest(".app")?.classList.contains("ll-focused"));
    this.root.addEventListener("pointerdown", () => { document.querySelectorAll(".ll-focused").forEach(el => el.classList.remove("ll-focused")); this.root.closest(".app")?.classList.add("ll-focused"); }, opts);
    window.addEventListener("keydown", event => {
      if (!isActive() || event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      const action = ({ Space: "space", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" })[event.code];
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "space" && event.repeat) return;
      this._hold(action);
      this._audio();
    }, { ...opts, capture: true });
    window.addEventListener("keyup", event => {
      const action = ({ Space: "space", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right" })[event.code];
      if (action) this._release(action);
    }, opts);
    window.addEventListener("blur", () => this._clearInputs(), opts);
    document.addEventListener("visibilitychange", () => { this._clearInputs(); this.lastTime = null; }, opts);
    this.root.addEventListener("focusout", event => { if (event.relatedTarget && !this.root.contains(event.relatedTarget)) this._clearInputs(); }, opts);
  }
  _hold(action) {
    const pressure = ["space", "pointer", "torque"];
    if (pressure.includes(action) && !pressure.some(key => this.inputs.has(key))) {
      this.engine.engage();
    }
    this.inputs.add(action);
  }
  _release(action) {
    this.inputs.delete(action);
    if (!["space", "pointer", "torque"].some(key => this.inputs.has(key))) this.engine.pressure = false;
  }
  _clearInputs() {
    this.inputs.clear();
    this.engine.pressure = false;
  }
  _pointer(event) {
    if (!this.preview && document.activeElement !== this.canvas) this.canvas.focus({ preventScroll: true });
    const bounds = this.canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * 520 / bounds.width - 260;
    const y = (event.clientY - bounds.top) * 496 / bounds.height - 248;
    if (Math.hypot(x, y) > 35) this.engine.aim(Math.atan2(y, x));
  }
  _frame(time) {
    if (this.destroyed) return;
    if (!this.root.isConnected) { this.destroy(); return; }
    const dt = this.lastTime === null ? 0 : Math.min(.05, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (!document.hidden) {
      if (this.preview) this.engine.preview(dt);
      else {
        if (this.inputs.has("left")) this.engine.aim(this.engine.pickAngle - dt * 1.45);
        if (this.inputs.has("right")) this.engine.aim(this.engine.pickAngle + dt * 1.45);
        this.engine.update(dt, this.inputs.has("space") || this.inputs.has("pointer") || this.inputs.has("torque"));
        const event = this.engine.event;
        if (event) {
          if (["latch", "break"].includes(event.type)) this._clearInputs();
          this.nodes.event.textContent = event.text;
          this.eventUntil = time + 2600;
          this._tone(event.type);
        }
        if (time > this.eventUntil) this.nodes.event.textContent = "";
        if (["binding", "spring"].includes(this.engine.contact) && time - this.soundedAt > 135) { this._tone("scrape"); this.soundedAt = time; }
      }
      this._draw();
      if (this.engine.status !== "playing" && !this.finished) {
        this.finished = true;
        this._clearInputs();
        this._tone(this.engine.status);
        this.callbacks.finish?.(this.engine);
      }
    }
    if (!this.destroyed) this.frame = requestAnimationFrame(next => this._frame(next));
  }
  _audio() {
    if (!this.sound || this.preview) return;
    try { this.audio ??= new (window.AudioContext || window.webkitAudioContext)(); if (this.audio.state === "suspended") this.audio.resume().catch(() => {}); } catch { /* Visual feedback remains complete without audio. */ }
  }
  _tone(type) {
    if (!this.audio || !this.sound || this.audio.state !== "running") return;
    try {
      const o = this.audio.createOscillator(), g = this.audio.createGain(), now = this.audio.currentTime;
      const freqs = { detent: 900, latch: 1400, success: 680, scrape: 110, break: 70, failed: 80, shift: 420, strike: 150, trap: 60, ward: 1300 };
      o.type = ["scrape", "break"].includes(type) ? "sawtooth" : "triangle";
      o.frequency.setValueAtTime(freqs[type] || 220, now);
      o.frequency.exponentialRampToValueAtTime((freqs[type] || 220) * .45, now + .09);
      g.gain.setValueAtTime(type === "scrape" ? .009 : .05, now);
      g.gain.exponentialRampToValueAtTime(.0001, now + .11);
      o.connect(g); g.connect(this.audio.destination); o.start(now); o.stop(now + .12);
    } catch { /* Sound device interruptions do not interrupt the game. */ }
  }
  _draw() {
    const ctx = this.ctx, e = this.engine;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, 520, 496);
    const vignette = ctx.createRadialGradient(260, 235, 20, 260, 248, 290);
    vignette.addColorStop(0, "#332b21"); vignette.addColorStop(1, "#0c100f");
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, 520, 496);
    // A machined backing plate, bolts, tool marks and engraved radial ticks.
    ctx.save(); ctx.translate(260, 248);
    ctx.fillStyle = "#262a27"; ctx.strokeStyle = "#7e7357"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 230, 0, TAU); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 64; i++) {
      const a = i * TAU / 64;
      ctx.strokeStyle = i % 4 === 0 ? "#a48e60" : "#4d4e40";
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 219, Math.sin(a) * 219); ctx.lineTo(Math.cos(a) * (i % 4 === 0 ? 210 : 215), Math.sin(a) * (i % 4 === 0 ? 210 : 215)); ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a) * 227, y = Math.sin(a) * 227;
      ctx.fillStyle = "#ac9460"; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#423d2e"; ctx.beginPath(); ctx.moveTo(x - 3, y - 2); ctx.lineTo(x + 3, y + 2); ctx.stroke();
    }
    ctx.restore();
    const radii = e.rings.map((_, i) => 193 - i * (129 / Math.max(2, e.rings.length - 1)));
    for (let i = e.rings.length - 1; i >= 0; i--) {
      const ring = e.rings[i], r = radii[i], active = i === e.active;
      const gap = active ? e.aperture : e.aperture * .75;
      const metal = ctx.createLinearGradient(0, 248 - r, 0, 248 + r);
      if (ring.latched) { metal.addColorStop(0, "#98b99d"); metal.addColorStop(.5, "#416857"); metal.addColorStop(1, "#203f35"); }
      else if (active) { metal.addColorStop(0, "#f0d79b"); metal.addColorStop(.45, "#a58a50"); metal.addColorStop(1, "#665334"); }
      else { metal.addColorStop(0, "#786b4e"); metal.addColorStop(1, "#36342a"); }
      ctx.globalAlpha = i > e.active ? .44 : 1;
      ctx.lineWidth = active ? 16 : 12;
      ctx.strokeStyle = metal;
      ctx.beginPath(); ctx.arc(260, 248, r, ring.angle + gap, ring.angle + TAU - gap); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = active ? "#f8eac1" : "#7d7459";
      ctx.beginPath(); ctx.arc(260, 248, r + (active ? 8 : 6), ring.angle + gap, ring.angle + TAU - gap); ctx.stroke();
      if (active) {
        // The slot is a physical opening with bright machined lips, always visible.
        for (const a of [ring.angle - gap, ring.angle + gap]) {
          const p1 = point(r - 11, a), p2 = point(r + 11, a);
          ctx.strokeStyle = "#fff0ba"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        }
        const target = point(r, ring.angle);
        if (e.shiftingSoon) {
          ctx.strokeStyle = "#ffc98c"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(260, 248, r + 11, ring.angle - gap * 2.3, ring.angle + gap * 2.3); ctx.stroke();
        }
        ctx.save(); ctx.translate(target.x, target.y); ctx.rotate(ring.angle);
        ctx.strokeStyle = "#ffe6a5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -6 * ring.direction); ctx.lineTo(0, 6 * ring.direction); ctx.lineTo(4, 2 * ring.direction); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = "#78c9a6"; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(260, 248, r - 13, -Math.PI / 2, -Math.PI / 2 + Math.max(.001, ring.progress) * TAU); ctx.stroke();
        for (let i = 1; i < e.lock.detentCount; i++) {
          const t = i / e.lock.detentCount;
          const p = point(r - 13, -Math.PI / 2 + t * TAU);
          ctx.fillStyle = ring.checkpoint >= t ? "#d8f9d8" : "#435548"; ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        }
        for (const [index, hazard] of e.hazards.entries()) {
          const rail = r + 16 + index * 12;
          ctx.save();
          ctx.strokeStyle = "#ec816c";
          ctx.lineWidth = hazard.active ? 6 : 3;
          ctx.globalAlpha = hazard.active ? 1 : hazard.charging ? .85 : .65;
          ctx.beginPath(); ctx.arc(260, 248, rail, hazard.angle - hazard.halfWidth, hazard.angle + hazard.halfWidth); ctx.stroke();
          ctx.setLineDash([]); ctx.shadowBlur = 0;
          if (hazard.type === "spring") {
            for (let angle = hazard.angle - hazard.halfWidth; angle < hazard.angle + hazard.halfWidth; angle += .055) {
              const a = point(rail - 4, angle), b = point(rail + 5, angle + .023);
              ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
          }
          const mark = point(rail + 12, hazard.angle);
          ctx.fillStyle = ctx.strokeStyle; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("!", mark.x, mark.y + 4);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }
    // Signed core motion remains continuous when a ward reverses.
    const r = e.ring, turn = r ? r.turn : 1.8;
    ctx.save(); ctx.translate(260, 248); ctx.rotate(turn);
    ctx.fillStyle = "#121b19"; ctx.strokeStyle = "#c2a970"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 43, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#b39a63"; ctx.fillRect(-22, -5, 44, 10);
    ctx.fillStyle = "#070e0c"; ctx.fillRect(-16, -2, 32, 4); ctx.restore();
    if (e.status === "success") {
      ctx.fillStyle = "#a2d8ad"; ctx.font = "bold 18px Georgia"; ctx.textAlign = "center"; ctx.fillText("UNLOCKED", 260, 462);
    } else {
      const radius = radii[e.active] || 64;
      const tip = point(radius, e.tipAngle), near = point(37, e.tipAngle * .25 + e.pickAngle * .75);
      const handle = point(247, e.pickAngle);
      if (e.stress > 20) {
        const aim = point(radius, e.pickAngle);
        ctx.strokeStyle = "#b0b7a64d"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(aim.x, aim.y, 5, 0, TAU); ctx.stroke();
      }
      ctx.strokeStyle = e.stress > 65 ? "#f29a83" : "#e0e4dd"; ctx.lineWidth = 3;
      ctx.shadowColor = "#000"; ctx.shadowBlur = 5;
      const bend = Math.sin(e.elapsed * 15 * e.profile.wobbleRate + e.wobblePhase) * e.stress * .23 * e.profile.wobbleStrength;
      ctx.beginPath(); ctx.moveTo(handle.x, handle.y);
      ctx.quadraticCurveTo((handle.x + tip.x) * .5 + Math.cos(e.pickAngle + Math.PI / 2) * bend, (handle.y + tip.y) * .5 + Math.sin(e.pickAngle + Math.PI / 2) * bend, tip.x, tip.y);
      ctx.quadraticCurveTo((near.x + tip.x) * .5 - Math.cos(e.pickAngle + Math.PI / 2) * bend, (near.y + tip.y) * .5 - Math.sin(e.pickAngle + Math.PI / 2) * bend, near.x, near.y); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 9; ctx.strokeStyle = "#65513c"; const h = point(220, e.pickAngle);
      ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(handle.x, handle.y); ctx.stroke();
      ctx.fillStyle = ["turning", "edge"].includes(e.contact) ? "#d6eee5" : e.pressure ? "#ff997e" : "#f4ede0";
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 5, 0, TAU); ctx.fill();
      if (e.sparks > 0) {
        ctx.strokeStyle = "#ffc994"; ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) { const a = this.lastTime * .02 + i * TAU / 6; ctx.beginPath(); ctx.moveTo(tip.x + Math.cos(a) * 8, tip.y + Math.sin(a) * 8); ctx.lineTo(tip.x + Math.cos(a) * 16, tip.y + Math.sin(a) * 16); ctx.stroke(); }
      }
    }
    this.nodes.ward.textContent = `${Math.min(e.active + 1, e.rings.length)} / ${e.rings.length}`;
    this.nodes.picks.textContent = String(e.picks);
    this.nodes.timer.textContent = e.timeLeft === null ? "TAKE YOUR TIME" : `${Math.ceil(e.timeLeft)}s REMAINING`;
    this.nodes.direction.textContent = r ? (e.shiftingSoon ? "⇄ REVERSING" : r.velocity > 0 ? "↻ CLOCKWISE" : "↺ COUNTERCLOCKWISE") : "BOLT RELEASED";
    this.nodes.direction.dataset.warning = String(e.shiftingSoon);
    this.nodes.state.textContent = ({ released: "PRESSURE RELEASED", turning: "CORE TURNING", edge: "EDGE CONTACT", binding: "PICK BINDING", spring: "SPRING LOADING" })[e.contact];
    this.nodes.state.dataset.contact = e.contact;
    this.nodes.strain.textContent = `${Math.round(e.stress)}%`;
    this.nodes["strain-bar"].style.width = `${clamp(e.stress, 0, 100)}%`;
    this.nodes["strain-bar"].style.background = e.stress > 65 ? "#e98469" : "#d6b06c";
    this.root.querySelector(".ll-torque").classList.toggle("pressed", e.pressure);
    this.nodes["spring-load"].textContent = `${Math.round(e.springLoad)}%`;
    this.nodes["spring-bar"].style.width = `${e.springLoad}%`;
    const tips = [];
    if (e.lock.trapped) tips.push("Red spring: release pressure before tension trips the trap.");
    if (tips.length) this.root.querySelector(".ll-live-tip").textContent = tips.join(" ");
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this._clearInputs();
    this.audio?.close().catch(() => {});
  }
}

export function resultMarkup(engine, practice = false) {
  const won = engine.status === "success";
  const trap = !won && engine.lock.trapped;
  return `<div class="ll-result ${won ? "won" : "lost"}"><span>${won ? "✦" : "⚒"}</span><h2>${won ? "The bolt slides free." : "The mechanism holds."}</h2><p>${won ? "Every ward is caught. The lock turns open." : trap ? "The linked spring releases. The GM resolves the configured trap." : engine.picks <= 0 ? "Your last pick snaps. The bolt stays shut." : "The clock ran out before the final ward caught."}</p><div class="ll-result-stats"><b>${engine.active}/${engine.rings.length} wards</b><b>${engine.mistakes} broken picks</b><b>${Math.round(engine.elapsed)}s</b></div>${practice ? "<small>Practice run · no chat result</small>" : ""}</div>`;
}
