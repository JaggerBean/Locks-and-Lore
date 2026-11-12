export const CHECK_CHOICES = [
  ...Object.entries({ acr:"Acrobatics", ani:"Animal Handling", arc:"Arcana", ath:"Athletics", dec:"Deception",
    his:"History", ins:"Insight", itm:"Intimidation", inv:"Investigation", med:"Medicine", nat:"Nature",
    prc:"Perception", prf:"Performance", per:"Persuasion", rel:"Religion", slt:"Sleight of Hand", ste:"Stealth", sur:"Survival"
  }).map(([key,label])=>({value:`skill:${key}`,label:`Skill · ${label}`})),
  ...Object.entries({str:"Strength",dex:"Dexterity",con:"Constitution",int:"Intelligence",wis:"Wisdom",cha:"Charisma"})
    .map(([key,label])=>({value:`ability:${key}`,label:`Ability · ${label}`}))
];
export function checkLabel(lock) { return CHECK_CHOICES.find(c=>c.value===lock.checkType)?.label ?? "Skill · Sleight of Hand"; }
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Adjust the roll only; never mutate the actor or grant a passive gameplay bonus. */
export function checkModifier(actor, lock) {
  const [type,key] = lock.checkType.split(":");
  const data = type === "skill" ? actor.system?.skills?.[key] : actor.system?.abilities?.[key];
  if (!data) throw new Error("This character does not have the configured check. The GM can choose another check.");
  const pb = number(actor.system?.attributes?.prof);
  const multiplier = type === "skill" ? number(data.prof?.multiplier ?? data.value ?? data.proficient) : number(data.checkProf?.multiplier);
  const proficiency = number((type === "skill" ? data.prof?.flat : data.checkProf?.flat) ?? pb * multiplier);
  const total = type === "skill" ? number(data.total ?? (number(data.mod) + number(data.bonus) + proficiency))
    : number(data.mod) + number(data.checkBonus ?? data.check?.bonus ?? data.bonus) + proficiency;
  const modifier = lock.proficiencyOverride === "auto" ? total : total - proficiency + (lock.proficiencyOverride === "proficient" ? pb : 0);
  return { modifier, proficiency, pb };
}
export function checkReward(total, natural, lock) {
  if (!lock.checkEnabled) return 0;
  return natural === 20 ? 2 : Number(total) >= lock.checkDC ? 1 : 0;
}
export function rewardText(tier, lock) {
  if (!tier) return "No mechanical bonus. The lock remains playable.";
  if (lock.rewardStyle === "progress") return tier === 2 ? "Natural 20: first ring already open." : "Success: first ring starts one-third complete, with that progress banked.";
  return `${tier === 2 ? "Natural 20" : "Success"}: opening +${tier === 2 ? lock.criticalOpening : lock.rewardOpening}%; pick strain −${tier === 2 ? lock.criticalStrain : lock.rewardStrain}%.`;
}
