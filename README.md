# RE-ENTRY

A neon arcade shooter with an 8-bit dive. Open space is a huge empty map (640k × 480k, 400× the old 32k × 24k area) with **no gravity** until you hug a planet. Cinder is unlocked. Fly in, press **E**, survive the cavern, and beat the planet boss for the key to the next world. Dock **Hab-7** in open space to spend banked credits on gear.

## Play

- **Turn** with `A` / `D`. The nose is thrust-forward — `W` flies that way, `S` reverses
- **Shoot** with `Space`, a click, or Fire (touch)
- **Shields** with `Shift` — drains a separate energy pool (refill from `E` pickups)
- **Re-enter / launch / dock** with `E` when the prompt appears, or click a nearby unlocked planet / Hab-7
- **Rescue beam** with `R` if you run out of fuel in a cavern (or it auto-fires on a would-be death)
- **Mute** with `M`
- **Scroll** to zoom. Radar (bottom left) marks planets, Hab-7 (diamond + H), and the living boss
- **Pause** with `Esc`. Esc also closes the station shop

### Space

The camera follows you across a 640k × 480k field (20× the old 32k axes, 400× area). Linear 200× (6.4M × 4.8M) jitters in canvas float32 when zoomed in, so 640k is the stable cap. Deep space is zero-g; a short well only pulls inside about two planet radii. Rocks spawn near the ship (capped) and can drop credits, guns, energy cells, and a shooting pet. Eight planets sit far apart: **Cinder**, **Rime**, **Mycel**, **Vesper**, then **Ashen**, **Brine**, **Thorn**, **Helix**. **Hab-7** floats northeast of Cinder — fly near it and press **E** to dock. You start near Cinder but outside its re-entry halo — follow the nav arrow. Later planets stay locked until you hold the previous world's key.

To check empty space: Begin, confirm there is no “Re-enter Cinder” prompt, zoom out (planets are sparse dots), and fly away from Cinder. No gravity pull. The HUD arrow still points at Cinder. Travel to Rime is a long empty-space run. Hab-7 is the cyan diamond on the radar (marked **H**).

### Planets

Each planet is its own cavern. Gravity pulls you down. Thrust burns a small fuel tank. Ore stays in the hold until you launch (full bank) or call the rescue beam (salvage rate, 50% to start, plus a credit fee).

### Bosses & keys

| Planet | Boss | Drop |
| --- | --- | --- |
| Cinder | Ember Warden | Cinder Key → unlocks Rime, larger fuel tank |
| Rime | Frost Crown | Rime Key → unlocks Mycel, salvage 75% |
| Mycel | Sporeheart | Mycel Key → unlocks Vesper, salvage 100% |
| Vesper | Night Veil | Vesper Key → unlocks Ashen |
| Ashen | Ash Colossus | Ashen Key → unlocks Brine |
| Brine | Tide Serpent | Brine Key → unlocks Thorn |
| Thorn | Bramble King | Thorn Key → unlocks Helix |
| Helix | Coil Warden | Final clear |

### Hab-7 shop

Dock in open space (not a cavern). Spend banked credits — and dive cargo if you somehow still hold any — on Twin (35), Spread (45), Rapid (40), a wingman (50, cap 2), fuel tank +15 (30), energy cell +15 (28), salvage 75%/100% (55/80), energy refill (12), and a cheap fuel top-off (8). Broke rows show how many credits are missing. Esc or Leave undocks. Purchases write into `reentry-save`.

Keys, tank size, salvage rate, credits, shop loadout (guns / pets), and high score persist in `localStorage` (`reentry-save`, migrated from old `drift-*` keys).

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
