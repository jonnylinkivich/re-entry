# RE-ENTRY

A neon arcade shooter with an 8-bit dive. Open space is a huge map. Cinder is unlocked. Fly in, press **E**, survive the cavern, and beat the planet boss for the key to the next world.

## Play

- **Turn** with `A` / `D`. The nose is thrust-forward — `W` flies that way, `S` reverses
- **Shoot** with `Space`, a click, or Fire (touch)
- **Shields** with `Shift` — drains a separate energy pool (refill from `E` pickups)
- **Re-enter / launch** with `E` when the prompt appears, or click a nearby unlocked planet
- **Rescue beam** with `R` if you run out of fuel in a cavern (or it auto-fires on a would-be death)
- **Mute** with `M`
- **Scroll** to zoom. Radar (bottom left) marks the living boss
- **Pause** with `Esc`

### Space

The camera follows you across a 32k × 24k field. Rocks can drop credits, guns, energy cells, and a shooting pet. Four planets sit far apart: **Cinder**, **Rime**, **Mycel**, **Vesper**. Later planets stay locked until you hold the previous world's key.

### Planets

Each planet is its own cavern. Gravity pulls you down. Thrust burns a small fuel tank. Ore stays in the hold until you launch (full bank) or call the rescue beam (salvage rate, 50% to start, plus a credit fee).

### Bosses & keys

| Planet | Boss | Drop |
| --- | --- | --- |
| Cinder | Ember Warden | Cinder Key → unlocks Rime, larger fuel tank |
| Rime | Frost Crown | Rime Key → unlocks Mycel, salvage 75% |
| Mycel | Sporeheart | Mycel Key → unlocks Vesper, salvage 100% |
| Vesper | Night Veil | Final clear, largest tank |

Keys, tank size, salvage rate, credits, and high score persist in `localStorage` (`reentry-save`, migrated from old `drift-*` keys). Guns persist space ↔ planet within a run.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:47331`).

```bash
npm run build
npm run preview
```

builds a static site into `dist/`.

See [PLAYTEST.md](PLAYTEST.md) for a verification checklist.
