/** Shared, bounded gameplay settings for the GM console and workshop. */
export const TUNING_FIELDS = [
  ["lockSize", "Lock size", "Mechanism", 0, 100, 1, "Easy–Expert", "Higher values make the opening narrower."],
  ["shiftingRate", "Lock shifting rate", "Mechanism", 0, 100, 1, "Easy–Expert", "Higher values reverse direction more frequently."],
  ["rotationSpeed", "Rotation speed", "Mechanism", .1, 2.5, .01, "rad/s", "Base speed before construction and environment modifiers."],
  ["turnLength", "Turn length", "Mechanism", .3, 5, .05, "radians", "Distance required to complete each ring."],
  ["paceVariation", "Pace variation", "Mechanism", 0, 90, 1, "%", "Random speed variation after each reversal."],
  ["reversalWarning", "Reversal warning", "Mechanism", .1, 1.5, .001, "seconds", "Length of the amber warning before a reversal."],
  ["detentCount", "Progress divisions", "Mechanism", 0, 6, 1, "divisions", "3 banks progress at thirds. 0 disables checkpoints."],
  ["progressLoss", "Released progress loss", "Mechanism", 0, 1, .01, "per second", "Unbanked progress lost while pressure is released."],
  ["pickCount", "Starting picks", "Pick & strain", 1, 20, 1, "picks", "Exact count. Tool quality never subtracts from this count."],
  ["strainRate", "Wrong-hold strain", "Pick & strain", 1, 250, 1, "%/s", "Strain when pressing against solid metal."],
  ["clickStrain", "Wrong-click strain", "Pick & strain", 0, 50, 1, "%", "Immediate strain per wrong press, including quick taps."],
  ["edgeStrain", "Edge-contact strain", "Pick & strain", 0, 100, 1, "%/s", "Strain when touching the opening's edge."],
  ["recoveryRate", "Released recovery", "Pick & strain", 1, 100, 1, "%/s", "Cooling rate after releasing pressure."],
  ["centerRecovery", "Centered recovery", "Pick & strain", 0, 30, 1, "%/s", "Cooling rate while correctly turning the core."],
  ["wobbleStrength", "Wobble strength", "Pick & strain", 0, 2, .05, "×", "0 disables wobble; 1 uses the current strength."],
  ["wobbleRate", "Wobble speed", "Pick & strain", .25, 3, .05, "×", "Speed of the strained tip's oscillation."],
  ["springSpeed", "Spring movement", "Spring trap", 0, 3, .05, "×", "0 stops sector movement without disabling its size changes."],
  ["springSize", "Spring sector size", "Spring trap", 0, 100, 1, "%", "50 uses the current sector width; higher values enlarge it."],
  ["springGrowthRate", "Spring size-change speed", "Spring trap", 0, 3, .05, "×", "0 freezes width; higher values expand and contract faster."],
  ["springLoadRate", "Spring loading", "Spring trap", 1, 200, 1, "%/s", "Tension gained under pressure inside the sector."],
  ["springReleaseRate", "Spring discharge", "Spring trap", 1, 150, 1, "%/s", "Tension lost after releasing pressure."],
  ["springStrain", "Jammed-pick strain", "Spring trap", 0, 150, 1, "%/s", "Pick strain caused by a spring jam."],
  ["checkDC", "Check difficulty", "Check rewards", 1, 40, 1, "DC", "Required total for a successful configured check."],
  ["rewardOpening", "Success opening bonus", "Check rewards", 0, 200, 1, "%", "Additional opening width for the physical-boost reward."],
  ["rewardStrain", "Success strain reduction", "Check rewards", 0, 90, 1, "%", "Reduces wrong-click, wrong-hold, edge, and spring strain."],
  ["criticalOpening", "Natural 20 opening bonus", "Check rewards", 0, 200, 1, "%", "Opening bonus on a natural 20, regardless of DC."],
  ["criticalStrain", "Natural 20 strain reduction", "Check rewards", 0, 90, 1, "%", "Strain reduction on a natural 20, regardless of DC."]
].map(([key, label, group, min, max, step, unit, hint]) => ({ key, label, group, min, max, step, unit, hint }));

export function tuningGroups(lock) {
  return [...new Set(TUNING_FIELDS.map(field => field.group))].map(title => ({
    title, fields: TUNING_FIELDS.filter(field => field.group === title).map(field => ({ ...field, value: lock[field.key] }))
  }));
}
