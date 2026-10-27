# RE-ENTRY playtest

Build first (`npm run build`). **Production (what players get):** `npm run preview` → `http://localhost:47331` (tmux `re-entry-preview` / `re-entry-dev`). Dev: `npm run dev` on a free port — do not steal 47331 from preview during a load test.

Hold `W`/`A`/`D` — tapping thrust does nothing useful. After **Begin re-entry**, keys register without an extra canvas click (`ab18e9e` + Enter/Space no longer double-`start()`).

---

## Large map

Open space is **6,400,000 × 4,800,000** (`MAP_SCALE` 10 on the old 640k × 480k chart, linear 200× the original 32k × 24k field). Planet and Hab-7 positions are that same chart times 10, so hops stay sparse instead of a cluster in a void. The minimap divides by `SPACE_W` / `SPACE_H`, so the radar still shows the whole field.

The camera renders in **local space**. Each frame snaps the camera to a device pixel, subtracts that origin from world coordinates in float64, and sets a zoom-only canvas transform. The float32 matrix never stores a multi-million translation, which is what shimmered at `ZOOM_MAX` on a 6.4M map.

### Cruise math

```
Mk 5 cap = SPACE_W / 300 = 21333.3 u/s
stock    = 880 * MAP_SCALE = 8800 u/s
```

Hab-7 still sells Engines Mk 1–5 at 45 CR each (`engines` 0..5). The ladder is the 640k chart scaled by `MAP_SCALE`, so crossing times match the old field: stock ~727s (12.1 min), Mk 5 exactly **300s**. Thrust scales from 360 u/s² at 880 u/s, and space drag stays 0.32, so a held burn sits on the cap. `?playtest=1` flies at Mk 5 for that run and does **not** write `engines` into `reentry-save`. Cavern thrust and cave top speed are unchanged. Bullets inherit ship velocity so shots still leave the nose while cruising. Pets match cruise velocity in open space.

`SPAWN_CLEARANCE` is **16000** (not ×10). That is about 1.8s of base thrust outside the re-entry halo, so Begin still drops you beside Cinder. Intro zoom is `0.34 / MAP_SCALE` (0.034): on a 1280px window Cinder and a boosted ship glyph share the first frame. Zoom floor is `0.008 / MAP_SCALE` (0.0008). Rock waves spawn a couple of seconds out at the current cruise, capped by the view, and never use the full world as a spawn radius.

### Verify

1. `npm run build`, then `npm run preview`. Open `http://localhost:47331/?playtest=1`.
2. Begin. No re-entry prompt on frame 1. Nav still names Cinder. Radar shows eight planet discs and Hab-7’s cyan diamond (**H**). Minimap is the whole field, not a corner.
3. Console: `reentryCruise()`. `seconds` is **300**, `engines` is **5**, `longAxis` is **6400000**.
4. `reentryWarpEdge()` parks you on the west edge already at full cruise, nose east. Hold `W`. Crossing to the east edge is about five minutes (±20%, a short accel at the start). Let go of `W` and speed should fall off in a couple of seconds.
5. Jitter: `reentryPlace(5800000, 2400000)`, then scroll-zoom in (toward `ZOOM_MAX` 3.6) and hold `W`. The ship stays centered and solid — no shimmer, stair-step, or whole-scene wobble. The same pass near the origin (`reentryPlace(200, 2400000)`) should look identical. Nebula color should scroll, not quantize.
6. Without `?playtest=1`, a fresh save shows Engines Mk 1 at Hab-7 (45). Each buy persists `engines` (0–5) in `reentry-save`. Stock cruise is 8800 u/s; Mk 5 matches the 300s number.

---

## Planet splash, chart, void folds

Same branch as the large map. Hab-7 and the key chain are unchanged: a locked world still refuses the dive, and the shop is still the cyan diamond.

### Splash

Pressing `E` on an open planet plays a branded card first, then the existing 3.6s dive. The card uses the void background (`#000108`), cyan `RE-ENTRY`, and the planet’s accent from `PLANETS` (Cinder is `#ff6b3d`). It ends on its own in **1.25s**. `E`, `Space`, `Esc`, or a click/tap skips one stage: splash → dive, then dive → cavern. It does not wait on input.

### Chart

Open space is a 40×30 bitset (cells of 160000²). The ship’s cell lights when you cross it, and entering a planet records that id. Both live on `reentry-save` (`visited`, `visitedPlanets`) and survive reload and a new run. The minimap paints visited cells in faint cyan and leaves the rest dark. Planets, Hab-7’s diamond, the nav line, and void rings stay drawn on top, so a locked world is still findable. `Esc` in space swaps the corner radar for a larger **CHARTED** panel with the same fog.

### Void folds

Eight seeded blackholes (`mulberry` 4242), kept about 700000 apart and clear of planet centers and Hab-7. The core is a small black disc with magenta and cyan arcs. Radar marks are hollow magenta rings, distinct from planet discs and the Hab-7 diamond. Flying into the well (pull ~7200, capture ~1600, swept so a fast frame cannot skip the core) plays a short pull, then **VOID FOLD** drops you on the rim of the farthest other hole, outside planet solids and Hab-7, with nearby rocks cleared. A full-cruise graze of the outer rim can still slip past; aiming at the core, or coasting in the well, folds. A ~3.2s lock and a small outward shove stop an instant recapture. They stay landmarks on the 6.4M map.

### Verify

1. `npm run build`, then preview `http://localhost:47331/?playtest=1&unlock=1`.
2. Splash: fly into Cinder’s halo, press `E`. Card reads **RE-ENTRY** / **CINDER** in Cinder’s orange, scanlines, hint `E SPACE CLICK`. Wait — the dive starts by itself in about a second. Repeat on Rime (blue `#9ad8ff`). From the card, `E` or a canvas click jumps to the dive; a second `E` or click enters the cavern. Objective and the key chain still match the world you entered.
3. Chart: after Begin, the spawn cell on the minimap is lit and the rest of the field is dark. Fly a straight burn for several seconds — a trail of cells lights behind you. Planets and the **H** diamond stay visible on dark cells. `Esc`: the **CHARTED** panel shows the same trail. Enter Cinder, then reload the page and Begin again. `reentryChart()` still reports `cells` > 1 and `planets` includes `"cinder"`. A fresh profile with no `visited` key starts dark except the new spawn cell.
4. Void folds: `reentryHoles()` returns 8 points inside the map. `reentryFold(0)` parks you in a well (intro zoom, nose toward the core). Wait or tap thrust — speed bends in, sparks pull magenta/cyan, then the banner **VOID FOLD** and you are beside a different hole, not inside a planet and not on Hab-7. The minimap shows a hollow magenta ring at each hole, including on unvisited cells. Flying the empty field away from those rings still coasts with no general gravity.

---

## Load / Restart (production playtest, 2026-09-10)

Nick: load felt slow and the game “restarts.” Timed against a **production** `vite preview` on `:47331` (not Vite HMR). `npm run build` **green** (`tsc && vite build`, wall ~1.1–1.3s).

### Timings

| Step | Time | Notes |
| --- | --- | --- |
| `npm run build` | **1.11–1.33s** wall | Vite transform 84–212ms |
| `dist/` JS | **73.4 kb** (gzip **23.8 kb**) | CSS 7.9 kb / gzip 2.4 kb. Not a 200× inlined map — caverns generate on dive (`Uint8Array`). Was ~40kb on main; growth is bosses / shop / 8 worlds, still tiny. |
| Cold preview → interactive **menu** | **64 ms** | Headless Chrome, cache disabled. `loadEvent` 45ms. HTML TTFB ~7ms. |
| Begin click → first play frame | **57 ms** | Overlay hidden, HUD, ship, `SPACE · W1`, `CINDER AHEAD`. |
| Cold `npm run dev` → “ready” | **152 ms** (Vite) | Throwaway `:47332` first `game.ts` transform **18 ms** / 252 kb. Process start is not the slowness. |
| Favicon / SW | favicon **200** 445 B | **No service worker.** `navigator.serviceWorker.controller` = none. |

### What “restart” was

**Real, production-path (fixed in `2536ac0`):** Enter or Space on the focused **Begin re-entry** button fired `keydown` → `game.start()` **and** the button `click` → `beginRun()` → `start()` again. The run spawned, then immediately reset (new rocks, second `CINDER AHEAD`, `sfxWave` twice). That is a soft reboot, not a document reload.

**Real, DEV-only (not a game bug):** Shared `:47331` Vite **dev** HMR. While sibling agents saved `src/game.ts`, the pane logged `page reload src/game.ts (x2)`. Full document reload, Vite overlay, websocket drop. Feels like the game “restarts.” Preview has no HMR. **Leave preview on 47331** so Nick is not sitting on a live-reloading dev server.

**Not reproduced on production preview:**

- Multi-reload / 404 loop (`base: "./"` assets `200`, JS 73 kb `text/javascript`)
- Vite overlay (prod HTML has no `/@vite/client`)
- Save wipe (`reentry-save` / high score 7500 survived the cavern pass)
- Auto re-entry cine on spawn (halo still outside `SPAWN_CLEARANCE`)
- Death → retry loop / wall slam every 2s
- Double canvas/audio boot after the rAF cancel + `start()` 500ms guard
- `localStorage` every frame (`saveMeta` on mute / bank / shop only)
- `fit()` resize loop (`overflow: hidden`, overlay is position absolute)

`6c4df38` already keeps `requestAnimationFrame` alive if one `update`/`draw` throws (freeze used to look like a dead reboot).

### Human pass (preview, ~30s recorded + cavern still)

Menu → Enter Begin (single start) → hold W toward Cinder → E cine ~1–2s (`RE-ENTRY` / `CINDER`, scanlines) → cavern (fuel/energy, Ember Warden lock, `LAUNCH TO SPACE — E`). Keys worked without a canvas click. Space dogfight still reads small (P1). Touch pads not exercised (`pointer: fine`).

### Artifacts

| File | What |
| --- | --- |
| `/opt/cursor/artifacts/load_and_first_minute.mp4` | Cold menu → Begin → space → cine → cavern (~30s, 1920×1200) |
| `/opt/cursor/artifacts/playtest_cold_menu.png` | Production menu + Begin |
| `/opt/cursor/artifacts/playtest_space.png` | Ship + Cinder + HUD after Begin |
| `/opt/cursor/artifacts/playtest_cine.png` | 8-bit RE-ENTRY / CINDER |
| `/opt/cursor/artifacts/playtest_cavern.png` | Cinder cavern + launch prompt |

### Code

Fixed on this branch (do not revert map/station/perf/crash-loop work):

- `beginRun` no-ops if already `play`/`cine`; Enter/Space on a focused button does **not** also call `game.key`
- `start()` ignores a second call within 500ms while already playing
- Cancel a leftover `requestAnimationFrame` if the module evaluates twice (HMR)
- `unlockAudio` returns immediately when the context is already `running`

---

## Optional query flags

Run-local, not required for a real playthrough:

- `?playtest=1` — larger fuel/energy for the run, at least 80 credits so Hab-7 has something to sell; also exposes `reentryWarpStation()` in the console
- `?unlock=1` — treat all eight planet keys as owned so later worlds open
- Combine: `http://localhost:47331/?playtest=1`

## Controls (must still work)

`A`/`D` turn · `W`/`S` thrust · `Space` shoot · `E` re-enter/launch/dock · `Shift` shield · `R` rescue when stranded · `Esc` pause / close shop · `M` mute

Hold `W`/`A`/`D` — tapping thrust does nothing useful. Canvas focus is grabbed on Begin — no extra click needed.

## Checklist — stick, prompt pulse, engines

- **Virtual stick** (`#pads`, visible in play): drag inside the cluster. A small deadzone at the center does not thrust or turn. Straight up on Thrust is a full burn with no turn; L or R alone is a full turn. A diagonal (thrust plus L or R) does both, but the vector is normalized so you do not get full thrust and full turn at once. Keyboard `A` / `D` / `W` / `S` stay digital — full axis, no deadzone — and win if held together with the stick.
- **Prompt pulse**: fly into Cinder’s re-entry halo, Hab-7’s dock halo, or a cavern exit shaft. The first moment `#prompt` shows `Re-enter … — E`, `Dock station — E`, or `Launch to space — E`, the pill flashes brighter twice (orange, or cyan for dock), then falls back to the slow neon pulse. Locked-planet text and the stranded line do not flash. Leaving and re-entering the halo flashes again.
- **Engines levels**: dock Hab-7. The row is **Engines Mk 1** through **Mk 5**, 45 CR each. It persists on `reentry-save` as `engines` (0–5) and shows a `Mk N` chip after the first buy. Each level raises space cruise only (cavern speed stays 390). `?playtest=1` starts with 80 CR, enough for one level. The maxed row reads Maxed.
- **Cross-map time at max engines**: the long axis is `SPACE_W` 6400000. Full engines (Mk 5) cap speed at `6400000 / 300 ≈ 21333 u/s`, so a straight burn across that axis is about **5 minutes**. Level 0 is 8800 u/s (about 12.1 minutes) — the old 880 u/s ladder, scaled with the map. Space thrust scales with the cap so the 0.32 drag term does not hold you under it.
- **Hold Space**: holding Space (or the Fire pad) keeps firing. With Rapid feeder owned, the cooldown is 0.07s; without it, 0.17s.

## Checklist — Hab-7 shop visual

Dock with `?playtest=1` (`reentryWarpStation()` then `E`). Same catalog and prices — this pass is only how the overlay reads.

- **Station mark**: above the HAB-7 title, a small canvas draws the station (cyan ring, orange dock arms, gold core) on `#000108`. No extra image in the bundle.
- **Sections**: **Weapons** (twin, spread, rapid, wingman), **Engines** (Mk 1–5), **Hull** (fuel tank, energy cell, salvage beacon), **Consumables** (energy refill, fuel top-off). Weapons and Hull headers are cyan `#7ee7ff`; Engines and Consumables are orange.
- **Owned**: cyan **Owned** chip, buy control disabled (guns you already have, wingman at the pet cap, salvage at 100%).
- **Maxed**: orange **Maxed** chip (Engines Mk 5, tank or cell at 200, fuel or energy already full).
- **Broke**: **Broke** chip and the existing `Need N more CR` line in the miss color. A ready row still shows the gold price and a cyan **Buy**.

## Checklist — upgrade neon

Visual only. Same shop rows, prices, and speeds. Own the gear at Hab-7 (or pick it up), then look at the ship.

- **Shield**: an owned energy cell (Hull) draws a low-alpha cyan ring around the ship. Holding `Shift` raises that bubble while energy lasts. A shielded hit pulses the ring once; the ship still blinks.
- **Guns**: Twin, Spread, or Rapid shots leave a short `#7ee7ff` trail with an orange muzzle stroke. The stock gun stays a plain bolt.
- **Pet**: a wingman drone keeps its green silhouette and gains a faint neon glow so it stays readable at cruise.

## Loop checks

1. **Menu → space**  
   Begin re-entry. You spawn **near Cinder but outside** the re-entry halo — no `Re-enter Cinder — E` on frame 1. HUD shows energy bar, objective **Defeat Ember Warden**. Nav arrow + distance still point at Cinder. Zoom out: planets are sparse dots on a 6.4M × 4.8M map. Radar shows eight planet discs, hollow magenta void rings, and Hab-7’s cyan diamond (**H**). Away from a void fold the ship coasts — open space has no general gravity. The spawn cell on the minimap is lit; the rest of the chart is dark.

2. **Gate prompt**  
   Long travel to Rime (empty space). Without a key, up close: `RIME LOCKED — need Cinder Key`. `E` must not start a dive. Same style for later worlds (`ASHEN LOCKED — need Vesper Key`, etc.).

3. **Cinder dive**  
   Approach Cinder, `E` (or click). Branded splash (~1.25s, Cinder accent, skip with `E` / `Space` / click), then the 8-bit re-entry cine, then the cavern. Fuel bar appears. Caverns are thrust-only (no down-pull). Hold `Shift`: shield ring, energy drains. Collect **O** ore (cargo HUD ticks up, credits do not bank yet) and **F** fuel / **E** energy.

4. **Boss**  
   Follow the radar pip / edge marker to **Ember Warden** (lower-right chamber). There is no dashed world-nav line. Shoot until it dies. Banner grants **Cinder Key**; tank chip grows. Re-visiting Cinder must not respawn the boss.

5. **Launch vs rescue**  
   - Shaft + `E`: banks **100%** of dive cargo into credits.  
   - Burn fuel to 0 (idle ~0.6/s or thrust ~9/s) → prompt `Stranded — R rescue beam (15 CR)`. `R` plays Rescue Beam cine, banks salvage (50% until Rime/Mycel upgrades), subtracts up to 15 CR, **no life lost**.  
   - A hit at fuel 0 auto-rescues instead of hull-breach. A hit with fuel remaining still says **HULL BREACH** (not RE-ENTRY).

6. **Next planets**  
   After Cinder Key, Rime opens. Repeat: Frost Crown → Rime Key + 75% salvage. Sporeheart → Mycel Key + 100% salvage. Night Veil → Vesper Key → **Ashen**. Then Ash Colossus → Brine, Tide Serpent → Thorn, Bramble King → Helix, Coil Warden is the finale. Original four-world loop still verifies the same way.

7. **Persist**  
   Refresh. Credits, keys, tank, salvage, shop guns/pets, high score, charted cells, and entered planets remain (`reentry-save`, including `visited` and `visitedPlanets`).

8b. **Hab-7 dock**  
   Find the cyan diamond on the minimap (northeast of Cinder). Fly near Hab-7 → HTML prompt `Dock station — E`. `E` or click opens the neon shop overlay. Prices show; broke rows name the missing credits. With `?playtest=1` (80 CR) buy Twin (35) or a tank (30). Esc / Leave returns to space; WASD / Space still work. Station stays in space when you dive.

8. **Soft-lock**  
   Locked planet always names the missing key. Re-entry is the HTML `#prompt` only — no canvas `{name} · E`. Combo `xN` sits under the score cluster, clear of the objective pill and the mute chip.

9. **Empty space / large map**  
   Map is **6400000 × 4800000**. Eight planets: Cinder → Rime → Mycel → Vesper → Ashen → Brine → Thorn → Helix (each needs the previous key). See **Large map** above for the 5-minute cruise and the jitter check.  
   - Begin: no re-entry prompt.  
   - Zoom out (`ZOOM_MIN` 0.0008): planet pips + lots of void. Radar shows all eight plus Hab-7’s diamond.  
   - Fly away from Cinder, clear of the magenta rings: ship coasts with **no general gravity**. HUD arrow still names Cinder + distance. A void fold is a local well only (see **Planet splash, chart, void folds**).  
   - Reach another world only after a long empty-space run. Re-entry prompt appears only in a local halo.  
   - Zoom in far from the origin: no camera wobble.

---

## Session notes (ad capture, live HUD)

Recorded against the running Vite server on `:47331` (`?playtest=1`) while the progression-loop agent was landing. Captures include **Ember Warden**, fuel/energy meters, **TANK / SALVAGE**, **STRANDED — R RESCUE BEAM**, and the 8-bit RE-ENTRY cine.

### Space

- Ship starts near orange **Cinder** but **outside** the local re-entry halo (`SPAWN_CLEARANCE` is 16000 from the surface now, `REENTRY_RANGE` 520). Wave rocks spawn a couple of seconds out at the current cruise, not across the whole map. At intro zoom they read as small outlines until you zoom in.
- Re-entry callout is the HTML `#prompt` pill only. `drawNavMarker` no longer draws `{name} · E` on-planet (that used `14 / zoom` in screen space and exploded at `ZOOM_MIN`). Off-screen nav arrow + distance stay. Planet names in `drawPlanets` use a screen-pixel font cap.
- `HULL BREACH` banner is the right death sting (no longer “RE-ENTRY”).
- Objective **DEFEAT EMBER WARDEN** and `Rime LOCKED` are on-screen in space. Good fantasy; they compete with the planet.

### Cinematic

- 8-bit dive is the sell: chunky pixels, **RE-ENTRY / CINDER**, flames, scanlines, `PRESS E TO SKIP`.
- Duration ~3.6s (`cinematic.ts`). `E` / `Space` / `Esc` skip — easy to clip if Space is still held from shooting. Let ~2s+ play.
- HTML HUD (score / objective / tank chips) still composites over the cine unless `hud.hidden` for `cine` is actually applied. Later commits on this branch hide HUD during cine; verify after pull.

### Cavern

- Caverns are thrust-only (no gravity). Fuel is the killer: tanks drain fast, **STRANDED — R RESCUE BEAM (15 CR)** is a strong moment.
- Ember Warden chamber, radar pip, loot (ore / fuel / weapons), Twin/Shield chips, combo `x3` all showed up in captures. The dashed world-nav stroke is gone.
- Climb/launch is possible from the entry shaft (`LAUNCH TO SPACE — E (BANK CARGO)`). Hero includes an **OPEN SPACE** return after a shaft `E`. Full “fly the whole shaft on a dry tank” is still easy to fail — rescue is the intended out.
- `populateCavern` now stores a `diveHolds` snapshot so loot is not restacked every visit (fixed vs original P0).

### Audio

- SFX: thrust, shots, re-entry rumble, pickups. `M` mute is wired (`audio.ts` `toggleMuted` + `game.ts` `KeyM`).
- No music bed. Mute has no HUD icon (banner only).

### Mobile / touch

- Coarse pointer (`matchMedia("(pointer: coarse)")`, hidden on `pointer: fine`): `#pads` Turn L / Thrust / Turn R / Rev plus `#fire`. Wired to the same `keys` Set as `A/D/W/S` and `setFire`. Keyboard still works on desktop.
- Click-to-dive a nearby planet works on mouse.

### Juice / UX

- Cine + cavern scanlines + boss nav line are punchy.
- Space combat lacks scale: ship is a few pixels unless you scroll-zoom in, at which point rocks leave frame.
- Combo sits under the score cluster (`#combo` in `style.css`), clear of the centered objective pill and the mute chip. Narrow screens still park the objective at the bottom.
- Credits bank on launch/rescue and spend at Hab-7.

### Performance

- Canvas starfield is screen-space parallax (three depths plus dust) over world-space nebula washes. Rocks still spawn near the ship (`MAX_ROCKS` 40).

---

## Edits by severity

Verified against this branch after the progression-loop land. Original main-branch P0 gravity / mute / death-banner / drift-keys are **done**; remaining items below.

### P0

| Issue | Hint |
| --- | --- |
| Duplicate / oversized re-entry callout | **Fixed.** HTML `#prompt` only. `drawNavMarker` skips the on-planet `{name} · E`. Planet labels use `worldFontPx` (screen pixels, not `14/zoom` in screen space). Off-screen arrow + distance unchanged. |
| No touch thrust/turn | **Fixed.** `#pads` (L / Thrust / R / Rev) + `#fire` on `(pointer: coarse)` only. Pointer hold → `game.key` / `setFire`. Keyboard A/D/W/S/Space unchanged. |

### P1

| Issue | Hint |
| --- | --- |
| Space dogfight doesn’t read | `game.ts` `spawnRock` `away` distance 900–3100. Spawn a closer first wave, or start zoomed in (`zoomWanted`). |
| Cine skip from held Space | **Fixed.** `beginReentry` ignores Space for 0.4s (`reentrySpaceGrace`) and drops held Space so key-repeat cannot skip the sell. E / Esc / Enter still skip immediately. |
| Fuel scramble vs climb fantasy | **Fixed for the first Cinder dive.** Two shaft cans (`+28`) on the carved approach until the Cinder key is owned. `START_MAX_FUEL` / `FUEL_THRUST` unchanged, so later dry tanks still rescue. |
| Combo vs objective overlap | **Fixed.** `#combo` is left-aligned under the score row (`top` clears the HUD and safe area), so it no longer shares the center column with `#objective`. The mute chip stays top-right. Below 640px the objective still drops to the bottom. |
| No spend sink for credits | **Fixed.** Hab-7 shop spends banked credits on guns / pets / tanks / salvage / refills. |
| Mute has no persistent control | `KeyM` works; no button / icon. `setMuted` is used. |

### P2

| Issue | Hint |
| --- | --- |
| No music | `audio.ts` is SFX-only. |
| Mobile is Fire-only | **Fixed** with P0 touch pads (L / Thrust / R / Rev + Fire). |
| No shop for banked credits | **Fixed.** Hab-7 dock / shop overlay. |
| Vite `base` | **Done for relative deploy:** `vite.config.ts` `base: "./"`. Root hosting still works; GitHub Pages project pages should keep `base: '/re-entry/'` or `./`. |

### Fixed since original main playtest (do not re-open)

- Cinder gravity 460 > thrust 360 → **zero gravity** (`cavern.ts` `PLANETS` all `0`; no `ship.vy += gravity` / space well).
- Death banner “RE-ENTRY” → **HULL BREACH**.
- `setMuted` unused → **M** + `toggleMuted`.
- `localStorage` `drift-*` → `reentry-save` / `reentry-highscore` with drift fallback (`meta.ts`).
- Combo unstyled → positioned cyan `#combo`.
- Fuel / energy / rescue / gate / bosses → shipped on this branch.
- `populateCavern` restack → `diveHolds` once per planet per run.

---

## Build / hosting

- `npm run build` (`tsc` + vite) **passed** on this branch after the load/restart pass. `dist` JS **73.4 kb** (gzip 23.8 kb); CSS 7.9 kb. Main was ~40kb — still a small static payload.
- Static hosting: `base: "./"` in `vite.config.ts` — relative asset URLs. Root deploy works. GitHub Pages **project** site still needs `base: '/re-entry/'` if the app is not served from domain root.

---

## Promo artifacts

Punchy cuts (browser chrome cropped). `ad_hero.mp4` / `ad_loop.gif` names were already claimed by a parallel 46s/5s capture, so the **spec’d 720p30 hero and 720px gif** are saved under the `_720` names. `recording_demo.mp4` is the same file as the 720p hero (for review).

| File | What | Specs |
| --- | --- | --- |
| `/opt/cursor/artifacts/ad_hero_720p.mp4` | Punchy hero (hard cuts) | 16.7s, 1280×720, 30fps, H.264 yuv420p, ~1.4MB |
| `/opt/cursor/artifacts/recording_demo.mp4` | Same encode as `ad_hero_720p.mp4` | 16.7s, 1280×720, 30fps, ~1.4MB |
| `/opt/cursor/artifacts/ad_loop_720.gif` | Cine flames → cavern shoot | 6.1s, 720×406, 13fps, palettegen+paletteuse, ~1.6MB |
| `/opt/cursor/artifacts/ad_space_fire.mp4` | Vertical 9:16 space/Cinder | 2.7s, 406×720, 30fps, H.264 yuv420p |
| `/opt/cursor/artifacts/ad_reentry.gif` | Vertical cine | 3.7s, 406×720, 13fps, ~0.9MB |
| `/opt/cursor/artifacts/ad_cavern_vertical.mp4` | Vertical Ember Warden | 4.0s, 406×720, 30fps, H.264 yuv420p |
| `/opt/cursor/artifacts/still_menu.png` | Menu + new loop copy | 1760×916 PNG |
| `/opt/cursor/artifacts/still_cinematic.png` | 8-bit RE-ENTRY / CINDER | 1760×990 PNG |
| `/opt/cursor/artifacts/still_cavern.png` | Cavern + Ember Warden | 1760×990 PNG |

Also on disk (raw / parallel captures, not the punchy edit):

- `/opt/cursor/artifacts/ad_hero.mp4` — 46.4s, 1920×1200, 60fps (~5.0MB), uncropped long take
- `/opt/cursor/artifacts/ad_loop.gif` — 5.3s, 960×540, 8fps (~0.24MB)
- `/opt/cursor/artifacts/raw_space_cine_cavern_run.mp4`
- `/opt/cursor/artifacts/raw_cine_and_cavern.mp4`
- `/opt/cursor/artifacts/raw_cavern_boss_scramble.mp4`

### Hero beat list (`ad_hero_720p.mp4` / `recording_demo.mp4`)

1. **Space** — Cinder, rocks, hull-breach (dogfight is small-scale). Re-entry is the HTML pill only.
2. **Planet approach** — edge arrow + HTML re-entry pill. No dashed nav/gravity line.
3. **E cinematic** — chunky pixels, planet name, flames (~3.7s, not skipped immediately).
4. **Cavern combat / fuel scramble** — Ember Warden lock, loot, Twin/Shield, fuel bar.
5. **Launch to space** — shaft / `OPEN SPACE` return to Cinder.

Gap: space shooting never fills the frame; zoom-in loses rocks. Cavern + cine carry the ad.
