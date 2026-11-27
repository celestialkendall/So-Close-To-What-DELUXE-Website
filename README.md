# So Close To What??? (Deluxe) — fan site

A fan-made site for Tate McRae's *So Close To What??? (Deluxe)*: scroll-driven 3D unboxing of the 2LP ultra-clear vinyl and the CD, tracklist with Spotify / Apple Music links, an embedded Spotify player, and other releases.

This site was fully created and coded by me, Claude handles low memory optimization, pushes, pull requests, and merges.

Not affiliated with Tate McRae or her label. Album artwork and photos © their respective owners.

## Run locally
```bash
python3 -m http.server 8000
```
then open http://localhost:8000 (opening `index.html` directly won't work: browsers block the 3D files from `file://`).

Built with plain HTML/CSS/JS and [three.js](https://threejs.org) (vendored in `lib/`). No build step: any static host works (Cloudflare Pages, GitHub Pages, Netlify).
