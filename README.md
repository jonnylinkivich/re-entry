# RE-ENTRY

A neon arcade shooter with an 8-bit dive. Open space is a huge empty map (6.4M × 4.8M, linear 200× the old 32k × 24k field) with **no gravity** — caverns are thrust-only too. Cinder is unlocked. Fly in, press **E**, survive the cavern, and beat the planet boss for the key to the next world. Dock **Hab-7** in open space to spend banked credits on gear. Full engines cross the long axis in about five minutes.

## Overnight 2026-10-27

Smoke is green on `main` through #23 (`327702c`). Open `http://localhost:47331/?playtest=1` and walk the checklists in [PLAYTEST.md](PLAYTEST.md#overnight-2026-10-27).

- **6.4M map** (#9) — 6.4M × 4.8M field, planet splash, chart fog, void folds. Engines Mk 5 crosses the long axis in about 5 minutes.
- **Hab-7 sections** (#10) — Weapons, Engines, Hull, Consumables.
- **Combo** (#11) — sits under the score, clear of the objective pill.
- **Upgrade VFX** (#12) — shield ring, gun trails, pet glow.
- **Music + mute** (#13, #16) — neon bed after Begin. Shot, hull, scrap/sip, shop, and void-fold stings follow `M`.
- **36 salvage beacons** (#14) — orange **SCRAP** and cyan **SIP**.
- **PLAYTEST sync** (#15) — severity notes match what already shipped.
- **Void telegraph** (#17) — edge swirl and a ring pulse before the grab.
- **Death / respawn** (#18) — shatter on hull breach, neon pop on return.
- **Title / Begin** (#19) — brighter title glow, pulsing Begin chip.
- **Shaft neon** (#20) — cyan and orange stroke on the first-dive shaft.
- **Low-fuel pulse** (#21) — cavern fuel chip pulses under 20%.
- **Rock silhouettes** (#22) — spike, splinter, and kite.
- **Pause / chart** (#23) — solid pause plate. Chart labels **SCRAP**, **SIP**, and **VOID-FOLD**.

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

The camera follows you across a 6.4M × 4.8M field (linear 200× the old 32k axes). Drawing is camera-local, so zoomed-in flight far from the origin does not shimmer in canvas float32. Space is zero-g with no proximity wells. Rocks spawn near the ship (capped) and can drop credits, guns, energy cells, and a shooting pet. Eight planets sit far apart: **Cinder**, **Rime**, **Mycel**, **Vesper**, then **Ashen**, **Brine**, **Thorn**, **Helix**. **Hab-7** floats northeast of Cinder — fly near it and press **E** to dock. You start near Cinder but outside its re-entry halo — follow the nav arrow. Later planets stay locked until you hold the previous world's key.

Stock cruise is 8800 u/s (the old 880 u/s, scaled with the map). Hab-7 sells **Engines Mk 1–5** (45 CR each). Mk 5 is `SPACE_W / 300` (about 21,333 u/s), so holding thrust crosses the long axis in five minutes. Earlier marks stay slower, with the same crossing times they had on the 640k chart.

To check empty space: Begin, confirm there is no “Re-enter Cinder” prompt, zoom out (planets are sparse dots), and fly away from Cinder. No gravity pull. The HUD arrow still points at Cinder. Travel to Rime is a long empty-space run. Hab-7 is the cyan diamond on the radar (marked **H**).

### Planets

Each planet is its own cavern. No down-pull — thrust-only flight, like Sub-Terrania without gravity. Thrust burns a small fuel tank. Ore stays in the hold until you launch (full bank) or call the rescue beam (salvage rate, 50% to start, plus a credit fee).

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

Dock in open space (not a cavern). Spend banked credits — and dive cargo if you somehow still hold any — on Twin (35), Spread (45), Rapid (40), Engines Mk 1–5 (45 each), a wingman (50, cap 2), fuel tank +15 (30), energy cell +15 (28), salvage 75%/100% (55/80), energy refill (12), and a cheap fuel top-off (8). Engines raise space cruise only. Mk 5 is about 21333 u/s, a 5-minute burn along the 6,400,000-wide field. Stock is 8800 u/s. Broke rows show how many credits are missing. Esc or Leave undocks. Purchases write into `reentry-save`.

Keys, tank size, salvage rate, credits, shop loadout (guns / pets / engines), and high score persist in `localStorage` (`reentry-save`, migrated from old `drift-*` keys).

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
