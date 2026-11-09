# Final Poké Battle

A browser fan game that mixes Pokémon with a classic side-view, real-time **ATB** battle system. Pick a team of three, then fight three random wild Pokémon in real time.

Built with plain HTML, CSS and JavaScript, [GSAP](https://gsap.com/) for animation, and live data and sprites from [PokéAPI](https://pokeapi.co/). The soundtrack is original chiptune music, synthesized live in the browser with the Web Audio API, so there are no audio files.

> Personal, non-commercial fan project. Pokémon and all related names and artwork are © Nintendo, Game Freak and The Pokémon Company.

## Running it

No build step and nothing to install.

- **Quickest:** open `index.html` in a browser.
- **Or** serve the folder with any static server, for example:

  ```bash
  npx serve .
  ```

An internet connection is needed, since Pokémon data, sprites and cries are loaded from PokéAPI. The Pokédex list and stat totals are cached in `localStorage` after the first visit.

**Music:** the team select screen plays a menu theme, and battles have their own theme plus evolution, victory and defeat jingles. Browsers block audio until you interact with the page, so the music starts on your first click or key press. Use the ♪ button (team select) or **Music on/off** (battle) to toggle it. The setting is remembered.

## How to play

### 1. Build your team

- Browse every Pokémon (#1–1025) by generation, type or name/number search.
- Hover a Pokémon for its stats, abilities and Pokédex entry (on phones, tap it).
- Every Pokémon has a **1–5 star rating** from its base stat total, shown on its card, in its details and in battle:

  | Stars | Base stat total | For example |
  | --- | --- | --- |
  | ★☆☆☆☆ | under 350 | Caterpie, Bulbasaur, Pidgeotto |
  | ★★☆☆☆ | 350–449 | Ivysaur, Wartortle, Butterfree |
  | ★★★☆☆ | 450–524 | Raichu, Pidgeot, Chimecho |
  | ★★★★☆ | 525–599 | Venusaur, Charizard, Blastoise |
  | ★★★★★ | 600 and up | Dragonite, Garchomp, Mewtwo |
- Click to add it to your team, and click a team slot to remove it. **Random** builds a legal team for you.

Team rules:

| Rule | Details |
| --- | --- |
| **3 Pokémon** | Exactly three. |
| **No shared types** | No two team members can share a type. For example, Charizard (Fire/Flying) and Pidgey (Normal/Flying) can't be on the same team. |
| **150-point limit** | Each Pokémon costs a tenth of its base stat total, rounded (Charizard 534 → 53 pts, Mewtwo 680 → 68 pts). |

Cards that would break a rule are dimmed, and hovering one shows the reason. Press **Confirm team** to head into battle.

### 2. Battle

Your team is on the left and the wild Pokémon are on the right, with each Pokémon's types and star rating shown above it so you can plan matchups at a glance. Every Pokémon has an **ATB gauge** split into **three charges** that fill one after another in real time, based on its Speed. Every action spends charges: the strongest attacks cost 3, middling ones 2, and weak attacks, status moves, Defend, items and Evolve cost 1. Each attack shows its cost as gold pips in the attack list.

- **Take command:** once a Pokémon has at least one charge, its name turns gold. Click its row or its sprite to command it. The first ready Pokémon is selected automatically, and you can switch between ready Pokémon without losing anything.
- **Save up or spend:** charges keep filling while a Pokémon waits, up to three. Use cheap moves as soon as a charge is ready, or wait and spend all three on a big hit. A Pokémon with charges left over after acting is ready again as soon as its move finishes. The gauge doesn't fill while the Pokémon is acting.
- **Wild Pokémon** pick an attack as soon as they have a charge, then save up until they can pay for it.
- **Commands:**
  - **Attack:** pick one of its level-up attacks (learned by Lv 50), then choose which wild Pokémon to hit. Damaging attacks are listed first, strongest at the top, followed by status moves. Attacks that cost more charges than the Pokémon has are grayed out. Moves that can't do anything in this battle system are left out (see below).
  - **Items:** use an item on yourself or a teammate.
  - **Defend:** guard the next 2 hits.
  - **Evolve:** only appears when the Pokémon's evolution gauge is full (see below).
- **ATB pauses while the Attack or Items list is open**, so you can choose without being rushed.
- **Two views:** switch any time with the **View** button (top right), the **V** key or **Y** on a controller. Your choice is remembered.
  - **Advanced** (default): the bottom panel is gone and the battlefield fills the screen. Each Pokémon has a small floating nameplate (name, HP, status, ATB), and the command menu pops up right next to the Pokémon you're commanding, so your eyes stay on the action.
  - **Traditional:** classic layout with your team, commands and the wild Pokémon in a panel along the bottom.
- **Evolution:** Pokémon that can still evolve, on either side, get a thin rainbow **evolution gauge** under their HP bar.
  - The gauge fills over about 30 seconds of battle (a little slower for foes), and faster whenever the Pokémon lands or takes a hit.
  - When it's full, the gauge shimmers and the Pokémon glows. Your Pokémon get a **✦ Evolve** command, and foes evolve as soon as they have a charge.
  - Evolving costs one charge and freezes the whole battle for a short cutscene with its own music. The field dims, the Pokémon turns to light and flickers faster and faster between its old and new shapes, then bursts into its new form.
  - The new form gets its new name, types and stats. It keeps its moves, PP, status and stat changes.
  - It also **regains half of the health it had lost**, as a share of max HP. For example, at 40% HP it evolves to 70%.
  - A middle stage (Machoke, Ivysaur…) gets a fresh gauge for its next evolution. Branching lines like Eevee's evolve into one of their evolutions at random.
  - Evolutions last for that battle only. Your team is back to its chosen forms for the next one.
- **Attack animations:** every attack is animated in its type's style.
  - **Contact attacks** (Tackle, Fire Punch…) lunge in and land with a type-coloured impact.
  - **Special and status attacks** charge up, then fly across the field: fireballs, streams of bubbles, lightning from the sky, falling rocks, whirling leaves, ice shards, psychic rings and more.
  - **Some move names have their own look:** beams (Hyper Beam, Ice Beam…), slashes and claws, biting jaws, and ground-shaking quakes.
  - **Big hits shake the field:** critical hits flash it, super-effective hits shake it, and stronger attacks throw bigger effects.
  - **Conditions are animated too:** stat changes, healing and status conditions (flames for burn, Zs for sleep and so on).
  - Screen shake and flashes are skipped or toned down if your system asks for reduced motion.
- Win by making all three wild Pokémon faint. Lose if your whole team does.

### Controls

Mouse, keyboard and game controllers all work. Controllers use the standard Xbox layout (on PlayStation, A = ✕, B = ○, X = □), and a button guide appears on screen once a controller is detected. Browsers only detect a controller after you press one of its buttons on the page.

**Team select**

| Action | Mouse | Controller |
| --- | --- | --- |
| Move between Pokémon | Hover | D-pad / left stick |
| Add / remove a Pokémon | Click | A |
| Remove the last pick | Click its slot | B |
| Random team | Random button | X |
| Previous / next generation | Generation tabs | LB / RB |
| Confirm team | Confirm button | Start |
| Music on/off | ♪ button | Select |

**Battle**

| Action | Mouse | Keyboard | Controller |
| --- | --- | --- | --- |
| Command a ready Pokémon | Click its row or sprite | (automatic) | LB / RB |
| Move the menu cursor | Hover | Arrow keys | D-pad / left stick |
| Choose | Click | Enter / Space | A |
| Switch target | Hover a sprite or row | Arrow keys | D-pad / left stick |
| Back / cancel | ◀ button or right-click | Esc / Backspace | B |
| Music on/off | Music button | | Select |
| Switch view | View button | V | Y |

### 3. Battle Tower

After confirming your team, choose **Wild battle** for a quick fight against three random Pokémon, **Battle Tower** to climb four floors of trainer battles, or **Rogue run** (see below).

| Floor | Trainer | Foe strength (BST) | Foe speed |
| --- | --- | --- | --- |
| I · The Gate | Gatekeeper Rowan | 300–430 | slowest |
| II · The Hall | Ace Trainer Mira | 420–500 | faster |
| III · The Spire | Veteran Holt | 490–560 | faster still |
| IV · The Summit | Tower Master Sable | 560–720 | almost your pace |

- The tower screen shows your team standing on the floor you're on. Win, and they hop up to the next floor as the cleared one lights up gold.
- Lose, and your team tumbles back to the bottom. The climb restarts at Floor I.
- Clear the Summit to light the beacon and set off fireworks.
- Your team is fully healed and gets a fresh bag before each floor.
- Progress is saved per team, so picking a different team starts a new climb. Your best result is remembered.
- Tower battles take place in the tower's own arena, decked in each floor's colours, with their own theme music on the tower screen.

### 4. Rogue run

A roguelike mode: keep winning with a team that changes as you go. Losing a battle ends the run, and any Pokémon that faints along the way is gone for good.

- **Start:** choose **Rogue run** after confirming a team, then **Choose your team**. Pick three **1★** Pokémon with no shared types (other Pokémon are dimmed). This starting team is kept separate from your usual team.
- **Battles:** each battle is against three wild Pokémon. Foes get a star tougher every two wins (battles 1–2 are 1★, 3–4 are 2★, up to 5★ from battle 9), and their gauges fill a little faster each win, down to your own pace. Your team starts every battle fully healed with a fresh bag.
- **After each win, roll the die.** It rolls 1 to 5, and you're offered a random Pokémon with that many stars, with its types and stats.
  - Click a team member to swap it out for the new Pokémon, or choose **Keep my team**.
  - Swaps don't have to follow the type rule, so a run can end up with shared types.
  - The roll and the offer are saved the moment they happen, so refreshing the page can't reroll them.
- **Fainted Pokémon are lost.** If any of your Pokémon are fainted when you win, they leave the team, and each gets a roll of its own instead of the free one.
  - The rolled Pokémon takes the fallen one's place automatically: no swapping, no turning it down.
  - Two fainted means two rolls, one after the other, to fill the team back up.
- **Run over:** when your team falls, the run screen shows how many battles you won. Your best run is remembered. You can also give up a run from the run screen (it takes two clicks).
- Evolutions during a battle still only last for that battle.

## Battle mechanics

- **Stats:** level 50, perfect IVs, no EVs, neutral nature.
- **Damage:** the main-series formula, including the full type chart (immunities too), STAB ×1.5, critical hits (1 in 24, ×1.5), a random 85–100% roll and accuracy checks. Physical attacks use Attack/Defense and special attacks use Sp. Atk/Sp. Def. Attacks with no listed power (Seismic Toss, Low Kick…) count as 60 power.
- **ATB speed:** each charge takes `0.6 × (300 ÷ base Speed)` seconds, with `300 ÷ base Speed` clamped to 2–7 s. Wild Pokémon fill 30% slower.
- **ATB cost:** spending charges keeps any part-filled charge, so the gauge carries on from where it was.

  | Action | Charges |
  | --- | --- |
  | Attack under 55 power (Tackle, Ember, Vine Whip…) | 1 |
  | Attack with 55–85 power (Bite, Headbutt, Slash…), or no listed power | 2 |
  | Attack with 90 power or more (Flamethrower, Surf, Hyper Beam…) | 3 |
  | Status attack | 1 |
  | Item, Defend, Evolve | 1 |

- **Defend:** gives 2 guard charges. Each attack that lands uses one charge and has its damage cut by a random 25–50%. Misses don't use a charge. Charges last until used, and defending again resets them to 2.
- **PP:** each attack has limited uses. It's grayed out at 0.
- **Status conditions** (one at a time), adapted to real time. "Charge" means each time one of the Pokémon's three charges fills:

  | Status | Effect |
  | --- | --- |
  | 🔥 Burn | Loses 1/24 max HP each charge, and its physical attacks do half damage. Fire types are immune. |
  | ☠️ Poison | Loses 1/12 max HP each charge. Poison and Steel types are immune. |
  | ⚡ Paralysis | Gauge fills at half speed, and 25% of charges are lost. Electric types are immune. |
  | 💤 Sleep | Loses its next 2–4 charges, then wakes up. |
  | ❄️ Freeze | Loses charges until it thaws (12% chance each charge). Ice types are immune. |
  | 💫 Confusion | Stacks with the others. For 2–5 actions, each attack has a 1-in-3 chance of hitting itself instead. |

  Sleep or freeze also wipes out any charges the Pokémon had saved up. Full Heal cures everything.
- **Stat stages:** Attack, Defense, Sp. Atk, Sp. Def, Speed, Accuracy and Evasion go from −6 to +6, as in the main series. Speed stages change how fast the gauge fills. Your HUD rows show current stages (e.g. `Atk+2`), and hovering a row shows everything.
- **Status moves** work when they inflict a status, change stats or heal (Thunder Wave, Hypnosis, Growl, Swords Dance, Recover…). Moves that hit all opponents, like Growl or Poison Gas, affect every wild Pokémon.
- **Left-out moves:** moves that would do nothing here aren't in the attack lists, for you or for foes.
  - Status moves with field, switching or other special effects (Rain Dance, Protect, Leech Seed, Whirlwind, Splash, Transform…).
  - Attacks that need missing mechanics: returning damage taken (Counter, Mirror Coat, Metal Burst, Bide, Comeuppance), acting while asleep (Snore), the first turn only (Fake Out, First Impression), held items or berries (Fling, Natural Gift, Belch) or Stockpile (Spit Up).
  - A Pokémon left with no damaging attack (Ditto, Wobbuffet) gets Tackle.
- **Attack side effects:** status chances (Ember's 10% burn), stat drops or boosts (Bubble Beam, Close Combat, Flame Charge), draining (Giga Drain) and recoil (Take Down).
- **Wild Pokémon** use status moves too, about 30% of the time when they have useful ones.
- **Items:**

  | Item | Qty | Effect |
  | --- | --- | --- |
  | Potion | 5 | Restores 20 HP |
  | Super Potion | 3 | Restores 60 HP |
  | Full Heal | 2 | Cures a status condition and confusion |
  | Revive | 2 | Revives a fainted teammate with half HP |
  | Ether | 2 | Restores 10 PP to each of the user's attacks |
  | X Attack | 2 | Raises the user's Attack by 2 stages |

### Not in yet

- Status moves with field or special effects (Rain Dance, Spikes, Protect, Leech Seed…), so they're left out of attack lists. Toxic works as regular poison, without the worsening damage.
- Attacks that hit several Pokémon only hit the one you pick, and multi-hit attacks and flinching aren't modeled.
- No abilities or held items in battle.
- No switching Pokémon in or out.

## Project structure

```
index.html       Team select screen
battle.html      Battle screen (wild battles, tower floors and Rogue runs)
tower.html       Battle Tower screen
css/tower.css    Battle Tower styles
js/tower.js      Battle Tower screen: the tower, climbing, celebrations
js/tower-data.js Tower floors and saved climb progress
rogue.html       Rogue run screen
css/rogue.css    Rogue run styles
js/rogue.js      Rogue run screen: the die roll, offers and swaps
js/rogue-data.js Saved Rogue run: team, wins, rolls and foe scaling
css/style.css    Team select styles
css/battle.css   Battle styles
js/api.js        PokéAPI requests, caching, sprites and learnsets
js/app.js        Team select logic and team rules
js/combat.js     Battle math: stats, type chart, damage, Defend
js/battle.js     Battle flow: ATB, menus, targeting, animation
js/fx.js         Attack animations: type-themed projectiles, impacts and auras
js/music.js      Chiptune synth, sequencer and the soundtrack
js/gamepad.js    Controller input (Gamepad API)
```

The confirmed team is saved in `localStorage` under `pokemonTeam`, and the select screen fires a `team:confirmed` event. Opening `battle.html` directly with no saved team gives you a random party.

## Credits

- Data, sprites and cries: [PokéAPI](https://pokeapi.co/) and the [PokeAPI/sprites](https://github.com/PokeAPI/sprites) repository
- Animation: [GSAP](https://gsap.com/)
- Fonts: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) and [Rubik](https://fonts.google.com/specimen/Rubik)
