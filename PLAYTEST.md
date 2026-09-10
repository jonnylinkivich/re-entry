# RE-ENTRY playtest

Build first (`npm run build`). **Production (what players get):** `npm run preview` → `http://localhost:47331` (tmux `re-entry-preview` / `re-entry-dev`). Dev: `npm run dev` on a free port — do not steal 47331 from preview during a load test.

Hold `W`/`A`/`D` — tapping thrust does nothing useful. After **Begin re-entry**, keys register without an extra canvas click (`ab18e9e` + Enter/Space no longer double-`start()`).

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

## Loop checks

1. **Menu → space**  
   Begin re-entry. You spawn **near Cinder but outside** the re-entry halo — no `Re-enter Cinder — E` on frame 1. HUD shows energy bar, objective **Defeat Ember Warden**. Nav arrow + distance still point at Cinder. Zoom out: planets are sparse dots on a 640k × 480k map. Radar shows eight planet discs plus Hab-7’s cyan diamond (**H**). Fly away — **no gravity** in open space (no proximity well).

2. **Gate prompt**  
   Long travel to Rime (empty space). Without a key, up close: `RIME LOCKED — need Cinder Key`. `E` must not start a dive. Same style for later worlds (`ASHEN LOCKED — need Vesper Key`, etc.).

3. **Cinder dive**  
   Approach Cinder, `E` (or click). 8-bit re-entry cine, then cavern. Fuel bar appears. Caverns are thrust-only (no down-pull). Hold `Shift`: shield ring, energy drains. Collect **O** ore (cargo HUD ticks up, credits do not bank yet) and **F** fuel / **E** energy.

4. **Boss**  
   Follow the dashed nav line / radar pip / edge marker to **Ember Warden** (lower-right chamber). Shoot until it dies. Banner grants **Cinder Key**; tank chip grows. Re-visiting Cinder must not respawn the boss.

5. **Launch vs rescue**  
   - Shaft + `E`: banks **100%** of dive cargo into credits.  
   - Burn fuel to 0 (idle ~0.6/s or thrust ~9/s) → prompt `Stranded — R rescue beam (15 CR)`. `R` plays Rescue Beam cine, banks salvage (50% until Rime/Mycel upgrades), subtracts up to 15 CR, **no life lost**.  
   - A hit at fuel 0 auto-rescues instead of hull-breach. A hit with fuel remaining still says **HULL BREACH** (not RE-ENTRY).

6. **Next planets**  
   After Cinder Key, Rime opens. Repeat: Frost Crown → Rime Key + 75% salvage. Sporeheart → Mycel Key + 100% salvage. Night Veil → Vesper Key → **Ashen**. Then Ash Colossus → Brine, Tide Serpent → Thorn, Bramble King → Helix, Coil Warden is the finale. Original four-world loop still verifies the same way.

7. **Persist**  
   Refresh. Credits, keys, tank, salvage, shop guns/pets, high score remain (`reentry-save`).

8b. **Hab-7 dock**  
   Find the cyan diamond on the minimap (northeast of Cinder). Fly near Hab-7 → HTML prompt `Dock station — E`. `E` or click opens the neon shop overlay. Prices show; broke rows name the missing credits. With `?playtest=1` (80 CR) buy Twin (35) or a tank (30). Esc / Leave returns to space; WASD / Space still work. Station stays in space when you dive.

8. **Soft-lock**  
   Locked planet always names the missing key. Re-entry is the HTML `#prompt` only — no canvas `{name} · E`. Combo `xN` sits under the top HUD.

9. **Empty space / large map**  
   Map is **640000 × 480000** (20× the old 32k axes, 400× area). Eight planets: Cinder → Rime → Mycel → Vesper → Ashen → Brine → Thorn → Helix (each needs the previous key).  
   - Begin: no re-entry prompt.  
   - Zoom out (`ZOOM_MIN` 0.015): several planet dots + lots of void. Radar shows all eight plus Hab-7’s diamond.  
   - Fly away from Cinder: ship coasts with **no gravity**. HUD arrow still names Cinder + distance.  
   - Reach another world only after a long empty-space run. Re-entry prompt appears only in a local halo.

---

## Session notes (ad capture, live HUD)

Recorded against the running Vite server on `:47331` (`?playtest=1`) while the progression-loop agent was landing. Captures include **Ember Warden**, fuel/energy meters, **TANK / SALVAGE**, **STRANDED — R RESCUE BEAM**, and the 8-bit RE-ENTRY cine.

### Space

- Ship starts near orange **Cinder** but **outside** the local re-entry halo (`SPAWN_CLEARANCE` 2200 from the surface, `REENTRY_RANGE` 520). Wave rocks spawn 900–3100px out; at default/zoom-out they read as tiny outlines, not a dogfight.
- Re-entry callout is the HTML `#prompt` pill only. `drawNavMarker` no longer draws `{name} · E` on-planet (that used `14 / zoom` in screen space and exploded at `ZOOM_MIN`). Off-screen nav arrow + distance stay. Planet names in `drawPlanets` use a screen-pixel font cap.
- `HULL BREACH` banner is the right death sting (no longer “RE-ENTRY”).
- Objective **DEFEAT EMBER WARDEN** and `Rime LOCKED` are on-screen in space. Good fantasy; they compete with the planet.

### Cinematic

- 8-bit dive is the sell: chunky pixels, **RE-ENTRY / CINDER**, flames, scanlines, `PRESS E TO SKIP`.
- Duration ~3.6s (`cinematic.ts`). `E` / `Space` / `Esc` skip — easy to clip if Space is still held from shooting. Let ~2s+ play.
- HTML HUD (score / objective / tank chips) still composites over the cine unless `hud.hidden` for `cine` is actually applied. Later commits on this branch hide HUD during cine; verify after pull.

### Cavern

- Caverns are thrust-only (no gravity). Fuel is the killer: tanks drain fast, **STRANDED — R RESCUE BEAM (15 CR)** is a strong moment.
- Ember Warden chamber, dashed lock, radar pip, loot (ore / fuel / weapons), Twin/Shield chips, combo `x3` all showed up in captures.
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
- Combo is styled (`#combo` in `style.css`) but easy to miss under the objective pill.
- Credits bank on launch/rescue and spend at Hab-7.

### Performance

- Canvas 640k×480k starfield (stars are screen-space) + cavern tiles. Rocks still spawn near the ship (`MAX_ROCKS` 40).

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
| Cine skip from held Space | `game.ts` `key()` — `Space` skips cine. Clear `keys` / ignore held Space for ~0.4s when `beginReentry` starts. |
| Fuel scramble vs climb fantasy | `meta.ts` `FUEL_THRUST` / idle drain vs `tankMax()` 40. Easy to strand before Ember Warden without `?playtest=1`. Either a shaft fuel pad or a first-dive tank bump. |
| Combo vs objective overlap | `style.css` `#combo` `top: 72px` sits under `#objective`. |
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
2. **Planet approach** — dashed nav, HTML re-entry pill.
3. **E cinematic** — chunky pixels, planet name, flames (~3.7s, not skipped immediately).
4. **Cavern combat / fuel scramble** — Ember Warden lock, loot, Twin/Shield, fuel bar.
5. **Launch to space** — shaft / `OPEN SPACE` return to Cinder.

Gap: space shooting never fills the frame; zoom-in loses rocks. Cavern + cine carry the ad.
