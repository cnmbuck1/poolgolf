# Pool Golf: premium asset plan (Steps A–C)

Status: **proposal, awaiting approval.** Nothing has been downloaded, bought or integrated yet.

## Step A: Audit of the current game

| Area | How it is built today | Imported assets? |
|---|---|---|
| Table (rails, apron, legs, trim, studs) | Extruded/lathed shapes in `render3d.ts`, canvas wood texture | None |
| Playing surface | Flat mesh with a 512 px canvas turf texture + bump | None |
| Hole 1 windmill | Lathe tower, box sails, extruded sweepers in `art.ts` | None |
| Hole 1 walls | Extruded capsules (stone base + oak cap), canvas stone texture | None |
| Cup, flag, tee | Torus/cylinder/plane, flag waves by vertex animation | None |
| Lanterns, ferns, rug, floor | Boxes + glow sprite; bent planes with a leaf texture; canvas rug | None |
| Holes 2–6 obstacles | Capsules, spheres (pool-ball bumpers), cross spinners | None |
| Lighting | 1 warm spotlight (only shadow caster, 2048 map, PCF soft), hemisphere, warm rim, PMREM env from a few emissive panels, ACES tone mapping | — |
| Post-processing | None | — |
| Camera | Perspective, auto-fitted so the whole table is visible; intro swoop, follow, overhead toggle | — |
| Physics | `physics.ts`: 2D capsules/circles/spinner segments, fully separate from visuals | — |

**Everything is procedural; there are no imported models or photographic textures.** The physics layer is already separate from the visuals, so models can be swapped without touching gameplay.

Why it still reads as "prototype":

- Textures are small (256–1024 px), hand-drawn on a canvas, and only some have a bump map. None has a normal, roughness or AO map.
- Silhouettes are built from basic shapes, with no sculpted detail, wear, or baked ambient occlusion.
- There is no post-processing (no AO, bloom or colour grade).

Baseline, Hole 1 (current build): 74 draw calls, about 44k triangles, 20 textures.

## Step B: What can be sourced free vs. built custom

### Network constraint (important)

This cloud workspace can only download from npm, PyPI and raw GitHub files. **Poly Haven, Kenney, Quaternius, Sketchfab, Fab, ambientCG, Meshy and Hugging Face are all blocked** by the environment's network policy. The listings below were verified by web search only, not downloaded. To use them, one of these is needed:

1. Allow these domains in the environment's network settings (Limited level → Allowed domains): `polyhaven.com`, `api.polyhaven.com`, `dl.polyhaven.org` (add `kenney.nl`, `quaternius.com` if we use those packs). Steps: https://code.claude.com/docs/en/cloud-environments#network-access
2. Or download the files on your computer and commit them to the repo (e.g. `assets-src/`).

### Free, CC0 (no attribution required, commercial use OK): verified listings

| Use | Asset | Source | Notes |
|---|---|---|---|
| Barrel | Wine Barrel 01 | [Poly Haven](https://polyhaven.com/a/wine_barrel_01) | CC0, ~11k tris, PBR maps; reduce to 1k textures |
| Barrels (cluster) | Wooden Barrels 01 | [Poly Haven](https://polyhaven.com/a/wooden_barrels_01) | CC0 |
| Lantern | Lantern 01 / Wooden Lantern 01 / Brass Diya Lantern | [Poly Haven](https://polyhaven.com/a/Lantern_01), [wooden](https://polyhaven.com/a/wooden_lantern_01), [brass](https://polyhaven.com/a/brass_diya_lantern) | CC0; brass diya fits the brass palette |
| Planters | Potted Plant 01 / 02 | [Poly Haven](https://polyhaven.com/a/potted_plant_01), [02](https://polyhaven.com/a/potted_plant_02) | CC0, terracotta pots |
| Stone texture | Stone Brick Wall 001, Stone Wall | [Poly Haven](https://polyhaven.com/a/stone_brick_wall_001), [stone wall](https://polyhaven.com/a/stone_wall) | CC0 PBR (colour, normal, roughness, AO) |
| Small props | Fantasy Props MegaKit (Standard, free) | [Quaternius](https://quaternius.com/packs/fantasypropsmegakit.html) | CC0, glTF; stylized low-poly; contents not fully verified |
| Course pieces | Minigolf Kit | [Kenney / OpenGameArt](https://opengameart.org/content/minigolf-kit) | CC0, GLB; **cartoon low-poly style, too simple for the premium look; not recommended for hero pieces; windmill not confirmed** |

Not found free: a CC0 **billiard felt** texture (the only close match, Texturecan's snooker cloth, is paid; ShareTextures "Carpet 8" is listed CC0 but unverified).

### Windmill: build custom

Free Sketchfab windmills exist (e.g. [annhatsady](https://sketchfab.com/3d-models/low-poly-windmill-35675169a6ec4275acc9f88ebc6d45ed), [Holywood](https://sketchfab.com/3d-models/dutch-windmill-45c2c76d8fb94f1cbdda4329cd7aeabf), [_Alexandr](https://sketchfab.com/3d-models/windmill-stylized-a7780e3667954bbf97bb619cb8a3e272)). They are mostly **CC BY (attribution required)** and low-poly, and none matches the concept's stone tower. More importantly, Hole 1's windmill must carry **low sweepers at ball height that exactly match the rotating collider**, which no stock model has. Any download would need re-rigging anyway.

**Recommendation: model it custom in Blender.** Blender 5.2.2 runs inside this workspace (installed and confirmed, including its glTF exporter), so this needs no network access or purchases.

### Custom in Blender (scripted, in this workspace)

| Asset | Detail |
|---|---|
| Windmill (hero) | Stone tower with real bevelled stones, shingled roof, 4 lattice blades with plank faces, brass axle/hub; separate named nodes `Sails` and `Sweepers` for animation; sweepers match the collider |
| Wall kit | Straight section, rounded end cap, corner; stone or brick body with oak cap and brass bolts; bevelled edges; tiles along any capsule length |
| Brick barrier | Same kit with a brick body |
| Bumper | Pool-ball bumper on a brass ring mount (for later holes) |
| Table | Rail profile with real bevels, brass corner caps and trim, pockets/cup with modelled depth and a brass rim |
| Felt/turf | Procedural cloth baked to a tileable colour + normal + roughness texture |

All custom models get baked ambient occlusion and normal maps, exported as GLB.

Honest limit: these are built by script, not by hand-sculpting. They will have real bevels, proper materials and baked AO, a large step up from runtime primitives, but a professional 3D artist could still push further. If the result isn't enough, a paid hero windmill or a commissioned model is the next option.

### AI-generated (Meshy): not recommended for Hole 1

From [Meshy's pricing docs](https://docs.meshy.ai/pricing):

- **Free plan:** 100 credits/month (about 5 generations at 20 credits each). Output is CC BY 4.0, so attribution is required.
- **Pro plan:** $20/month, for private, commercially owned output.

AI meshes usually need retopology and UV cleanup to run well on phones, and Meshy is blocked from this workspace. Better kept for later decorative pieces, if at all.

### Estimated cost

| Plan | Cost |
|---|---|
| **Recommended:** Poly Haven CC0 props/textures + custom Blender models | **$0** |
| Optional: Meshy Pro for one month (decor experiments) | $20 |
| Optional: paid stock windmill or commissioned model | Not priced; needs your approval before any purchase |

## Step C: Integration approach

- **Pipeline:**
  1. Blender (script) → GLB.
  2. Optimize with `@gltf-transform/cli` (v4.5.1, on npm): meshopt-compressed geometry, WebP textures at max 1024 px (512 for small props), deduplicated materials.
  3. Save to `public/assets/hole1/`.
- **Loading:** `GLTFLoader` + `MeshoptDecoder` from three.js, with a small asset manifest (`src/assets.ts`). The manifest records each file's scale, orientation, anchor point, and its source/license line for `ASSETS.md`. The menu shows a loading bar.
- **Gameplay separation:** `physics.ts` and level data stay unchanged. Visual models are placed from the same level data.
  - The windmill's `Sails` and `Sweepers` nodes are driven by the spinner angle, as today.
  - Wall pieces are laid along each collision capsule.
- **Lighting and rendering:**
  - Keep one soft shadow-casting light, with a tighter shadow frustum for sharper shadows.
  - Replace the panel environment with a real HDRI (Poly Haven CC0, reduced to 512 px) for proper PBR reflections.
  - Use baked AO in the models for contact shading.
  - Add one cheap post pass: subtle bloom on lanterns only (half resolution), vignette and colour grade. It turns off automatically on slower phones.
  - No full-screen SSAO (too expensive on phones).
- **Budgets for Hole 1:** about 150k triangles or fewer, about 100 draw calls or fewer, about 6 MB of downloaded assets or less, and 60 fps on recent iPhones (with the existing automatic quality fallback).
- **Delivery:** the iOS/Android apps bundle the GLBs. The private web test link publishes them as files alongside the page.
- **Credits:** `ASSETS.md` lists every third-party asset with source URL, author, license and any attribution text.
- **Scope:** Hole 1 and the main menu only; Holes 2–6 untouched until you approve.

## Decisions needed

1. Approve the **$0 plan**: custom Blender models for the windmill, walls, table and felt, plus Poly Haven CC0 props, textures and HDRI.
2. Choose how Poly Haven files get in: **allow the domains** in the environment settings (recommended), or download and commit them yourself.
3. Confirm no Meshy/paid assets for now.
4. Decorations (barrels, planters, lanterns, small rocks) go **on the rails, corners and floor only**, never on the playing surface. OK?
