# Splendor · Particle Face

A real-time talking face built **entirely from glowing particles**. There is no
mesh, no skin texture, no visible polygons — thousands of points organise
themselves into eyes, brows, nose, lips, cheeks, a jawline and a forehead, then
migrate, swarm-like, between expressions and speech shapes. Built on Three.js
(WebGL), GPU point rendering, additive glow.

## Run it

It ships with the Splendor server (static assets under `/public`):

- `https://<host>/face` — friendly route (redirects to the page below)
- `https://<host>/particle-face/` — the page itself

No build step. Three.js is loaded from the repo's vendored `/lib/three.module.min.js`.

## OBS / streaming overlay

Open the page as a **Browser Source** with a transparent background:

```
https://<host>/face?obs
```

`?obs` enables alpha (transparent) background and hides all UI — drop it straight
over a TikTok Live / YouTube / Streamlabs scene. Recommended canvas: 1080×1920
(portrait) or 1920×1080 (landscape); the face re-frames for both.

### URL parameters

| Param          | Effect                                                        |
| -------------- | ------------------------------------------------------------- |
| `obs`          | transparent background + no UI (overlay mode)                 |
| `transparent`  | transparent background, keep UI                               |
| `theme=`       | `cyan` (default) `gold` `purple` `emerald` `red` `silver`     |
| `expression=`  | `neutral` `smile` `concern` `surprise` `curiosity` `thoughtfulness` `focus` `happiness` |
| `count=`       | particle count, `4000`–`50000`                               |
| `orbit`        | slow idle camera orbit                                        |
| `silent`       | suppress the opening greeting                                 |

Example: `…/face?obs&theme=gold&expression=smile&count=30000`

## Embedding / driving it from code

```html
<canvas id="c" style="width:100%;height:100%"></canvas>
<script type="module">
  import { SplendorFace } from '/particle-face/splendor-face.js';
  const face = new SplendorFace(document.getElementById('c'), { count: 18000 });

  face.setExpression('smile');
  face.setTheme('gold');

  // Lip-sync options — pick one:
  face.speak('Hello, I am Splendor.');  // SpeechSynthesis + procedural mouth
  await face.attachMic();               // microphone amplitude → mouth
  face.attachAudio(audioEl);            // any <audio>/<video> → mouth
  face.driveViseme({ open: 0.7, wide: 0.3 }); // push shapes from your TTS pipeline
</script>
```

### API

| Method | Purpose |
| --- | --- |
| `setExpression(name)` | migrate particles into an expression |
| `setTheme(name)` | recolour instantly (uniform swap, no rebuild) |
| `setTransparent(bool)` | alpha background for overlays |
| `setOrbit(bool)` | idle camera orbit |
| `setQuality(n)` | rebuild with `n` particles (graceful degradation) |
| `blink()` | manual blink |
| `speak(text)` | TTS + procedural lip motion |
| `attachAudio(el)` / `attachMic()` | drive the mouth from audio amplitude/spectrum |
| `driveViseme({open,wide,round})` / `driveAmplitude(v)` | push a mouth shape directly |
| `detachAudio()` · `start()` · `stop()` · `dispose()` | lifecycle |

## How it works

- **The particles are the face.** A seeded point cloud fills a curved "dome" of
  light (forehead, cheeks, jaw), carved around the eyes and mouth, with denser
  strokes for brows, nose, iris/pupil and lips.
- **Motion is a swarm settling.** Each particle has a *home* plus per-frame
  offsets for the current expression, viseme, blink and gaze. A critically-damped
  spring eases positions toward those targets, so changes look like particles
  flowing and reforming rather than snapping. A small per-particle shader drift
  keeps everything alive even when holding a shape — the face "breathes" and never
  freezes.
- **Lip-sync** comes from a Web Audio `AnalyserNode`: overall energy drives jaw /
  mouth opening, and the high-vs-low frequency balance picks a vowel character
  (`open` / `wide` / `round`). TTS, which exposes no PCM, is driven procedurally
  per word boundary.
- **Glow** is additive-blended soft sprites on a dark (or transparent) background
  — no post-processing pass required, which keeps it light enough for 60 FPS and
  for OBS. A simple FPS meter auto-reduces particle count once on weaker GPUs.

Default palette: electric cyan core, white-hot highlights, deep-blue shadows.
