# Locks & Lore

Version 0.4 adds a full DM tuning screen with live preview, exact pick counts, configurable checks and rewards, proficiency overrides, and saved world defaults. Runic locks and darkness have been removed. You steer a pick through visible rotating cutouts and apply torque while following their movement.

## The lockpick loop

1. Move the mouse around the lock to aim the pick. The active brass ring has a visible cutout and direction arrow.
2. Hold Space, the left mouse button on the mechanism, or the pressure button to turn the core.
3. Follow the cutout as it rotates. The active ring randomly reverses and changes pace. Amber lips and a reversal cue briefly warn you before the change.
4. Release pressure before the strain meter fills. The ring drifts gently while you regrip. By default, each third of the turn catches at a square detent. The DM can change or disable checkpoints.
5. Catch the entire ward, then work inward. Each ring starts in an alternating direction and continues to reverse unpredictably.

Wrong presses impose immediate strain, including clicks shorter than one animation frame. Holding pressure against solid metal breaks an ordinary Moderate pick in roughly one second. Edge contact adds strain too. At high strain, the bent pick oscillates and its contact dot moves away from the raw mouse aim. The displayed dot is the actual collision point, so you must compensate or release pressure and cool the pick.

Arrow keys or A/D also steer the pick; touch supports dragging on the mechanism and holding the direction buttons. Completed wards stay caught when a pick breaks. Breaking a pick resets the current ward only. New underwater configurations default to a 45-second breath limit. The DM can explicitly set 0 to disable any deadline, including underwater.

The optional lock check gives a mechanical advantage. Rolls are made once per encounter window, not again on each retry. Investigation and the player-selectable Steady hands difficulty reduction have been removed. Practice mode runs locally without posting a result or triggering the completion hook. The player briefing shows the three gameplay instructions and a separate control guide, without introductory flavor text.

## Use

Reload Foundry after updating the module. Select a token and use the key button in Token controls. GMs get the construction console; players get the encounter. Shift+L opens an encounter directly. Module Settings also provides a Build a lock button.

An independent, playable workshop uses exactly the same simulation, renderer, and controls: [Open workshop](http://localhost:30000/modules/locks-and-lore/workshop.html). It can be used without enabling the module or opening a world. Update the URL if your Foundry host, port, or route prefix differs.

For macros or system integrations:

```js
game.locksAndLore.open({ name: "Captain's Strongbox", difficulty: "Hard", pins: 6, trapped: true });
```

The `pins` field remains compatible with existing macros; it now specifies 3–8 ward rings.

## GM tuning

Open **DM lock tuning** through the token key button or **Build a lock** in module settings. The full screen has separate encounter, player-check, mechanism, pick/strain, spring-trap, and reward sections. Numeric settings have both sliders and exact value inputs. A live preview shows the resulting opening, speed, pick count, and estimated wrong-hold tolerance.

Choose a difficulty preset first, then adjust settings independently. Changing the preset resets numeric gameplay and reward controls, including picks and DC. It does not change the chosen check, proficiency override, construction, or environment. The UI calls the highest difficulty Expert; existing `Extreme` macros still work, and `Expert` is accepted as an alias.

**Save world defaults** stores the current configuration for future launches. **Launch encounter** opens this encounter without automatically overwriting defaults. The standalone workshop's **Full DM tuning** button uses the same form and applies settings locally only; it never writes world defaults.

- **Lock shifting rate** (`shiftingRate`, 0–100): Easy reverses roughly every 4.6–7 seconds; Expert roughly every 0.7–1 second. Pace variation and reversal warning are now separate controls. Reversals ease through zero speed without teleporting the opening.
- **Lock size** (`lockSize`, 0–100): Easy provides a wider cutout; Expert makes it narrower. This changes the opening, not the overall mechanism size. The lock check and tool quality can further adjust precision. Players cannot change the lock's difficulty settings.

For example, a fast-shifting lock with a generous opening:

```js
game.locksAndLore.open({ difficulty: "Hard", shiftingRate: 100, lockSize: 0, pins: 5 });
```

Other mechanism controls cover rotation speed, turn length, progress divisions, and released progress loss. Pick controls cover wrong-hold strain, wrong-click impact, edge strain, released/centered recovery, wobble strength, and wobble speed. Spring controls cover sector movement, sector size, size-change speed, tension loading/discharge, and jam strain. Input bounds and defaults are defined in `scripts/settings.mjs` and `presetValues` in `scripts/mechanism.mjs`.

**Starting picks** (`pickCount`, 1–20) is the exact number of picks. Difficulty presets can suggest a count, but tool quality never subtracts from an explicitly configured count.

## Checks and proficiency

The DM can disable the optional check or select any of the 18 standard D&D 5e skills or six abilities and set its DC. The separate Investigation action is gone; Investigation is still available if the DM deliberately chooses it as the encounter's single check.

**Proficiency override** (`proficiencyOverride`) has three modes:

- `auto`: use the character's prepared check bonus, including proficiency or expertise.
- `proficient`: remove the prepared proficiency contribution and add one character proficiency bonus.
- `not`: remove the prepared proficiency contribution, including expertise, while retaining ability and other numeric bonuses.

The override affects only this roll. It never edits the character sheet or grants a passive minigame bonus. These are basic `1d20 + modifier` checks; the module does not invoke the system's full roll dialog, advantage handling, or situational roll features.

The DM chooses either physical boosts or a head start. Physical defaults are a 40% wider opening and 25% less pick strain on success; natural 20 gives 75% wider and 40% less strain. All four percentages are tunable. Reductions affect click, hold, edge, and spring-jam strain, not spring tension. Head start banks one-third of the first ring on success or opens the first ring on natural 20. A natural 20 earns its reward even below the configured DC. The player sees the exact reward before and after the roll. A check can be rolled only once per encounter window, including retries.

## Construction and hazards

- `standard`: rotating wards with randomized direction and pace changes.
- `heavy`: longer turns through heavier mechanisms.
- `trapped`: a red, serrated spring sector moves and expands or contracts. Pressure inside it jams the core, raises pick strain, and loads the spring. Releasing pressure quickly reduces spring tension. Reaching 100% tension trips the linked trap and ends the attempt, even if picks remain.
- `environment`: `none`, `rusted`, `underwater`, `storm`, or `damaged`.
- `toolQuality`: `ordinary`, `fine`, or `improvised`.
- `timeLimit`: seconds; an explicit 0 means no deadline.

The Linked spring trap checkbox can add a spring to a clockwork lock or strongbox. Old runic configurations migrate to clockwork; old darkness environments migrate to none. Legacy magical ward flags are discarded.

Failure posts configured noise or trap consequences for the GM to resolve. The module does not consume inventory, deal damage, or change a door's state. The GM launches encounters on their own client; multiplayer dispatch is not implemented. An integration can listen for `locksAndLoreComplete`, which provides `success`, `lock`, `actorUuid`, `brokenPicks`, `elapsed`, and `trapTriggered` after the chat result posts. `trapTriggered` identifies a tension overload; configured failure consequences can also occur without an overload. Practice does not emit this hook.

## Inspiration and implementation

Skyrim's angle/torque feedback and Kingdom Come's simultaneous pick tracking inspired the sustained turning motion. This design exposes the actual cutouts and introduces alternating rings, recoverable strain, banked detents, and visible danger sectors. The artwork is drawn locally on a canvas; audio clicks and scrapes are synthesized without external assets.

Sources: [Skyrim official manual](https://assets.ctfassets.net/rporu91m20dc/1IuJHrbXY8GqSQQM0GuuUM/2a3c85e2d7772c2eb45f996443f320f4/manual_skyrim-le_ps3_en-us.pdf), [Kingdom Come community controls discussion](https://forum.kingdomcomerpg.com/t/lockpicking-with-mouse-and-keyboard/38004).

## Verification

Run `node --test tests/mechanism.test.mjs` from the module directory. The 21 checks exercise all supported difficulty/archetype/environment combinations, tuning bounds and preset validity, exact pick counts, proficiency overrides, natural 20 rewards, removal migration, random reversals, spring overloads, tracking, quick-click strain, tip wobble, recovery, checkpoints, deadlines, and frame-rate equivalence. Browser checks additionally exercise the shared tuning form, persistence, launch, and real gameplay input. Foundry adapter checks use an isolated test harness, not a live-world mutation.
