# Window Fireworks

An interactive poster sketch where a prepared city/window image throws off sampled-pixel fireworks, waits, and rebuilds itself.

## Step 1: Run It

Start a local server from this folder:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

## Step 2: Load Your Image

Use **Load image** and choose the photo from outside your window. For now, prepare the source image however you want before loading it: halftone, mosaic, posterized, high contrast, etc.

The sketch automatically crops the image to fill the poster canvas and samples real pixels from it when you click.

## Step 3: Perform Fireworks

Click or tap anywhere in the image. Each click creates a separate firework:

1. pixels near the clicked spot are sampled from the source image
2. sampled pixels pop from the clicked point
3. they burst as mostly white, gold, coral, and pale blue streaks
4. after a pause, they return to their original positions

You can click multiple times before previous fireworks finish.

## Step 4: First Things To Tune

Most of the visual behavior lives in `script.js`.

- `radius` inside `triggerBurst`: size of the destroyed/source area
- `step` inside `triggerBurst`: particle density
- `burstDuration`: how long the explosion travels
- `holdDuration`: how long sparks linger before returning
- `returnDuration`: how long pixels take to rebuild
- `fireColor`: warm/white color mapping

## Current Direction

The sketch is intentionally simple and local: no build tools, no dependencies, and no image uploads to the internet. Next likely steps are color controls, export/recording, better smoke/glow, and a softer image-disruption effect that does not turn into a black hole.
