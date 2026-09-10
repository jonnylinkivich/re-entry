# RE-ENTRY playtest

Build first (`npm run build`). Dev server: `npm run dev` → `http://localhost:47331`.

Optional query flags (run-local, not required for a real playthrough):

- `?playtest=1` — larger fuel/energy for the run, at least 40 credits so the rescue fee is payable
- `?unlock=1` — treat Cinder/Rime/Mycel keys as owned so later planets open
- Combine: `http://localhost:47331/?playtest=1`

## Controls (must still work)

`A`/`D` turn · `W`/`S` thrust · `Space` shoot · `E` re-enter/launch · `Shift` shield · `R` rescue when stranded · `Esc` pause · `M` mute

Hold `W`/`A`/`D` — tapping thrust does nothing useful. Click the canvas after **Begin re-entry** so keys register.

## Loop checks

1. **Menu → space**  
   Begin re-entry. HUD shows energy bar, objective **Defeat Ember Warden**, Cinder unlocked. Rime/Mycel/Vesper read **LOCKED** up close.

2. **Gate prompt**  
   Fly toward Rime without a key. Prompt: `RIME LOCKED — need Cinder Key`. `E` must not start a dive.

3. **Cinder dive**  
   Approach Cinder, `E` (or click). 8-bit re-entry cine, then cavern. Fuel bar appears. Gravity is climbable with `W` (Cinder gravity 220 vs thrust 360). Hold `Shift`: shield ring, energy drains. Collect **O** ore (cargo HUD ticks up, credits do not bank yet) and **F** fuel / **E** energy.

4. **Boss**  
   Follow the dashed nav line / radar pip / edge marker to **Ember Warden** (lower-right chamber). Shoot until it dies. Banner grants **Cinder Key**; tank chip grows. Re-visiting Cinder must not respawn the boss.

5. **Launch vs rescue**  
   - Shaft + `E`: banks **100%** of dive cargo into credits.  
   - Burn fuel to 0 (idle ~0.6/s or thrust ~9/s) → prompt `Stranded — R rescue beam (15 CR)`. `R` plays Rescue Beam cine, banks salvage (50% until Rime/Mycel upgrades), subtracts up to 15 CR, **no life lost**.  
   - A hit at fuel 0 auto-rescues instead of hull-breach. A hit with fuel remaining still says **HULL BREACH** (not RE-ENTRY).

6. **Next planets**  
   After Cinder Key, Rime opens. Repeat: Frost Crown → Rime Key + 75% salvage. Sporeheart → Mycel Key + 100% salvage. Night Veil is the finale.

7. **Persist**  
   Refresh. Credits, keys, tank, salvage, high score remain (`reentry-save`). Guns reset between full runs but persist space ↔ planet inside one run.

8. **Soft-lock**  
   Locked planet always names the missing key. Re-entry is the HTML `#prompt` only — no canvas `{name} · E`. Combo `xN` sits under the top HUD.

---

## Session notes (ad capture, live HUD)

Recorded against the running Vite server on `:47331` (`?playtest=1`) while the progression-loop agent was landing. Captures include **Ember Warden**, fuel/energy meters, **TANK / SALVAGE**, **STRANDED — R RESCUE BEAM**, and the 8-bit RE-ENTRY cine.

### Space

- Ship starts next to orange **Cinder**, already in re-entry range. Wave rocks spawn hundreds of pixels out; at default/zoom-out they read as tiny outlines, not a dogfight.
- Re-entry callout is the HTML `#prompt` pill only. `drawNavMarker` no longer draws `{name} · E` on-planet (that used `14 / zoom` in screen space and exploded at `ZOOM_MIN`). Off-screen nav arrow + distance stay. Planet names in `drawPlanets` use a screen-pixel font cap.
- `HULL BREACH` banner is the right death sting (no longer “RE-ENTRY”).
- Objective **DEFEAT EMBER WARDEN** and `Rime LOCKED` are on-screen in space. Good fantasy; they compete with the planet.

### Cinematic

- 8-bit dive is the sell: chunky pixels, **RE-ENTRY / CINDER**, flames, scanlines, `PRESS E TO SKIP`.
- Duration ~3.6s (`cinematic.ts`). `E` / `Space` / `Esc` skip — easy to clip if Space is still held from shooting. Let ~2s+ play.
- HTML HUD (score / objective / tank chips) still composites over the cine unless `hud.hidden` for `cine` is actually applied. Later commits on this branch hide HUD during cine; verify after pull.

### Cavern

- Gravity is climbable now (Cinder **220** vs thrust **360**). Fuel is the killer: tanks drain fast, **STRANDED — R RESCUE BEAM (15 CR)** is a strong moment.
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
- Credits bank on launch/rescue; there is still no shop to spend them.

### Performance

- Canvas 32k×24k starfield + cavern tiles stayed smooth in 1920 capture. No hitch noted during cine or boss.

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
| Space dogfight doesn’t read | `game.ts` `spawnRock` `away` distance 480–1600. Spawn a closer first wave, or start zoomed in (`zoomWanted`). |
| Cine skip from held Space | `game.ts` `key()` — `Space` skips cine. Clear `keys` / ignore held Space for ~0.4s when `beginReentry` starts. |
| Fuel scramble vs climb fantasy | `meta.ts` `FUEL_THRUST` / idle drain vs `tankMax()` 40. Easy to strand before Ember Warden without `?playtest=1`. Either a shaft fuel pad or a first-dive tank bump. |
| Combo vs objective overlap | `style.css` `#combo` `top: 72px` sits under `#objective`. |
| No spend sink for credits | Credits persist (`meta.ts` `reentry-credits`) and pay rescue fees only. Shop / reroll still missing. |
| Mute has no persistent control | `KeyM` works; no button / icon. `setMuted` is used. |

### P2

| Issue | Hint |
| --- | --- |
| No music | `audio.ts` is SFX-only. |
| Mobile is Fire-only | **Fixed** with P0 touch pads (L / Thrust / R / Rev + Fire). |
| No shop for banked credits | See P1. |
| Vite `base` | **Done for relative deploy:** `vite.config.ts` `base: "./"`. Root hosting still works; GitHub Pages project pages should keep `base: '/re-entry/'` or `./`. |

### Fixed since original main playtest (do not re-open)

- Cinder gravity 460 > thrust 360 → **220 / 360** (`cavern.ts` `PLANETS`, `game.ts` `THRUST`).
- Death banner “RE-ENTRY” → **HULL BREACH**.
- `setMuted` unused → **M** + `toggleMuted`.
- `localStorage` `drift-*` → `reentry-save` / `reentry-highscore` with drift fallback (`meta.ts`).
- Combo unstyled → positioned cyan `#combo`.
- Fuel / energy / rescue / gate / bosses → shipped on this branch.
- `populateCavern` restack → `diveHolds` once per planet per run.

---

## Build / hosting

- `npm run build` (`tsc` + vite) was **clean on main** (dist JS ~40kb) and the sibling agent reports it **passed on this branch**.
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
