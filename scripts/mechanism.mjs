/** Pure simulation shared by Foundry, the playable workshop, and regression checks. */
import { TUNING_FIELDS } from "./settings.mjs";
import { CHECK_CHOICES } from "./checks.mjs";
export const TAU = Math.PI * 2;
export const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
export const angleDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const DIFFICULTIES = {
  Easy: { speed: .47, travel: 1.15, damage: 60, impact: 12, picks: 4 },
  Moderate: { speed: .64, travel: 1.55, damage: 85, impact: 16, picks: 3 },
  Hard: { speed: .83, travel: 1.85, damage: 105, impact: 18, picks: 3 },
  "Very Hard": { speed: .99, travel: 2.05, damage: 125, impact: 20, picks: 2 },
  Extreme: { speed: 1.15, travel: 2.25, damage: 145, impact: 22, picks: 2 }
};
export const difficultyNames = Object.keys(DIFFICULTIES);
export function tuningDefault(difficulty) { return Math.max(0, difficultyNames.indexOf(difficulty)) * 25; }
export function tuningLabel(value) { return ["Easy", "Moderate", "Hard", "Very hard", "Expert"][Math.round(clamp(Number(value) || 0, 0, 100) / 25)]; }
export const DEFAULT_LOCK = {
  name: "The Captain's Lock", description: "",
  symbol: "⚓", difficulty: "Moderate", pins: 5, archetype: "standard", trapped: false,
  canRetry: true, noise: "Moderate", environment: "none", toolQuality: "ordinary",
  checkEnabled: true, checkType: "skill:slt", proficiencyOverride: "auto", rewardStyle: "physical"
};
export function presetValues(difficulty) {
  const d = DIFFICULTIES[difficulty] ?? DIFFICULTIES.Moderate, rank = tuningDefault(difficulty);
  return { lockSize: rank, shiftingRate: rank, rotationSpeed: d.speed, turnLength: d.travel,
    pickCount: d.picks, strainRate: d.damage, clickStrain: d.impact, paceVariation: 16 + rank * .4,
    reversalWarning: Math.round((.32 - rank * .0009) * 1000) / 1000, detentCount: 3, progressLoss: .07, edgeStrain: 24,
    recoveryRate: 18, centerRecovery: 2, wobbleStrength: 1, wobbleRate: 1, springSpeed: 1,
    springSize: 50, springGrowthRate: 1, springLoadRate: 75, springReleaseRate: 34, springStrain: 40,
    checkDC: 12 + rank / 25 * 3, rewardOpening: 40, rewardStrain: 25, criticalOpening: 75, criticalStrain: 40 };
}
export function normalizeLock(input = {}) {
  const lock = { ...DEFAULT_LOCK, ...input };
  if (lock.difficulty === "Expert") lock.difficulty = "Extreme";
  lock.difficulty = DIFFICULTIES[lock.difficulty] ? lock.difficulty : "Moderate";
  const defaults = presetValues(lock.difficulty);
  for (const { key, min, max, step } of TUNING_FIELDS) {
    const value = input[key];
    lock[key] = value === undefined || value === null || value === "" || !Number.isFinite(Number(value))
      ? defaults[key] : clamp(Number(value), min, max);
    if (step === 1) lock[key] = Math.round(lock[key]);
  }
  if (!["standard", "heavy", "trapped"].includes(lock.archetype)) lock.archetype = "standard";
  if (!["none", "rusted", "underwater", "storm", "damaged"].includes(lock.environment)) lock.environment = "none";
  if (!["auto", "proficient", "not"].includes(lock.proficiencyOverride)) lock.proficiencyOverride = "auto";
  if (!["physical", "progress"].includes(lock.rewardStyle)) lock.rewardStyle = "physical";
  if (!CHECK_CHOICES.some(choice=>choice.value===lock.checkType)) lock.checkType = "skill:slt";
  lock.checkEnabled = lock.checkEnabled !== false && lock.checkEnabled !== "false";
  lock.pins = Math.round(clamp(Number(lock.pins) || 5, 3, 8));
  lock.timeLimit = input.timeLimit === undefined ? (lock.environment === "underwater" ? 45 : 0) : clamp(Number(input.timeLimit) || 0, 0, 600);
  lock.trapped = (lock.trapped === true || lock.trapped === "true") || lock.archetype === "trapped";
  delete lock.magicWard;
  return lock;
}
export function makeProfile(lock, { skill = 0 } = {}) {
  const p = { speed: lock.rotationSpeed, travel: lock.turnLength, damage: lock.strainRate,
    impact: lock.clickStrain, picks: lock.pickCount, edgeStrain: lock.edgeStrain, recovery: lock.recoveryRate,
    centerRecovery: lock.centerRecovery, wobbleStrength: lock.wobbleStrength, wobbleRate: lock.wobbleRate };
  const size = lock.lockSize / 100, shift = lock.shiftingRate / 100;
  p.aperture = .26 + (.085 - .26) * size;
  p.shiftInterval = 5.8 + (.85 - 5.8) * shift;
  p.shiftWarning = lock.reversalWarning;
  p.paceSpread = lock.paceVariation / 100;
  const bonus = lock.checkEnabled ? clamp(skill, 0, 2) : 0;
  const physical = lock.rewardStyle === "physical" && bonus > 0;
  p.strainMultiplier = physical ? 1 - (bonus === 2 ? lock.criticalStrain : lock.rewardStrain) / 100 : 1;
  if (lock.toolQuality === "fine") { p.aperture += .022; p.damage *= .85; }
  if (lock.toolQuality === "improvised") p.aperture *= .85;
  if (lock.environment === "rusted") { p.speed *= .8; p.damage *= 1.2; }
  if (lock.environment === "damaged") p.aperture *= .87;
  if (lock.archetype === "heavy") { p.travel *= 1.18; p.speed *= .88; }
  if (physical) p.aperture *= 1 + (bonus === 2 ? lock.criticalOpening : lock.rewardOpening) / 100;
  p.damage *= p.strainMultiplier; p.impact *= p.strainMultiplier; p.edgeStrain *= p.strainMultiplier;
  p.timeLimit = lock.timeLimit;
  return p;
}

export class Mechanism {
  constructor(input = {}, options = {}, random = Math.random) {
    this.lock = normalizeLock(input);
    this.profile = makeProfile(this.lock, options);
    this.random = random;
    this.rings = Array.from({ length: this.lock.pins }, (_, i) => ({
      angle: random() * TAU, direction: i % 2 ? -1 : 1,
      phase: random() * TAU, progress: 0, checkpoint: 0, latched: false,
      pace: 1, velocity: this.profile.speed * (i % 2 ? -1 : 1), turn: 0,
      shiftIn: this._shiftDelay()
    }));
    this.active = 0;
    this.pickAngle = -Math.PI / 2;
    this.stress = 0;
    this.picks = this.profile.picks;
    this.elapsed = 0;
    this.mistakes = 0;
    this.status = "playing";
    this.contact = "released";
    this.transition = 0;
    this.event = null;
    this.inputEvent = null;
    this.bestRun = 0;
    this.sparks = 0;
    this.timeLeft = this.profile.timeLimit || null;
    this.pressure = false;
    this.shiftCount = 0;
    this.springLoad = 0;
    this.trapTriggered = false;
    this.hazardPhase = random() * TAU;
    this.wobblePhase = random() * TAU;
    if (this.lock.checkEnabled && this.lock.rewardStyle === "progress" && options.skill > 0) {
      if (options.skill >= 2) { this.rings[0].latched = true; this.rings[0].progress = 1; this.active = 1; }
      else { this.rings[0].progress = 1 / 3; this.rings[0].checkpoint = 1 / 3; }
    }
  }
  get ring() { return this.rings[this.active]; }
  get aperture() { return this.profile.aperture; }
  get wobbleOffset() {
    if (!this.profile.wobbleStrength) return 0;
    const amplitude = .27 * this.profile.wobbleStrength * Math.pow(this.stress / 100, 1.6);
    const t = this.elapsed * this.profile.wobbleRate;
    return amplitude * (.76 * Math.sin(t * 15 + this.wobblePhase) + .24 * Math.sin(t * 27 + this.wobblePhase));
  }
  get tipAngle() { return this.pickAngle + this.wobbleOffset; }
  get shiftingSoon() { return Boolean(this.ring && this.ring.shiftIn < this.profile.shiftWarning); }
  get hazards() {
    if (!this.ring) return [];
    const phase = this.hazardPhase, t = this.elapsed;
    const hazards = [];
    if (this.lock.trapped) hazards.push({
      type: "spring", angle: phase + t * this.lock.springSpeed * .3 + .5 * Math.sin(t * this.lock.springSpeed * .6 + phase),
      halfWidth: (.5 + this.lock.springSize / 100) * (.13 + .16 * (.5 + .5 * Math.sin(t * this.lock.springGrowthRate * 1.15 + phase))), active: true, charging: false
    });
    return hazards;
  }
  get danger() { return this.hazards.some(h => h.active && angleDistance(this.tipAngle, h.angle) < h.halfWidth); }
  _shiftDelay() { return this.profile.shiftInterval * (.8 + this.random() * .4); }
  _motion(dt) {
    const ring = this.ring;
    ring.shiftIn -= dt;
    if (ring.shiftIn <= 0) {
      ring.direction *= -1;
      ring.pace = 1 + (this.random() * 2 - 1) * this.profile.paceSpread;
      ring.shiftIn += this._shiftDelay();
      this.shiftCount++;
      this._emit("shift", "The ward reverses and changes pace.");
    }
    const rhythm = .88 + Math.sin(this.elapsed * 1.7 + ring.phase) * .18;
    const storm = this.lock.environment === "storm" ? 1 + .24 * Math.sin(this.elapsed * .95) : 1;
    const target = ring.direction * this.profile.speed * ring.pace * rhythm * storm;
    ring.velocity += (target - ring.velocity) * (1 - Math.exp(-dt * 11));
    return ring.velocity;
  }
  preview(delta) {
    const dt = clamp(delta, 0, .05);
    this.elapsed += dt;
    this.rings.forEach((ring, i) => {
      if (i === this.active) ring.angle += this._motion(dt) * dt * .42;
      else ring.angle += ring.direction * dt * .09;
    });
  }
  aim(angle) { if (Number.isFinite(angle)) this.pickAngle = angle; }
  engage() {
    if (this.status !== "playing" || this.transition > 0 || this.pressure) return false;
    this.pressure = true;
    const struck = this._impact();
    if (struck) this.inputEvent = this.event;
    return struck;
  }
  _impact() {
    if (angleDistance(this.tipAngle, this.ring.angle) < this.aperture) return false;
    this.stress = Math.min(100, this.stress + this.profile.impact);
    this.sparks = 1;
    this._emit("strike", "The pick strikes solid metal.");
    if (this.stress >= 100) this._breakPick();
    return true;
  }
  _emit(type, text) { this.event = { type, text }; }
  update(delta, pressure = false) {
    if (this.status !== "playing") return;
    // Bounded substeps keep collision and strain equivalent across frame rates.
    let remaining = clamp(delta, 0, .25);
    this.event = this.inputEvent;
    this.inputEvent = null;
    while (remaining > 1e-8 && this.status === "playing") {
      const dt = Math.min(remaining, 1 / 120);
      this._step(dt, pressure);
      remaining -= dt;
    }
  }
  _step(dt, pressure) {
    this.elapsed += dt;
    const pressing = pressure && !this.pressure;
    this.pressure = pressure;
    this.sparks = Math.max(0, this.sparks - dt * 3);
    if (this.profile.timeLimit) {
      this.timeLeft = Math.max(0, this.profile.timeLimit - this.elapsed);
      if (!this.timeLeft) { this.status = "failed"; this._emit("timeout", "The air runs out, or the deadline arrives."); return; }
    }
    if (this.transition > 0) {
      this.transition -= dt;
      this.stress = Math.max(0, this.stress - dt * 35);
      this.contact = "released";
      return;
    }
    const ring = this.ring;
    if (!ring) return;
    const velocity = this._motion(dt);
    const speed = Math.abs(velocity);
    const error = angleDistance(this.tipAngle, ring.angle);
    const aligned = error < this.aperture;
    const contacts = this.hazards.filter(h => h.active && angleDistance(this.tipAngle, h.angle) < h.halfWidth);
    const spring = pressure && contacts.some(h => h.type === "spring");
    this.springLoad = clamp(this.springLoad + dt * (spring ? this.lock.springLoadRate : pressure ? -4 : -this.lock.springReleaseRate), 0, 100);
    if (this.springLoad >= 100) {
      this.trapTriggered = true;
      this.status = "failed";
      this._emit("trap", "The spring trips. The linked trap releases.");
      return;
    }
    if (pressing && !aligned) {
      this._impact();
      if (this.transition > 0 || this.status !== "playing") return;
    }
    if (pressure && aligned && !spring) {
      this.contact = error > this.aperture * .78 ? "edge" : "turning";
      ring.angle += velocity * dt;
      ring.turn += velocity * dt;
      ring.progress = Math.min(1, ring.progress + speed * dt / this.profile.travel);
      this.stress = clamp(this.stress + dt * (this.contact === "edge" ? this.profile.edgeStrain : -this.profile.centerRecovery), 0, 100);
      this.bestRun += dt;
      if (ring.progress >= 1 - 1e-8) {
        ring.progress = 1;
        ring.latched = true;
        this.active++;
        this.transition = .55;
        this._emit("latch", "A ward catches. The pick moves deeper.");
        if (this.active >= this.rings.length) { this.status = "success"; this._emit("success", "The bolt slides free."); }
      } else {
        const checkpoint = this.lock.detentCount ? Math.floor(ring.progress * this.lock.detentCount) / this.lock.detentCount : 0;
        if (checkpoint > ring.checkpoint) { ring.checkpoint = checkpoint; this._emit("detent", "A detent catches."); }
      }
    } else if (pressure) {
      this.contact = spring ? "spring" : "binding";
      this.bestRun = 0;
      this.stress = Math.min(100, this.stress + dt * (spring ? this.lock.springStrain * this.profile.strainMultiplier : this.profile.damage));
      ring.progress = Math.max(ring.checkpoint, ring.progress - dt * .18);
      ring.angle += velocity * dt * .35;
      this.sparks = 1;
    } else {
      this.contact = "released";
      this.stress = Math.max(0, this.stress - dt * this.profile.recovery);
      ring.progress = Math.max(ring.checkpoint, ring.progress - dt * this.lock.progressLoss);
      ring.angle += velocity * .42 * dt;
      this.bestRun = 0;
    }
    if (this.stress >= 100) this._breakPick();
  }
  _breakPick() {
    this.picks--;
    this.mistakes++;
    this.stress = 0;
    this.ring.progress = 0;
    this.ring.checkpoint = 0;
    this.transition = .8;
    this.contact = "released";
    this._emit("break", "The pick snaps. This ring springs back; earlier wards stay set.");
    if (this.picks <= 0) { this.status = "failed"; this._emit("failure", "No picks remain."); }
  }
}
