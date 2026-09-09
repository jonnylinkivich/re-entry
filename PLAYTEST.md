# RE-ENTRY playtest

Build first (`npm run build`). Dev server: `npm run dev` → `http://localhost:47331`.

Optional query flags (run-local, not required for a real playthrough):

- `?playtest=1` — larger fuel/energy for the run, at least 40 credits so the rescue fee is payable
- `?unlock=1` — treat Cinder/Rime/Mycel keys as owned so later planets open
- Combine: `http://localhost:47331/?playtest=1`

## Controls (must still work)

`A`/`D` turn · `W`/`S` thrust · `Space` shoot · `E` re-enter/launch · `Shift` shield · `R` rescue when stranded · `Esc` pause · `M` mute

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
   Locked planet always names the missing key. Duplicate HTML + canvas re-entry prompt should not appear (HTML prompt only). Combo `xN` sits under the top HUD.

## Ads / clips

Hero and loop captures (if produced) live in `/opt/cursor/artifacts` as `ad_hero.mp4` and `ad_loop.gif`.
