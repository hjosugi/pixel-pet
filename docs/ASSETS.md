<!-- i18n: language-switcher -->
[English](ASSETS.md) | [日本語](ASSETS.ja.md)

# Assets

## External inspiration policy

`vscode-pets`, `virtual-puppet-project`, Kofun Friends, and similar projects are
references for interaction patterns only unless an asset is explicitly listed in
this repository with compatible license and permission details.

Do not copy third-party character art, spritesheets, names, sound effects, UI
skins, or brand-specific visual treatments into this repository. Pokemon-like
ideas must stay structural: pet collection, care loops, simple movement, and
exchange mechanics are fine; copied characters, silhouettes, names, type charts,
trainer concepts, or franchise presentation are not.

## Default placeholder art

The current `cyber-cat`, `cyber-penguin`, and `kofun-friend` sprite sheets are
original generated pixel art for this repository. They are released under the
repository 0BSD License.

Regenerate them with:

```bash
npm run assets:generate
```

Check the full asset pipeline with:

```bash
npm run assets:check
```

That command regenerates placeholder sheets, validates every pet pack, and then
fails if generation changed committed files. This keeps the placeholder art
reproducible while still catching broken hand-authored packs.

## Sprite authoring pipeline

Pet packs live in `assets/pets/<pack-slug>/`. Keep the slug lowercase
kebab-case, for example `cyber-cat` or `kofun-friend`.

Each pack must include:

```txt
manifest.json
spritesheet.json
spritesheet.png
```

Optional source files, such as `source.aseprite`, can live beside those files,
but the runtime only loads the three files above.

### Aseprite export convention

Use a single horizontal spritesheet grid:

```txt
row 0: idle
row 1: walk
row 2: sleep
row 3: react
```

Supported frame sizes are `32x32` and `48x48`. All frames in a pack must use the
same size. Keep frames left-to-right in each row, then export a PNG named
`spritesheet.png`.

Default timing:

```txt
idle:  8 fps, loops
walk: 10 fps, loops
sleep: 4 fps, loops
react: 12 fps, does not loop
```

`manifest.json` declares the pet id, display name, frame size, scale, asset file
names, expected FPS/loop values, and short rule-based dialogue lines under
`personality.dialogue`. `spritesheet.json` declares the PNG frame size, grid
rows/columns, animation row, frame indexes, FPS, and loop flag.

For a `48x48` pack with four columns and four rows, the PNG must be `192x192`.
Set both `manifest.size.base` and `spritesheet.json.frame.width/height` to `48`.

Before committing a new pack or replacing generated art, run:

```bash
npm run assets:validate
npm run assets:check
```

Validation catches missing `manifest.json`, missing `spritesheet.png`, missing
`spritesheet.json`, unsupported frame sizes, PNG dimension mismatches, missing
animation rows, invalid frame indexes, manifest/metadata FPS mismatches, missing
dialogue triggers, and dialogue lines longer than 44 characters.

## Kofun Friends

Project direction: Kofun Friends art may be used as-is for the `kofun-friend`
pet when the actual source files are added.

Until then, the committed `kofun-friend` sprites are generated placeholder art,
not copied Kofun Friends source art.

## Third-party attribution template

Before adding any non-generated third-party asset, keep a source note beside the
asset files:

```txt
source:
permission:
license:
copyright:
added_at:
notes:
```

Only commit the asset after the license is compatible with this repository and
redistribution is permitted. This keeps future packaging, release, and
attribution work straightforward.
