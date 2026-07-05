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
