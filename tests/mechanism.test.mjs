import { test } from "node:test";
import assert from "node:assert/strict";
import { Mechanism, TAU, angleDistance, difficultyNames, normalizeLock } from "../scripts/mechanism.mjs";
import { TUNING_FIELDS } from "../scripts/settings.mjs";
import { checkModifier, checkReward } from "../scripts/checks.mjs";

function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function follow(e, frames = 40000, dt = 1 / 60) {
  for (let i = 0; i < frames && e.status === "playing"; i++) {
    e.aim(e.ring.angle - e.wobbleOffset);
    // Anticipate the moving spring sector by one frame.
    const safe = !e.hazards.some(h => (h.active || h.charging) && angleDistance(e.ring.angle, h.angle) < h.halfWidth + .06);
    e.update(dt, safe);
  }
  return e;
}

test("each difficulty, archetype, modifier and low-quality tool remains winnable with accurate play", () => {
  for (const difficulty of difficultyNames) for (const archetype of ["standard", "heavy", "trapped"]) {
    for (const environment of ["none", "rusted", "damaged", "underwater", "storm"]) {
      const e = follow(new Mechanism({ difficulty, archetype, environment, toolQuality: "improvised", timeLimit: 600 }, {}, seeded(1707)));
      assert.equal(e.status, "success", JSON.stringify({ difficulty, archetype, environment, elapsed: e.elapsed }));
      assert.equal(e.mistakes, 0);
    }
  }
});
test("holding torque with a stationary pick cannot auto-complete even one ward", () => {
  const e = new Mechanism({ difficulty: "Easy" }, {}, seeded(22));
  e.aim(e.ring.angle);
  for (let i = 0; i < 5000 && e.status === "playing"; i++) e.update(1 / 60, true);
  assert.equal(e.active, 0);
  assert.equal(e.status, "failed");
  assert.equal(e.mistakes, e.profile.picks);
});
test("releasing pressure cools strain; detents survive a regrip", () => {
  const e = new Mechanism({}, {}, seeded(11));
  while (e.ring.progress < .45) { e.aim(e.ring.angle); e.update(1 / 60, true); }
  const checkpoint = e.ring.checkpoint;
  assert.equal(checkpoint, 1 / 3);
  e.aim(e.ring.angle + Math.PI);
  for (let i = 0; i < 24; i++) e.update(1 / 60, true);
  assert.ok(e.stress > 30);
  for (let i = 0; i < 180; i++) e.update(1 / 60, false);
  assert.equal(e.stress, 0);
  assert.equal(e.ring.progress, checkpoint);
});
test("a broken pick resets only the active ward and keeps previously latched wards", () => {
  const e = new Mechanism({}, {}, seeded(43));
  while (e.active === 0) { e.aim(e.ring.angle); e.update(1 / 60, true); }
  for (let i = 0; i < 1000 && e.mistakes === 0; i++) { e.aim(e.ring.angle + Math.PI); e.update(1 / 60, true); }
  assert.equal(e.active, 1);
  assert.equal(e.rings[0].latched, true);
  assert.equal(e.ring.progress, 0);
  assert.equal(e.picks, e.profile.picks - 1);
});
test("pressure in the visible trap sector damages the pick even when aligned", () => {
  const e = new Mechanism({ trapped: true });
  e.ring.angle = e.hazards[0].angle; e.aim(e.ring.angle);
  e.update(.1, true);
  assert.equal(e.contact, "spring"); assert.ok(e.stress > 0); assert.ok(e.springLoad > 0); assert.equal(e.ring.progress, 0);
});
test("default play has no time limit, timed play fails, completed outcomes freeze", () => {
  const free = new Mechanism(); free.update(.25); assert.equal(free.timeLeft, null);
  assert.equal(new Mechanism({ environment: "underwater" }).timeLeft, 45);
  const timed = new Mechanism({ timeLimit: 1 });
  for (let i = 0; i < 10; i++) timed.update(.25);
  assert.equal(timed.status, "failed");
  const elapsed = timed.elapsed; timed.update(.25, true); assert.equal(timed.elapsed, elapsed);
});
test("following has comparable duration at 30, 60, and 144fps and crosses the angle wrap", () => {
  const times = [30, 60, 144].map(fps => follow(new Mechanism({}, {}, seeded(17)), 10000, 1 / fps).elapsed);
  assert.ok(Math.max(...times) - Math.min(...times) < .15, times.join(","));
  assert.ok(angleDistance(TAU - .02, .02) < .05);
});
test("skill checks aid precision without automatically setting wards; inputs are bounded", () => {
  const base = new Mechanism(); const aided = new Mechanism({}, { skill: 2 });
  assert.ok(aided.aperture > base.aperture); assert.equal(aided.active, 0);
  const removedOptions = new Mechanism({}, { steady: true, inspected: true });
  assert.deepEqual(removedOptions.profile, base.profile, "removed player options must not alter difficulty");
  assert.equal(normalizeLock({ pins: -1 }).pins, 3); assert.equal(normalizeLock({ pins: 900 }).pins, 8);
});

test("size and reversal rate can be tuned independently and old configurations derive presets", () => {
  const wideFast = new Mechanism({ lockSize: 0, shiftingRate: 100 });
  const narrowSlow = new Mechanism({ lockSize: 100, shiftingRate: 0 });
  assert.ok(wideFast.aperture > narrowSlow.aperture * 2);
  assert.ok(wideFast.profile.shiftInterval < narrowSlow.profile.shiftInterval / 4);
  const sameSize = new Mechanism({ lockSize: 0, shiftingRate: 0 });
  assert.equal(wideFast.aperture, sameSize.aperture);
  assert.equal(new Mechanism({ lockSize: 100, shiftingRate: 100 }).profile.shiftInterval, wideFast.profile.shiftInterval);
  assert.equal(normalizeLock({ difficulty: "Hard" }).shiftingRate, 50);
  assert.equal(normalizeLock({ difficulty: "Expert" }).lockSize, 100);
  assert.equal(normalizeLock({ lockSize: -5, shiftingRate: 900 }).lockSize, 0);
  assert.equal(normalizeLock({ lockSize: "bad", shiftingRate: 900 }).shiftingRate, 100);
});
test("expert shifting reverses frequently, changes pace, and keeps angles continuous", () => {
  const slow = new Mechanism({ shiftingRate: 0 }, {}, seeded(811));
  const fast = new Mechanism({ shiftingRate: 100 }, {}, seeded(811));
  const directions = new Set(), paces = new Set();
  for (let i = 0; i < 1200; i++) {
    const angle = fast.ring.angle;
    fast.update(1 / 60); slow.update(1 / 60);
    directions.add(fast.ring.direction); paces.add(fast.ring.pace);
    assert.ok(angleDistance(angle, fast.ring.angle) < .03, "a reversal teleported the cutout");
  }
  assert.equal(directions.size, 2);
  assert.ok(paces.size > 5);
  assert.ok(fast.shiftCount > slow.shiftCount * 4);
});
test("spring sector varies in position and width", () => {
  const e = new Mechanism({ trapped: true }, {}, seeded(3));
  const initial = {...e.hazards[0]};
  for (let i = 0; i < 300; i++) e.update(1 / 60);
  assert.ok(angleDistance(initial.angle, e.hazards[0].angle) > .3);
  assert.ok(Math.abs(initial.halfWidth - e.hazards[0].halfWidth) > .01);
  assert.equal(e.hazards[0].active, true);
});
test("spring load can trip the trap independently of breaking a pick", () => {
  const e = new Mechanism({ trapped: true }, {}, seeded(46));
  for (let i = 0; i < 200 && e.status === "playing"; i++) {
    e.ring.angle = e.hazards[0].angle;
    e.aim(e.ring.angle - e.wobbleOffset);
    e.update(1 / 120, true);
  }
  assert.equal(e.status, "failed"); assert.equal(e.trapTriggered, true);
  assert.equal(e.mistakes, 0);
});
test("removed runic and darkness settings migrate safely without leaving a magical hazard", () => {
  const e = new Mechanism({archetype:"arcane",environment:"darkness",magicWard:true});
  assert.equal(e.lock.archetype,"standard");assert.equal(e.lock.environment,"none");
  assert.equal(e.hazards.length,0);assert.equal(e.lock.magicWard,undefined);
});
test("GM pick count is exact across all difficulties and tool qualities", () => {
  for(const difficulty of difficultyNames)for(const toolQuality of ["ordinary","fine","improvised"]){
    const e=new Mechanism({difficulty,toolQuality,pickCount:7});assert.equal(e.picks,7);
  }
  assert.equal(new Mechanism({pickCount:1}).picks,1);
  assert.equal(normalizeLock({pickCount:900}).pickCount,20);
  assert.equal(normalizeLock({pickCount:0}).pickCount,1);
});
test("wrong clicks impose an immediate impact and wrong holds break a default pick within 1.1 seconds", () => {
  const e = new Mechanism({}, {}, seeded(67));
  e.aim(e.ring.angle + Math.PI);
  e.update(1 / 120, true);
  assert.ok(e.stress >= 16);
  for (let i = 0; i < 125 && !e.mistakes; i++) e.update(1 / 120, true);
  assert.equal(e.mistakes, 1); assert.ok(e.elapsed <= 1.1);
});
test("strain makes the real contact tip wobble on both sides and changes collision", () => {
  const e = new Mechanism({ lockSize: 100 }, {}, seeded(7));
  e.stress = 90;
  const offsets = [];
  for (let i = 0; i < 40; i++) { e.update(1 / 120, false); offsets.push(e.wobbleOffset); }
  assert.ok(Math.min(...offsets) < -.08 && Math.max(...offsets) > .08);
  let bound = false;
  for (let i = 0; i < 60 && !bound && e.status === "playing"; i++) {
    e.aim(e.ring.angle);
    e.update(1 / 120, true);
    bound = e.contact === "binding";
    assert.ok(angleDistance(e.pickAngle, e.ring.angle) < e.aperture);
  }
  assert.equal(bound, true, "raw mouse aim was centered, but wobble never affected contact");
});

test("sub-frame clicks cannot evade strain and immediate break feedback survives the next frame", () => {
  const e = new Mechanism({}, {}, seeded(67));
  e.aim(e.ring.angle + Math.PI);
  for (let i = 0; i < 7; i++) {
    e.engage();
    e.pressure = false;
  }
  assert.equal(e.mistakes, 1);
  assert.equal(e.picks, 2);
  e.update(1 / 60, false);
  assert.equal(e.event.type, "break");
  assert.equal(e.mistakes, 1);
  const held = new Mechanism({}, {}, seeded(67));
  held.aim(held.ring.angle + Math.PI);
  held.engage();
  held.engage();
  assert.equal(held.stress, 16, "holding or repeating keydown must not repeat click damage");
  held.update(1 / 120, true);
  assert.ok(held.stress < 17, "the next frame double-counted the initial impact");
});

test("every numeric tuning field is bounded and preset values fit the input step",()=>{
  for(const difficulty of difficultyNames)for(const field of TUNING_FIELDS){
    const lock=normalizeLock({difficulty});
    assert.ok(lock[field.key]>=field.min&&lock[field.key]<=field.max,field.key);
    const units=(lock[field.key]-field.min)/field.step;
    assert.ok(Math.abs(units-Math.round(units))<1e-7,`${difficulty}: ${field.key}`);
    assert.equal(normalizeLock({[field.key]:-900})[field.key],field.min);
    assert.equal(normalizeLock({[field.key]:900})[field.key],field.max);
  }
});
test("GM physics tuning changes rotation, strain, cooling, wobble, springs, and checkpoints",()=>{
  const e=new Mechanism({rotationSpeed:1.7,turnLength:3,strainRate:150,clickStrain:30,recoveryRate:60,wobbleStrength:0,detentCount:0,progressLoss:0,trapped:true,springSpeed:0,springGrowthRate:0,springLoadRate:20,springReleaseRate:90});
  assert.equal(e.profile.speed,1.7);assert.equal(e.profile.travel,3);
  const hazard={...e.hazards[0]};e.stress=80;e.update(.25,false);
  assert.equal(e.wobbleOffset,0);assert.ok(Math.abs(e.stress-65)<1e-8);
  assert.equal(e.hazards[0].angle,hazard.angle);assert.equal(e.hazards[0].halfWidth,hazard.halfWidth);
  assert.equal(new Mechanism({environment:"underwater",timeLimit:0}).timeLeft,null);
});
test("proficiency override keeps other bonuses and does not mutate the character",()=>{
  const actor={system:{attributes:{prof:3},skills:{slt:{mod:4,bonus:2,total:12,prof:{flat:6,multiplier:2}}},abilities:{dex:{mod:4,checkBonus:2}}}};
  const before=JSON.stringify(actor);
  assert.equal(checkModifier(actor,normalizeLock()).modifier,12);
  assert.equal(checkModifier(actor,normalizeLock({proficiencyOverride:"proficient"})).modifier,9);
  assert.equal(checkModifier(actor,normalizeLock({proficiencyOverride:"not"})).modifier,6);
  assert.equal(checkModifier(actor,normalizeLock({checkType:"ability:dex",proficiencyOverride:"proficient"})).modifier,9);
  assert.equal(JSON.stringify(actor),before);
});
test("natural 20 gets critical rewards even below DC; boost is visible and head start remains interactive",()=>{
  const lock=normalizeLock({checkDC:40});assert.equal(checkReward(20,20,lock),2);
  assert.equal(checkReward(39,19,lock),0);assert.equal(checkReward(40,19,lock),1);
  const base=new Mechanism(lock),success=new Mechanism(lock,{skill:1}),critical=new Mechanism(lock,{skill:2});
  assert.ok(Math.abs(success.aperture/base.aperture-1.4)<1e-8);
  assert.ok(Math.abs(critical.aperture/base.aperture-1.75)<1e-8);
  assert.equal(success.profile.damage,base.profile.damage*.75);assert.equal(critical.profile.impact,base.profile.impact*.6);
  const head=new Mechanism({rewardStyle:"progress",pins:3},{skill:2});assert.equal(head.active,1);assert.equal(head.status,"playing");
  assert.equal(follow(head).status,"success");
  const disabled=new Mechanism({checkEnabled:false},{skill:2});assert.equal(disabled.aperture,base.aperture);
});
