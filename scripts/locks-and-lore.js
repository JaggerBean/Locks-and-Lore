import { DEFAULT_LOCK, difficultyNames, normalizeLock } from "./mechanism.mjs";
import { Workbench, resultMarkup } from "./workbench.mjs";
import { bindTuning } from "./tuning.mjs";
import { tuningGroups } from "./settings.mjs";
import { CHECK_CHOICES, checkLabel, checkModifier, checkReward, rewardText } from "./checks.mjs";

const MODULE_ID = "locks-and-lore";
const ApplicationBase = foundry.appv1?.api?.Application ?? globalThis.Application;
const FormBase = foundry.appv1?.api?.FormApplication ?? globalThis.FormApplication;
const archetypes = [
  { value: "standard", label: "Clockwork ward lock" },
  { value: "heavy", label: "Strongbox · longer turns" },
  { value: "trapped", label: "Spring trap · moving spring" }
];
const environments = [
  { value: "none", label: "None" }, { value: "rusted", label: "Rusted · brittle picks" },
  { value: "underwater", label: "Underwater · 45s breath" }, { value: "storm", label: "Storm · shifting rhythm" },
  { value: "damaged", label: "Damaged · narrow cutouts" }
];
const tools = [
  { value: "ordinary", label: "Thieves' tools" }, { value: "fine", label: "Fine picks · wider cutouts" },
  { value: "improvised", label: "Improvised · narrower cutouts" }
];
function currentActor() { return canvas.tokens?.controlled?.[0]?.actor ?? game.user.character ?? null; }

async function skillRoll(actor, lock) {
  if (!actor) throw new Error("Select a character token or assign a character before rolling. You can also begin without a roll.");
  const { modifier } = checkModifier(actor, lock);
  const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Locks & Lore — ${checkLabel(lock)} · DC ${lock.checkDC}` });
  return { total: roll.total, natural: roll.dice.find(d=>d.faces===20)?.results.find(r=>r.active!==false)?.result };
}

class LockGame extends ApplicationBase {
  constructor(lock, actor, options = {}) {
    super(options);
    this.lock = normalizeLock(lock);
    this.actor = actor;
    this.phase = "ready";
    this.skill = 0;
    this.skillText = `DC ${this.lock.checkDC}. ${rewardText(1,this.lock)} ${rewardText(2,this.lock)}`;
    this.sound = true;
    this.practice = false;
    this.busy = false;
    this.workbench = null;
    this.finishedEngine = null;
  }
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: [MODULE_ID, "ll-game"], template: "modules/" + MODULE_ID + "/templates/lock-game.hbs",
      width: 660, height: "auto", resizable: false, title: "Locks & Lore · The Clockwork Lock"
    });
  }
  getData() {
    return {
      lock: this.lock, ready: this.phase === "ready", playing: this.phase === "play", outcome: this.phase === "outcome",
      difficultyLabel: this.lock.difficulty === "Extreme" ? "Expert" : this.lock.difficulty,
      archetypeLabel: archetypes.find(a => a.value === this.lock.archetype)?.label ?? archetypes[0].label,
      character: this.actor?.name ?? "No character selected · play without a roll",
      skillText: this.skillText,
      checkLabel: checkLabel(this.lock), checkEnabled: this.lock.checkEnabled,
      canSkill: !this.skillRolled && !this.busy && this.lock.checkEnabled,
      busy: this.busy, sound: this.sound,
      canRetry: this.phase === "outcome" && (this.lock.canRetry || this.practice), practice: this.practice,
      danger: this.lock.trapped
    };
  }
  activateListeners(html) {
    super.activateListeners(html);
    this.workbench?.destroy();
    const root = html[0] ?? html;
    root.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", event => this._action(event.currentTarget.dataset.action)));
    root.querySelectorAll("[data-option='sound']").forEach(input => input.addEventListener("change", () => { this.sound = input.checked; }));
    const slot = root.querySelector("[data-workbench]");
    if (this.phase !== "outcome" && slot) {
      this.workbench = new Workbench(slot, this.lock, { skill: this.skill, sound: this.sound, preview: this.phase !== "play" }, { finish: engine => this._finish(engine) });
      if (this.phase === "play") slot.querySelector("canvas").focus({ preventScroll: true });
    }
    if (this.phase === "outcome") root.querySelector("[data-result]").innerHTML = resultMarkup(this.finishedEngine, this.practice);
  }
  async _action(action) {
    if (action === "close") return this.close();
    if (this.busy) return;
    if (action === "skill") {
      if (this.phase !== "ready" || this.skillRolled || !this.lock.checkEnabled) return;
      this.busy = true;
      this.render(false);
      try {
        const score = await skillRoll(this.actor, this.lock);
        this.skill = checkReward(score.total, score.natural, this.lock);
        this.skillRolled = true;
        this.skillText = `Rolled ${score.total} (d20: ${score.natural}). ${rewardText(this.skill,this.lock)}`;
      } catch (error) { ui.notifications.warn(error.message); }
      finally { this.busy = false; if (this.rendered) this.render(false); }
      return;
    }
    if (["begin", "practice", "retry"].includes(action)) {
      this.practice = action === "practice" || (action === "retry" && this.practice);
      this.phase = "play";
      this.finishedEngine = null;
      this.render(false);
    }
  }
  _finish(engine) {
    this.finishedEngine = engine;
    this.workbench?.destroy();
    this.phase = "outcome";
    if (!this.practice) this._postResult(engine).catch(error => ui.notifications.warn("The lock result could not be posted: " + error.message));
    this.render(false);
  }
  async _postResult(engine) {
    const success = engine.status === "success";
    const e = foundry.utils.escapeHTML;
    let consequence = success ? "The lock is open." : "The lock remains closed.";
    if (!success && this.lock.trapped) consequence += " The linked trap releases; the GM resolves its effects.";
    if (!success && this.lock.noise !== "Low") consequence += this.lock.noise === "High" ? " The break rings loudly through the room." : " The mechanism clicks sharply.";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: "Locks & Lore",
      content: '<div class="ll-chat-result"><b>' + e(this.lock.name) + "</b><p>" + e(consequence) + "</p><small>" + engine.active + "/" + engine.rings.length + " wards · " + engine.mistakes + " broken picks · " + Math.round(engine.elapsed) + "s</small></div>"
    });
    Hooks.callAll("locksAndLoreComplete", { success, lock: { ...this.lock }, actorUuid: this.actor?.uuid ?? null, brokenPicks: engine.mistakes, elapsed: engine.elapsed, trapTriggered: engine.trapTriggered });
  }
  async close(options) { this.workbench?.destroy(); this.workbench = null; return super.close(options); }
}

class LockPrompt extends FormBase {
  constructor(object = {}, options = {}) { super(object, options); this.lock = normalizeLock(object); }
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { title: "Locks & Lore · DM Tuning", classes: [MODULE_ID, "ll-config"], width: 900, height: "auto", resizable: true, template: "modules/" + MODULE_ID + "/templates/lock-config.hbs" });
  }
  getData() {
    const choices = (items, value) => items.map(item => ({ ...item, selected: item.value === value }));
    return { lock: this.lock, tuningGroups: tuningGroups(this.lock), checks: choices(CHECK_CHOICES,this.lock.checkType),
      proficiencies: choices([{value:"auto",label:"Automatic · character sheet"},{value:"proficient",label:"Proficient · force one proficiency bonus"},{value:"not",label:"Not proficient · remove proficiency bonus"}],this.lock.proficiencyOverride),
      rewards: choices([{value:"physical",label:"Physical boost · wider opening, less strain"},{value:"progress",label:"Head start · banked progress"}],this.lock.rewardStyle),
      difficulties: choices(difficultyNames.map(value => ({ value, label: value === "Extreme" ? "Expert" : value })), this.lock.difficulty), archetypes: choices(archetypes, this.lock.archetype), environments: choices(environments, this.lock.environment), tools: choices(tools, this.lock.toolQuality), noises: choices(["Low", "Moderate", "High"].map(value => ({ value, label: value })), this.lock.noise) };
  }
  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] ?? html;
    const read = () => {
      const data = Object.fromEntries(new FormData(root.querySelector("form") ?? root));
      root.querySelectorAll("input[type=checkbox][name]").forEach(input=>{data[input.name]=input.checked;});
      return normalizeLock(data);
    };
    const preview = () => {
      this.preview?.destroy();
      const lock=read();
      this.preview = new Workbench(root.querySelector("[data-config-preview]"),lock,{preview:true,sound:false});
      const p=this.preview.engine.profile;
      root.querySelector("[data-config-summary]").textContent=`${p.picks} picks · opening ${(p.aperture*2*180/Math.PI).toFixed(1)}° · ${p.speed.toFixed(2)} rad/s · wrong hold breaks a fresh pick in ~${(Math.max(0,100-p.impact)/p.damage).toFixed(1)}s`;
    };
    bindTuning(root,preview);
    root.querySelector("[data-save-defaults]").addEventListener("click",async()=>{
      if (!game.user.isGM || !(root.querySelector("form") ?? root).reportValidity()) return;
      try { await game.settings.set(MODULE_ID,"defaultLock",read()); ui.notifications.info("Lock tuning saved as the world default."); }
      catch(error){ui.notifications.warn(error.message);}
    });
    preview();
  }
  async _updateObject(_event, data) {
    if (!game.user.isGM) return ui.notifications.warn("Only the GM can configure a lock.");
    game.locksAndLore.open(normalizeLock({ ...this.lock, ...data }));
  }
  async close(options) {this.preview?.destroy();return super.close(options);}
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "defaultLock", { name: "Default Lock", scope: "world", config: false, type: Object, default: DEFAULT_LOCK });
  game.settings.registerMenu(MODULE_ID, "lockConsole", { name: "Lockwork Console", label: "Build a lock", hint: "Configure a rotating ward encounter.", icon: "fas fa-key", type: LockPrompt, restricted: true });
  game.keybindings.register(MODULE_ID, "openLock", {
    name: "Open Lockpicking", hint: "Open Locks & Lore for your character.", editable: [{ key: "KeyL", modifiers: ["SHIFT"] }],
    onDown: () => { game.locksAndLore?.open(game.settings.get(MODULE_ID, "defaultLock")); return true; }, restricted: false, precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
});
Hooks.once("ready", () => {
  game.locksAndLore = {
    open: (config = {}) => new LockGame(config, currentActor()).render(true),
    configure: (config = game.settings.get(MODULE_ID,"defaultLock") ?? {}) => game.user.isGM ? new LockPrompt(config).render(true) : ui.notifications.warn("Only the GM can open lock tuning."), LockGame
  };
});
Hooks.on("getSceneControlButtons", controls => {
  const token = Array.isArray(controls) ? controls.find(control => control.name === "token") : controls.tokens ?? controls.token ?? Object.values(controls).find(control => ["token", "tokens"].includes(control.name));
  if (!token?.tools) return;
  const tool = { name: MODULE_ID, title: "Locks & Lore: Pick a Lock", icon: "fas fa-key", button: true, onClick: () => game.user.isGM ? game.locksAndLore.configure() : game.locksAndLore.open(game.settings.get(MODULE_ID, "defaultLock")) };
  if (Array.isArray(token.tools)) { if (!token.tools.some(t => t.name === MODULE_ID)) token.tools.push(tool); }
  else token.tools[MODULE_ID] = { ...tool, onChange: tool.onClick, order: Object.keys(token.tools).length };
});
