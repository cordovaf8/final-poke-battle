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

Your team is on the left and the wild Pokémon are on the right. Every Pokémon has an **ATB gauge** that fills in real time based on its Speed. Wild Pokémon act on their own as soon as their gauge fills.

- **Take command:** when a gauge is full, the Pokémon's name turns gold. Click its row or its sprite to command it. The first ready Pokémon is selected automatically, and you can switch between ready Pokémon without losing a turn.
- **Commands:**
  - **Attack:** pick one of its level-up attacks (learned by Lv 50), then choose which wild Pokémon to hit.
  - **Items:** use an item on yourself or a teammate.
  - **Defend:** guard the next 2 hits.
- **ATB pauses while the Attack or Items list is open**, so you can choose without being rushed.
- Win by making all three wild Pokémon faint. Lose if your whole team does.

Controls:

| Action | Mouse | Keyboard |
| --- | --- | --- |
| Move the menu cursor | Hover | Arrow keys |
| Choose | Click | Enter / Space |
| Switch target | Hover a sprite or row | Arrow keys |
| Back / cancel | ◀ button or right-click | Esc / Backspace |

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
- **Items:**

  | Item | Qty | Effect |
  | --- | --- | --- |
  | Potion | 5 | Restores 20 HP |
  | Super Potion | 3 | Restores 60 HP |
  | Revive | 2 | Revives a fainted teammate with half HP |
  | Ether | 2 | Restores 10 PP to each of the user's attacks |
  | X Attack | 2 | Raises the user's Attack by 2 stages |

### Not in yet

- Status attacks (Growl, Swords Dance…) use the turn but have no effect.
- No status conditions (burn, sleep, etc.) or abilities in battle.
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
```

The confirmed team is saved in `localStorage` under `pokemonTeam`, and the select screen fires a `team:confirmed` event. Opening `battle.html` directly with no saved team gives you a random party.

## Credits

- Data, sprites and cries: [PokéAPI](https://pokeapi.co/) and the [PokeAPI/sprites](https://github.com/PokeAPI/sprites) repository
- Animation: [GSAP](https://gsap.com/)
- Fonts: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) and [Rubik](https://fonts.google.com/specimen/Rubik)
