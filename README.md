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

**Music:** the team select screen plays a menu theme, and battles have their own theme plus victory and defeat jingles. Browsers block audio until you interact with the page, so the music starts on your first click or key press. Use the ♪ button (team select) or **Music on/off** (battle) to toggle it. The setting is remembered.

## How to play

### 1. Build your team

- Browse every Pokémon (#1–1025) by generation, type or name/number search.
- Hover a Pokémon for its stats, abilities and Pokédex entry (on phones, tap it).
- Click to add it to your team, and click a team slot to remove it. **Random** builds a legal team for you.

Team rules:

| Rule | Details |
| --- | --- |
| **3 Pokémon** | Exactly three. |
| **No shared types** | No two team members can share a type. For example, Charizard (Fire/Flying) and Pidgey (Normal/Flying) can't be on the same team. |
| **150-point limit** | Each Pokémon costs a tenth of its base stat total, rounded (Charizard 534 → 53 pts, Mewtwo 680 → 68 pts). |

Cards that would break a rule are dimmed, and hovering one shows the reason. Press **Confirm team** to head into battle.

### 2. Battle

Your team is on the left and the wild Pokémon are on the right, with each Pokémon's types shown above it so you can plan matchups at a glance. Every Pokémon has an **ATB gauge** that fills in real time based on its Speed. Wild Pokémon act on their own as soon as their gauge fills.

- **Take command:** when a gauge is full, the Pokémon's name turns gold. Click its row or its sprite to command it. The first ready Pokémon is selected automatically, and you can switch between ready Pokémon without losing a turn.
- **Commands:**
  - **Attack:** pick one of its level-up attacks (learned by Lv 50), then choose which wild Pokémon to hit.
  - **Items:** use an item on yourself or a teammate.
  - **Defend:** guard the next 2 hits.
- **ATB pauses while the Attack or Items list is open**, so you can choose without being rushed.
- **Two views:** switch any time with the **View** button (top right), the **V** key or **Y** on a controller. Your choice is remembered.
  - **Advanced** (default): the bottom panel is gone and the battlefield fills the screen. Each Pokémon has a small floating nameplate (name, HP, status, ATB), and the command menu pops up right next to the Pokémon you're commanding, so your eyes stay on the action.
  - **Traditional:** classic layout with your team, commands and the wild Pokémon in a panel along the bottom.
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

## Battle mechanics

- **Stats:** level 50, perfect IVs, no EVs, neutral nature.
- **Damage:** the main-series formula, including the full type chart (immunities too), STAB ×1.5, critical hits (1 in 24, ×1.5), a random 85–100% roll and accuracy checks. Physical attacks use Attack/Defense and special attacks use Sp. Atk/Sp. Def. Attacks with no listed power (Seismic Toss, Low Kick…) count as 60 power.
- **ATB speed:** a full fill takes `300 ÷ base Speed` seconds, clamped to 2–7 s. Wild Pokémon fill 30% slower.
- **Recovery:** after acting, the gauge refills from empty, slower for heavier actions:

  | Action | Refill time |
  | --- | --- |
  | Attack | `0.6 + power ÷ 150`, clamped to ×0.8–×1.8 (40 power ≈ ×0.87, 90 ≈ ×1.2, 150 ≈ ×1.6) |
  | Status attack | ×0.8 |
  | Item | ×1.0 |
  | Defend | ×0.7 |

- **Defend:** gives 2 guard charges. Each attack that lands uses one charge and has its damage cut by a random 25–50%. Misses don't use a charge. Charges last until used, and defending again resets them to 2.
- **PP:** each attack has limited uses. It's grayed out at 0.
- **Status conditions** (one at a time), adapted to real time. "Turn" means each time the Pokémon's gauge fills:

  | Status | Effect |
  | --- | --- |
  | 🔥 Burn | Loses 1/16 max HP each turn, and its physical attacks do half damage. Fire types are immune. |
  | ☠️ Poison | Loses 1/8 max HP each turn. Poison and Steel types are immune. |
  | ⚡ Paralysis | Gauge fills at half speed, and 25% of turns are lost. Electric types are immune. |
  | 💤 Sleep | Loses its next 1–3 turns, then wakes up. |
  | ❄️ Freeze | Loses turns until it thaws (20% chance each turn). Ice types are immune. |
  | 💫 Confusion | Stacks with the others. For 2–5 actions, each attack has a 1-in-3 chance of hitting itself instead. |

  Sleep or freeze landing on a Pokémon that's waiting for orders takes that turn away. Full Heal cures everything.
- **Stat stages:** Attack, Defense, Sp. Atk, Sp. Def, Speed, Accuracy and Evasion go from −6 to +6, as in the main series. Speed stages change how fast the gauge fills. Your HUD rows show current stages (e.g. `Atk+2`), and hovering a row shows everything.
- **Status moves** work when they inflict a status, change stats or heal (Thunder Wave, Hypnosis, Growl, Swords Dance, Recover…). Moves that hit all opponents, like Growl or Poison Gas, affect every wild Pokémon.
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

- Status moves with field or special effects (Rain Dance, Spikes, Protect, Leech Seed, Toxic's worsening poison…) use the turn but do nothing. Their info says "No effect in battle yet".
- Attacks that hit several Pokémon only hit the one you pick, and multi-hit attacks and flinching aren't modeled.
- No abilities or held items in battle.
- No switching Pokémon in or out.

## Project structure

```
index.html       Team select screen
battle.html      Battle screen
css/style.css    Team select styles
css/battle.css   Battle styles
js/api.js        PokéAPI requests, caching, sprites and learnsets
js/app.js        Team select logic and team rules
js/combat.js     Battle math: stats, type chart, damage, Defend
js/battle.js     Battle flow: ATB, menus, targeting, animation
js/music.js      Chiptune synth, sequencer and the soundtrack
js/gamepad.js    Controller input (Gamepad API)
```

The confirmed team is saved in `localStorage` under `pokemonTeam`, and the select screen fires a `team:confirmed` event. Opening `battle.html` directly with no saved team gives you a random party.

## Credits

- Data, sprites and cries: [PokéAPI](https://pokeapi.co/) and the [PokeAPI/sprites](https://github.com/PokeAPI/sprites) repository
- Animation: [GSAP](https://gsap.com/)
- Fonts: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) and [Rubik](https://fonts.google.com/specimen/Rubik)
