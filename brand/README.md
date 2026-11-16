# Brand

The Cnmbuck Orb, the studio's signature ball, lives in its own repository:
**[cnmbuck1/cnmbuckstudios-brand](https://github.com/cnmbuck1/cnmbuckstudios-brand)**. That is the one
source of truth for its code, images and colours.

Rack & Roll uses an unchanged copy at `src/brand/cnmbuck-orb.ts`. To update it, copy the new file from the
brand repository and check it:

```sh
curl -sSfL https://raw.githubusercontent.com/cnmbuck1/cnmbuckstudios-brand/main/orb/cnmbuck-orb.ts -o src/brand/cnmbuck-orb.ts
curl -sSfL https://raw.githubusercontent.com/cnmbuck1/cnmbuckstudios-brand/main/orb/cnmbuck-orb.ts.sha256 -o /tmp/orb.sha256
(cd src/brand && sha256sum -c /tmp/orb.sha256)
```

Never edit `src/brand/cnmbuck-orb.ts` here. Rack & Roll's own wrapping (how the Orb is unlocked, its shop
card, when the glow shows) lives in `src/gear.ts`, `src/render3d.ts` and `src/main.ts`.
