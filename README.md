# RE-ENTRY

A neon arcade shooter with an 8-bit dive. Open space is a huge map. Fly to a planet, press **E**, and watch the craft re-enter atmosphere in chunky pixels before you drop into a Sub-Terrania-style cavern.

## Play

- **Turn** with `A` / `D`. The nose is thrust-forward — `W` flies that way, `S` reverses
- **Shoot** with `Space`, a click, or Fire (touch)
- **Re-enter / launch** with `E` when the prompt appears, or click a nearby planet. Re-entry plays an 8-bit cinematic
- **Scroll** to zoom in and out a long way
- **Pause** with `Esc`

### Space

The camera follows you across a 32k × 24k field. Rocks can drop credits, guns, shields, and a shooting pet. Four planets sit far apart: **Cinder**, **Rime**, **Mycel**, **Vesper**.

### Planets

Each planet is its own cavern world. Gravity pulls you down. Thrust burns fuel. Find fuel cells, loot, and hostiles in the tunnels. Fly back up the entry shaft and press `E` to return to space.

The radar (bottom left) shows the whole current world.

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
