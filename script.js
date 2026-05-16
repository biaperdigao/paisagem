const IS_MOBILE = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
const MIN_BLAST_RADIUS = IS_MOBILE ? 420 : 700;
const MAX_BLAST_RADIUS = IS_MOBILE ? 1040 : 3600;
const MAX_CHARGE_TIME = 1600;
const MIN_BLAST_DURATION = 40;
const MAX_BLAST_DURATION = 160;
const DESKTOP_BLAST_EXTRA_FRAMES = 12;
const RETURN_SLOWNESS = 1.25;
const JITTER_DENSITY = IS_MOBILE ? 0.16 : 0.35;
const SCENE_COUNT = 12;
const GREEN_TRIGGER_RATIO = 0.95;
const PHRASE_COVERAGE_STEP = 12;
const TEXT_GREEN_HOLD_FRAMES = 420;
const DESKTOP_FADE_OUT_FRAMES = TEXT_GREEN_HOLD_FRAMES;
const MOBILE_FADE_OUT_FRAMES = TEXT_GREEN_HOLD_FRAMES;
const REORGANIZE_DURATION = IS_MOBILE
  ? MOBILE_FADE_OUT_FRAMES
  : DESKTOP_FADE_OUT_FRAMES;
const MOBILE_SCENE_TRIGGER_CHARGE = 0.94;
const MOBILE_CENTER_TRIGGER_RADIUS = 0.28;
const DESKTOP_SCENE_TRIGGER_CHARGE = 0.9;
const DESKTOP_CENTER_TRIGGER_RADIUS = 0.34;
const MAX_CANVAS_WIDTH = IS_MOBILE ? 480 : 1400;
const MAX_CANVAS_HEIGHT = IS_MOBILE ? 640 : 1867;
const MOBILE_BLAST_SPRITE_FRAMES = 1;
const MOBILE_STAMP_INK_PAD = 3;
const CAPTURE_DELAY_MS = 200;
const CAPTURE_HISTORY_MS = 700;
const CAPTURE_SAMPLE_MS = 100;
const ASSET_VERSION = "2026-05-16-final-ui-7";

const SCENES = Array.from({ length: SCENE_COUNT }, (_, index) => ({
  dither: `cidade_dither_${index + 1}.png`,
  phrase: `cidade_frase_${index + 1}.png`,
}));
const EXPLOSION_STAMP_SRCS = [
  "cidade_explosion_1.png",
  "cidade_explosion_2.png",
  "cidade_explosion_3.png",
  "cidade_explosion_4.png",
  "cidade_explosion_5.png",
  "cidade_explosion_6.png",
  "cidade_explosion_7.png",
];
const FALLBACK_WIDTH = 640;
const FALLBACK_HEIGHT = 512;
const WHITE_THRESHOLD = 190;
const ALPHA_WHITE_THRESHOLD = 190;
const POSTER_TEXT_GREEN = "#66f05f";

const canvas = document.querySelector("#poster");
const captureButton = document.querySelector("#capture-button");
const ctx = canvas.getContext("2d", { alpha: false });

const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const baseCanvas = document.createElement("canvas");
const baseCtx = baseCanvas.getContext("2d", { alpha: false });
const phraseCanvas = document.createElement("canvas");
const phraseCtx = phraseCanvas.getContext("2d", { willReadFrequently: true });
const phraseGreenCanvas = document.createElement("canvas");
const phraseGreenCtx = phraseGreenCanvas.getContext("2d", { willReadFrequently: true });
const coverageCanvas = document.createElement("canvas");
const coverageCtx = coverageCanvas.getContext("2d", { willReadFrequently: true });

ctx.imageSmoothingEnabled = false;
sourceCtx.imageSmoothingEnabled = false;
baseCtx.imageSmoothingEnabled = false;
phraseCtx.imageSmoothingEnabled = false;
phraseGreenCtx.imageSmoothingEnabled = false;
coverageCtx.imageSmoothingEnabled = false;

const state = {
  width: FALLBACK_WIDTH,
  height: FALLBACK_HEIGHT,
  whiteMask: new Uint8Array(0),
  blasts: [],
  debug: false,
  ready: false,
  message: "abrindo a janela",
  lastAffected: 0,
  lastVariant: "",
  stamps: [],
  lastStampIndex: -1,
  phraseImage: null,
  phraseReady: false,
  sceneIndex: -1,
  sceneBag: [],
  phraseCoverageIndices: [],
  coverageWidth: 0,
  coverageHeight: 0,
  transition: null,
  charging: null,
  captureFrames: [],
  lastCaptureSampleAt: 0,
};

function random(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hashUnit(x, y, salt) {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 17.3) * 43758.5453;
  return value - Math.floor(value);
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = items[i];
    items[i] = items[j];
    items[j] = temp;
  }

  return items;
}

function isWhiteInk(r, g, b, a) {
  const brightness = (r + g + b) / 3;
  return brightness >= WHITE_THRESHOLD || (brightness < 8 && a <= ALPHA_WHITE_THRESHOLD);
}

function angleDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function stampScale() {
  return Math.max(1, Math.round(Math.min(state.width, state.height) / 900));
}

function resizeCanvas(width, height) {
  state.width = width;
  state.height = height;
  canvas.width = width;
  canvas.height = height;
  canvas.style.aspectRatio = `${width} / ${height}`;
  state.captureFrames = [];
  state.lastCaptureSampleAt = 0;
  ctx.imageSmoothingEnabled = false;
}

function renderSizeForImage(img) {
  const sourceWidth = img.naturalWidth || FALLBACK_WIDTH;
  const sourceHeight = img.naturalHeight || FALLBACK_HEIGHT;
  const scale = Math.min(MAX_CANVAS_WIDTH / sourceWidth, MAX_CANVAS_HEIGHT / sourceHeight, 1);

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `${src}?v=${ASSET_VERSION}`;
  });
}

function nextSceneIndex() {
  if (state.sceneBag.length === 0) {
    state.sceneBag = SCENES.map((_, index) => index).filter((index) => index !== state.sceneIndex);
  }

  const bagIndex = Math.floor(Math.random() * state.sceneBag.length);
  const [sceneIndex] = state.sceneBag.splice(bagIndex, 1);
  return sceneIndex;
}

async function loadScene(sceneIndex) {
  const scene = SCENES[sceneIndex];
  state.ready = false;
  state.message = "abrindo a janela";

  try {
    const [ditherImg, phraseImg] = await Promise.all([
      loadImageElement(scene.dither),
      loadImageElement(scene.phrase),
    ]);

    applyScene(sceneIndex, ditherImg, phraseImg);
    state.ready = true;
    state.message = "";
  } catch (error) {
    state.ready = false;
    state.message = "erro ao carregar cena";
  }
}

function applyScene(sceneIndex, ditherImg, phraseImg) {
  const { width, height } = renderSizeForImage(ditherImg);

  resizeCanvas(width, height);
  buildFixedBitmapBase(ditherImg);
  state.phraseImage = phraseImg;
  buildPhraseLayers(phraseImg);
  state.phraseReady = true;
  state.sceneIndex = sceneIndex;
  state.blasts = [];
  state.lastAffected = 0;
}

function loadExplosionStamps() {
  for (const src of EXPLOSION_STAMP_SRCS) {
    const img = new Image();

    img.onload = () => {
      const stamp = buildExplosionStamp(img, src);
      if (stamp.cells.length > 0) {
        state.stamps.push(stamp);
      }
    };

    img.src = `${src}?v=${ASSET_VERSION}`;
  }
}

function buildPhraseLayers(img) {
  phraseCanvas.width = state.width;
  phraseCanvas.height = state.height;
  phraseGreenCanvas.width = state.width;
  phraseGreenCanvas.height = state.height;

  const source = document.createElement("canvas");
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  source.width = img.naturalWidth || img.width;
  source.height = img.naturalHeight || img.height;
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(img, 0, 0);

  const sourcePixels = sourceCtx.getImageData(0, 0, source.width, source.height);
  const blackLayer = phraseCtx.createImageData(state.width, state.height);
  const greenLayer = phraseGreenCtx.createImageData(state.width, state.height);

  const scale = Math.min(state.width / source.width, state.height / source.height);
  const drawW = Math.round(source.width * scale);
  const drawH = Math.round(source.height * scale);
  const offsetX = Math.round((state.width - drawW) / 2);
  const offsetY = Math.round((state.height - drawH) / 2);
  const green = hexToRgb(POSTER_TEXT_GREEN);

  // A frase PNG vira duas camadas 1-bit alinhadas ao poster: uma preta fixa,
  // outra verde para aparecer apenas dentro das mascaras de explosao.
  for (let y = 0; y < drawH; y += 1) {
    for (let x = 0; x < drawW; x += 1) {
      const sx = Math.floor((x / drawW) * source.width);
      const sy = Math.floor((y / drawH) * source.height);
      const sourceIndex = (sy * source.width + sx) * 4;
      const a = sourcePixels.data[sourceIndex + 3];
      const brightness = (
        sourcePixels.data[sourceIndex] +
        sourcePixels.data[sourceIndex + 1] +
        sourcePixels.data[sourceIndex + 2]
      ) / 3;

      if (a < 40) continue;

      const targetIndex = ((offsetY + y) * state.width + offsetX + x) * 4;
      blackLayer.data[targetIndex] = 0;
      blackLayer.data[targetIndex + 1] = 0;
      blackLayer.data[targetIndex + 2] = 0;
      blackLayer.data[targetIndex + 3] = 255;

      greenLayer.data[targetIndex] = green.r;
      greenLayer.data[targetIndex + 1] = green.g;
      greenLayer.data[targetIndex + 2] = green.b;
      greenLayer.data[targetIndex + 3] = 255;
    }
  }

  phraseCtx.clearRect(0, 0, state.width, state.height);
  phraseGreenCtx.clearRect(0, 0, state.width, state.height);
  phraseCtx.putImageData(blackLayer, 0, 0);
  phraseGreenCtx.putImageData(greenLayer, 0, 0);
  buildPhraseCoverageMap(blackLayer);
}

function buildPhraseCoverageMap(layer) {
  state.coverageWidth = Math.ceil(state.width / PHRASE_COVERAGE_STEP);
  state.coverageHeight = Math.ceil(state.height / PHRASE_COVERAGE_STEP);
  state.phraseCoverageIndices = [];
  coverageCanvas.width = state.coverageWidth;
  coverageCanvas.height = state.coverageHeight;
  coverageCtx.imageSmoothingEnabled = false;

  for (let gy = 0; gy < state.coverageHeight; gy += 1) {
    for (let gx = 0; gx < state.coverageWidth; gx += 1) {
      let hasPhrasePixel = false;
      const startX = gx * PHRASE_COVERAGE_STEP;
      const startY = gy * PHRASE_COVERAGE_STEP;
      const endX = Math.min(state.width, startX + PHRASE_COVERAGE_STEP);
      const endY = Math.min(state.height, startY + PHRASE_COVERAGE_STEP);

      for (let y = startY; y < endY && !hasPhrasePixel; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          if (layer.data[(y * state.width + x) * 4 + 3] > 0) {
            hasPhrasePixel = true;
            break;
          }
        }
      }

      if (hasPhrasePixel) {
        state.phraseCoverageIndices.push(gy * state.coverageWidth + gx);
      }
    }
  }
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function buildExplosionStamp(img, name) {
  const stampCanvas = document.createElement("canvas");
  const stampCtx = stampCanvas.getContext("2d", { willReadFrequently: true });
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const sampleStep = 3;
  const cells = [];
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  stampCanvas.width = width;
  stampCanvas.height = height;
  stampCtx.imageSmoothingEnabled = false;
  stampCtx.drawImage(img, 0, 0);

  const pixels = stampCtx.getImageData(0, 0, width, height).data;

  // A mascara vira uma lista de quadrados brancos normalizados em torno do
  // centro visual do PNG. Recortes internos transparentes/pretos sao
  // preservados, porque agora eles fazem parte do desenho da explosao.
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const a = pixels[index + 3];
      const brightness = (r + g + b) / 3;

      if (a < 40 || brightness < 210) continue;

      cells.push({ x, y, size: sampleStep });
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const maxDim = Math.max(maxX - minX || 1, maxY - minY || 1);

  return {
    name,
    cells: cells.map((cell) => ({
      x: (cell.x - centerX) / maxDim,
      y: (cell.y - centerY) / maxDim,
      size: cell.size / maxDim,
    })),
  };
}

function chooseExplosionStamp() {
  if (state.stamps.length === 0) return null;
  if (state.stamps.length === 1) {
    state.lastStampIndex = 0;
    return state.stamps[0];
  }

  let index = Math.floor(Math.random() * state.stamps.length);
  if (index === state.lastStampIndex) {
    index = (index + 1 + Math.floor(Math.random() * (state.stamps.length - 1))) % state.stamps.length;
  }

  state.lastStampIndex = index;
  return state.stamps[index];
}

function buildFixedBitmapBase(img) {
  sourceCanvas.width = state.width;
  sourceCanvas.height = state.height;
  baseCanvas.width = state.width;
  baseCanvas.height = state.height;

  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.clearRect(0, 0, state.width, state.height);
  sourceCtx.drawImage(img, 0, 0, state.width, state.height);

  let sourcePixels;
  try {
    sourcePixels = sourceCtx.getImageData(0, 0, state.width, state.height);
  } catch (error) {
    state.ready = false;
    state.message = "leitura de pixels bloqueada: use um servidor local";
    return;
  }

  const output = baseCtx.createImageData(state.width, state.height);
  state.whiteMask = new Uint8Array(state.width * state.height);

  // Leitura do PNG: a imagem pode vir como preto/branco real ou como mascara
  // alpha. Em ambos os casos transformamos a fonte em uma base 1-bit fixa:
  // preto absoluto no fundo, branco absoluto nos pontos da cidade.
  for (let i = 0; i < state.whiteMask.length; i += 1) {
    const sourceIndex = i * 4;
    const r = sourcePixels.data[sourceIndex];
    const g = sourcePixels.data[sourceIndex + 1];
    const b = sourcePixels.data[sourceIndex + 2];
    const a = sourcePixels.data[sourceIndex + 3];
    const isWhite = isWhiteInk(r, g, b, a);
    const value = isWhite ? 255 : 0;

    state.whiteMask[i] = isWhite ? 1 : 0;
    output.data[sourceIndex] = value;
    output.data[sourceIndex + 1] = value;
    output.data[sourceIndex + 2] = value;
    output.data[sourceIndex + 3] = 255;
  }

  baseCtx.putImageData(output, 0, 0);
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * state.width),
    y: Math.round(((event.clientY - rect.top) / rect.height) * state.height),
  };
}

function isInsideCanvas(point) {
  return point.x >= 0 && point.x < state.width && point.y >= 0 && point.y < state.height;
}

function collectAffectedPixels(cx, cy, radius, maxDisplacement, duration) {
  const affected = [];
  const minX = Math.max(0, Math.round(cx - radius));
  const maxX = Math.min(state.width - 1, Math.round(cx + radius));
  const minY = Math.max(0, Math.round(cy - radius));
  const maxY = Math.min(state.height - 1, Math.round(cy + radius));
  const sampleStep = Math.max(1, Math.round(radius / (IS_MOBILE ? 220 : 420)));

  // So os pixels brancos locais entram no dano. Eles nao tem fisica continua:
  // recebem um deslocamento pequeno e pre-calculado para poucos frames.
  for (let y = minY; y <= maxY; y += sampleStep) {
    for (let x = minX; x <= maxX; x += sampleStep) {
      const dx = x - cx;
      const dy = y - cy;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      if (state.whiteMask[y * state.width + x] !== 1) continue;
      if (Math.random() > JITTER_DENSITY) continue;

      const force = 1 - distance / radius;
      const angle = Math.atan2(dy, dx) + random(-0.9, 0.9);
      const displacement = Math.round(random(3, maxDisplacement) * (0.35 + force * 0.85));
      const restoreStart = Math.round(duration * 0.42);
      const restoreEnd = Math.round(duration * 0.94);

      affected.push({
        x,
        y,
        dx: Math.round(Math.cos(angle) * displacement),
        dy: Math.round(Math.sin(angle) * displacement),
        size: IS_MOBILE ? 1 : (Math.random() < 0.82 ? 1 : 2) * sampleStep,
        phaseOffset: Math.round(random(0, 4)),
        restoreFrame: Math.round(random(restoreStart, restoreEnd) * RETURN_SLOWNESS),
      });
    }
  }

  return affected;
}

function chargeFromTime(time) {
  return clamp(time / MAX_CHARGE_TIME, 0, 1);
}

function radiusFromCharge(charge) {
  return Math.round(lerp(MIN_BLAST_RADIUS, MAX_BLAST_RADIUS, charge));
}

function durationFromCharge(charge) {
  if (IS_MOBILE) {
    return 96;
  }
  return Math.round(lerp(MIN_BLAST_DURATION, MAX_BLAST_DURATION, charge)) + DESKTOP_BLAST_EXTRA_FRAMES;
}

function triggerBlast(x, y, charge) {
  if (!state.ready) return null;

  const visualCharge = charge;
  const radius = radiusFromCharge(visualCharge);
  const duration = durationFromCharge(visualCharge);
  const maxDisplacement = Math.round(lerp(IS_MOBILE ? 18 : 160, IS_MOBILE ? 90 : 660, visualCharge));
  const affected = IS_MOBILE ? [] : collectAffectedPixels(x, y, radius, maxDisplacement, duration);
  const blast = new Blast(x, y, radius, duration, visualCharge, affected);

  state.lastAffected = blast.affected.length;
  state.lastVariant = blast.variant;
  state.blasts.push(blast);

  return blast;
}

function isNearMobileSceneTrigger(x, y) {
  const dx = x - state.width / 2;
  const dy = y - state.height / 2;
  const centerRadius = Math.min(state.width, state.height) * MOBILE_CENTER_TRIGGER_RADIUS;
  return Math.hypot(dx, dy) <= centerRadius;
}

function isNearDesktopSceneTrigger(x, y) {
  const dx = x - state.width / 2;
  const dy = y - state.height / 2;
  const centerRadius = Math.min(state.width, state.height) * DESKTOP_CENTER_TRIGGER_RADIUS;
  return Math.hypot(dx, dy) <= centerRadius;
}

class Blast {
  constructor(x, y, radius, duration, charge, affected) {
    const scale = stampScale();
    const roll = Math.random();
    const variant = roll < 0.34 ? "splat" : roll < 0.68 ? "star" : "tear";
    const variantShape = {
      splat: {
        core: 0.45,
        holes: 1.1,
        lobes: 1.35,
        spikes: 0.65,
        spikeLength: 0.8,
        base: 0.86,
        arms: 0.85,
      },
      star: {
        core: 0.3,
        holes: 0.42,
        lobes: 0.42,
        spikes: 2.25,
        spikeLength: 1.8,
        base: 0.55,
        arms: 1.55,
      },
      tear: {
        core: 0.38,
        holes: 0.75,
        lobes: 0.86,
        spikes: 1.25,
        spikeLength: 1.35,
        base: 0.68,
        arms: 1.25,
      },
    }[variant];
    const coreRadius = Math.round(radius * variantShape.core);
    const densityBoost = 0.75 + charge * 1.15;
    const tearAngle = random(0, Math.PI * 2);

    this.x = Math.round(x);
    this.y = Math.round(y);
    this.frame = 0;
    this.variant = variant;
    this.radius = radius;
    this.duration = duration;
    this.charge = charge;
    this.affected = affected;
    this.core = [];
    this.holes = [];
    this.shards = [];
    this.clusters = [];
    this.mobileFrames = [];
    this.mobileGreenFrames = [];
    this.mobileFrameX = 0;
    this.mobileFrameY = 0;

    // Buracos pretos internos: preservam a linguagem xerox/reticula quebrada.
    for (let i = 0; i < Math.round((18 + 34 * densityBoost) * variantShape.holes); i += 1) {
      const angle = random(0, Math.PI * 2);
      const distance = Math.pow(Math.random(), 0.74) * coreRadius * 0.98;
      this.holes.push({
        x: Math.round(Math.cos(angle) * distance),
        y: Math.round(Math.sin(angle) * distance),
        w: Math.round(random(8, 28 + charge * 34)) * scale,
        h: Math.round(random(5, 20 + charge * 26)) * scale,
        firstFrame: Math.round(random(duration * 0.04, duration * 0.18)),
        lastFrame: Math.round(random(duration * 0.34, duration * 0.84)),
      });
    }

    // Nucleo branco irregular: uma massa unica, serrilhada, com pontas e
    // mordidas. E rasterizada em retangulos para ficar 1-bit, nao uma curva lisa.
    const lobes = [];
    const spikeAngles = [];
    const lobeCount = Math.round((9 + charge * 9) * variantShape.lobes);
    const spikeCount = Math.round((10 + charge * 18) * variantShape.spikes);
    const cell = Math.max(4 * scale, Math.round(radius / 150));
    const splatLimit = Math.round(coreRadius * 1.78);

    for (let i = 0; i < lobeCount; i += 1) {
      lobes.push({
        angle: random(0, Math.PI * 2),
        width: variant === "star" ? random(0.08, 0.22) : random(0.16, 0.52),
        amp: variant === "star" ? random(-0.34, 0.18) : random(-0.26, 0.42),
      });
    }

    for (let i = 0; i < spikeCount; i += 1) {
      spikeAngles.push({
        angle: variant === "tear" && Math.random() < 0.38 ? tearAngle + random(-0.32, 0.32) : random(0, Math.PI * 2),
        width: variant === "star" ? random(0.012, 0.045) : random(0.018, 0.075),
        length: random(0.45, 1.35 + charge * 0.65) * variantShape.spikeLength,
      });
    }

    for (let y = -splatLimit; y <= splatLimit; y += cell) {
      for (let x = -splatLimit; x <= splatLimit; x += cell) {
        const angle = Math.atan2(y, x);
        const distance = Math.hypot(x, y);
        let boundary = coreRadius * (variantShape.base + 0.08 * Math.sin(angle * 7) + 0.06 * Math.sin(angle * 13));

        for (const lobe of lobes) {
          const falloff = Math.max(0, 1 - angleDistance(angle, lobe.angle) / lobe.width);
          boundary += coreRadius * lobe.amp * falloff * falloff;
        }

        for (const spike of spikeAngles) {
          const falloff = Math.max(0, 1 - angleDistance(angle, spike.angle) / spike.width);
          boundary += coreRadius * spike.length * falloff * falloff * falloff;
        }

        if (variant === "tear") {
          const front = Math.max(0, 1 - angleDistance(angle, tearAngle) / 0.55);
          const back = Math.max(0, 1 - angleDistance(angle, tearAngle + Math.PI) / 0.42);
          boundary += coreRadius * 1.25 * front * front;
          boundary += coreRadius * 0.48 * back * back;
        }

        const edgeNoise = random(-cell * 1.6, cell * 1.6);
        if (distance > boundary + edgeNoise) continue;

        let insideHole = false;
        for (const hole of this.holes) {
          const hx = x - hole.x;
          const hy = y - hole.y;
          if ((hx * hx) / ((hole.w * 0.62) ** 2) + (hy * hy) / ((hole.h * 0.62) ** 2) < 1) {
            insideHole = true;
            break;
          }
        }
        if (insideHole && Math.random() < 0.76) continue;

        this.core.push({
          x,
          y,
          w: cell,
          h: cell,
          firstFrame: Math.round(random(0, duration * 0.05)),
          lastFrame: Math.round(random(duration * 0.34, duration * 0.74)),
        });
      }
    }

    // Alguns rasgos brancos longos ligados ao corpo, como os braços do exemplo.
    for (let i = 0; i < Math.round((8 + charge * 14) * variantShape.arms); i += 1) {
      const angle = variant === "tear" && Math.random() < 0.48 ? tearAngle + random(-0.45, 0.45) : random(0, Math.PI * 2);
      const start = random(coreRadius * 0.2, coreRadius * 0.78);
      const length = random(coreRadius * 0.5, coreRadius * (1.45 + charge)) * variantShape.arms;
      const width = Math.round(random(2, 5 + charge * 8)) * scale;
      this.core.push({
        x: Math.round(Math.cos(angle) * (start + length * 0.5)),
        y: Math.round(Math.sin(angle) * (start + length * 0.5)),
        w: Math.max(width, Math.round(Math.abs(Math.cos(angle)) * length)),
        h: Math.max(width, Math.round(Math.abs(Math.sin(angle)) * length)),
        firstFrame: Math.round(random(0, duration * 0.08)),
        lastFrame: Math.round(random(duration * 0.28, duration * 0.68)),
      });
    }

    // Clusters de pixels ao redor, como sujeira de impressao disparada.
    for (let i = 0; i < Math.round(90 * densityBoost * (variant === "splat" ? 1.35 : 0.9)); i += 1) {
      const angle = random(0, Math.PI * 2);
      const distance = random(coreRadius * 0.65, radius * 1.15);
      this.clusters.push({
        x: Math.round(Math.cos(angle) * distance),
        y: Math.round(Math.sin(angle) * distance),
        w: (Math.random() < 0.8 ? 2 : 3) * scale,
        h: (Math.random() < 0.8 ? 2 : 3) * scale,
        firstFrame: Math.round(random(duration * 0.08, duration * 0.26)),
        lastFrame: Math.round(random(duration * 0.36, duration * 0.88)),
      });
    }

    const stamp = chooseExplosionStamp();
    if (stamp) {
      this.variant = stamp.name;
      this.core = [];
      this.holes = [];
      this.clusters = [];
      this.buildFromStamp(stamp, scale);
    }

    // Os pixels brancos locais viram os "tijolos" da forma. Em vez de voarem
    // em trajetorias radiais, eles sao remapeados para celulas do carimbo.
    for (const pixel of this.affected) {
      const target = this.core[Math.floor(Math.random() * this.core.length)] || { x: 0, y: 0, w: scale, h: scale };
      pixel.targetX = target.x + Math.round(random(0, target.w));
      pixel.targetY = target.y + Math.round(random(0, target.h));
      pixel.restoreFrame = Math.round(random(duration * 0.52, duration * 0.96) * RETURN_SLOWNESS);
    }

    if (IS_MOBILE) {
      this.buildMobileFrames();
    }
  }

  buildFromStamp(stamp, scale) {
    const stampSize = this.radius * (IS_MOBILE ? 0.66 + this.charge * 0.1 : 0.82 + this.charge * 0.32);
    const cellScale = Math.max(1, Math.round(stampSize / (IS_MOBILE ? 900 : 360)));
    const keepEvery = Math.max(1, Math.round(stamp.cells.length / (IS_MOBILE ? 7000 : 14000)));

    for (let i = 0; i < stamp.cells.length; i += keepEvery) {
      const cell = stamp.cells[i];
      if (Math.random() < 0.08) continue;

      const x = Math.round(cell.x * stampSize);
      const y = Math.round(cell.y * stampSize);
      const rawSize = Math.max(1, Math.round(cell.size * stampSize) * cellScale);
      const size = IS_MOBILE ? clamp(rawSize, 2, 4) : Math.max(3 * scale, rawSize + scale);

      this.core.push({
        x,
        y,
        w: size,
        h: size,
        firstFrame: Math.round(random(0, this.duration * 0.05)),
        lastFrame: Math.round(random(this.duration * 0.42, this.duration * 0.88)),
      });
    }

    if (!IS_MOBILE) {
      this.addDesktopStampBody(stampSize, scale);
    }

    this.holes = [];
  }

  addDesktopStampBody(stampSize, scale) {
    const rx = Math.round(stampSize * lerp(0.18, 0.25, this.charge));
    const ry = Math.round(stampSize * lerp(0.13, 0.19, this.charge));
    const step = Math.max(3 * scale, Math.round(stampSize / 170));

    for (let y = -ry; y <= ry; y += step) {
      const normalizedY = y / ry;
      const band = Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
      const tear = 0.82 + 0.1 * Math.sin(y * 0.11) + 0.08 * Math.sin(y * 0.31);
      const halfWidth = Math.round(rx * band * tear);
      const jagLeft = Math.round(step * 1.4 * Math.sin(y * 0.17));
      const jagRight = Math.round(step * 1.8 * Math.sin(y * 0.13 + 1.5));

      this.core.push({
        x: -halfWidth + jagLeft,
        y,
        w: Math.max(step, halfWidth * 2 + jagRight - jagLeft),
        h: step,
        firstFrame: 0,
        lastFrame: Math.round(this.duration * 0.74),
      });
    }
  }

  update() {
    this.frame += 1;
    return this.frame <= this.duration;
  }

  draw() {
    if (IS_MOBILE && this.mobileFrames.length > 0) {
      this.drawMobileFrame();
      return;
    }

    this.eraseLocalWhitePixels();
    this.drawDisplacedPixels();
    this.drawCore();
    this.drawHoles();
    this.drawClusters();
  }

  buildMobileFrames() {
    if (this.core.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const cell of this.core) {
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x + cell.w);
      maxY = Math.max(maxY, cell.y + cell.h);
    }

    const pad = IS_MOBILE ? 14 : 4;
    const width = Math.max(1, Math.ceil(maxX - minX + pad * 2));
    const height = Math.max(1, Math.ceil(maxY - minY + pad * 2));
    this.mobileFrameX = Math.round(minX - pad);
    this.mobileFrameY = Math.round(minY - pad);

    for (let frameIndex = 0; frameIndex < MOBILE_BLAST_SPRITE_FRAMES; frameIndex += 1) {
      const sprite = document.createElement("canvas");
      const spriteCtx = sprite.getContext("2d", { alpha: true });
      const greenSprite = document.createElement("canvas");
      const greenCtx = greenSprite.getContext("2d", { alpha: true });

      sprite.width = width;
      sprite.height = height;
      greenSprite.width = width;
      greenSprite.height = height;
      spriteCtx.imageSmoothingEnabled = false;
      greenCtx.imageSmoothingEnabled = false;
      spriteCtx.fillStyle = "#fff";

      for (const cell of this.core) {
        const cellX = Math.round(cell.x - this.mobileFrameX);
        const cellY = Math.round(cell.y - this.mobileFrameY);
        const inkPad = IS_MOBILE ? MOBILE_STAMP_INK_PAD : 0;
        spriteCtx.fillRect(
          cellX - inkPad,
          cellY - inkPad,
          cell.w + inkPad * 2,
          cell.h + inkPad * 2,
        );
      }

      if (IS_MOBILE) {
        fillMobileStampBody(spriteCtx, width, height, this.charge);
        thickenStampSprite(sprite, spriteCtx);
      }

      greenCtx.drawImage(sprite, 0, 0);
      greenCtx.globalCompositeOperation = "source-in";
      greenCtx.drawImage(
        phraseGreenCanvas,
        Math.round(this.x + this.mobileFrameX),
        Math.round(this.y + this.mobileFrameY),
        width,
        height,
        0,
        0,
        width,
        height,
      );
      greenCtx.globalCompositeOperation = "source-over";

      this.mobileFrames.push(sprite);
      this.mobileGreenFrames.push(greenSprite);
    }
  }

  drawMobileFrame() {
    const frameIndex = Math.min(
      this.mobileFrames.length - 1,
      Math.floor((this.frame / Math.max(1, this.duration)) * this.mobileFrames.length),
    );
    const sprite = this.mobileFrames[frameIndex];
    ctx.drawImage(sprite, this.x + this.mobileFrameX, this.y + this.mobileFrameY);
    if (this.mobileGreenFrames[frameIndex]) {
      ctx.drawImage(this.mobileGreenFrames[frameIndex], this.x + this.mobileFrameX, this.y + this.mobileFrameY);
    }
  }

  eraseLocalWhitePixels() {
    ctx.fillStyle = "#000";
    for (const pixel of this.affected) {
      if (this.frame < pixel.phaseOffset) continue;
      if (this.frame >= pixel.restoreFrame) continue;
      ctx.fillRect(pixel.x, pixel.y, pixel.size, pixel.size);
    }
  }

  drawDisplacedPixels() {
    const start = Math.round(this.duration * 0.1);
    const end = Math.round(this.duration * 0.42);
    if (this.frame < start || this.frame > end) return;

    ctx.fillStyle = "#fff";
    for (const pixel of this.affected) {
      if (this.frame < pixel.phaseOffset) continue;

      const amount = this.frame < this.duration * 0.28 ? 1 : 0.55;
      if (Math.random() > (this.frame < this.duration * 0.28 ? 0.72 : 0.32)) continue;

      const x = Math.round(this.x + pixel.targetX * amount);
      const y = Math.round(this.y + pixel.targetY * amount);
      ctx.fillRect(x, y, pixel.size, pixel.size);
    }
  }

  drawCore() {
    if (this.frame > this.duration * 0.58) return;

    ctx.fillStyle = "#fff";
    for (const cell of this.core) {
      if (this.frame < cell.firstFrame || this.frame > cell.lastFrame) continue;
      ctx.fillRect(this.x + cell.x, this.y + cell.y, cell.w, cell.h);
    }
  }

  drawHoles() {
    if (this.frame < 1 || this.frame > this.duration * 0.8) return;

    ctx.fillStyle = "#000";
    for (const hole of this.holes) {
      if (this.frame < hole.firstFrame || this.frame > hole.lastFrame) continue;
      ctx.fillRect(this.x + hole.x, this.y + hole.y, hole.w, hole.h);
    }
  }

  drawClusters() {
    if (this.frame < 3 || this.frame > this.duration) return;

    ctx.fillStyle = "#fff";
    for (const dot of this.clusters) {
      if (this.frame < dot.firstFrame || this.frame > dot.lastFrame) continue;
      ctx.fillRect(this.x + dot.x, this.y + dot.y, dot.w, dot.h);
    }
  }
}

function thickenStampSprite(sprite, spriteCtx) {
  const copy = document.createElement("canvas");
  const copyCtx = copy.getContext("2d", { alpha: true });
  const offsets = [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ];

  copy.width = sprite.width;
  copy.height = sprite.height;
  copyCtx.imageSmoothingEnabled = false;
  copyCtx.drawImage(sprite, 0, 0);

  for (const [dx, dy] of offsets) {
    spriteCtx.drawImage(copy, dx, dy);
  }
}

function fillMobileStampBody(spriteCtx, width, height, charge) {
  const cx = Math.round(width * 0.5);
  const cy = Math.round(height * 0.52);
  const rx = Math.round(width * lerp(0.27, 0.36, charge));
  const ry = Math.round(height * lerp(0.2, 0.28, charge));
  const step = 4;

  spriteCtx.fillStyle = "#fff";
  for (let y = -ry; y <= ry; y += step) {
    const normalizedY = y / ry;
    const band = Math.sqrt(Math.max(0, 1 - normalizedY * normalizedY));
    const tear = 0.86 + 0.12 * Math.sin(y * 0.17) + 0.08 * Math.sin(y * 0.41);
    const halfWidth = Math.round(rx * band * tear);
    const jagLeft = Math.round(6 * Math.sin(y * 0.23) + 3 * Math.sin(y * 0.61));
    const jagRight = Math.round(7 * Math.sin(y * 0.19 + 1.8) + 4 * Math.sin(y * 0.47));

    spriteCtx.fillRect(
      cx - halfWidth + jagLeft,
      cy + y,
      Math.max(step, halfWidth * 2 + jagRight - jagLeft),
      step,
    );
  }
}

function drawBase() {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(baseCanvas, 0, 0);
}

function drawGreenTextInsideBlasts() {
  if (!state.phraseReady) return;

  for (const blast of state.blasts) {
    if (blast.frame > blast.duration * 0.88) continue;

    ctx.save();
    ctx.beginPath();
    let visibleArea = 0;
    for (const cell of blast.core) {
      if (blast.frame < cell.firstFrame || blast.frame > cell.lastFrame) continue;
      visibleArea += cell.w * cell.h;
      ctx.rect(blast.x + cell.x, blast.y + cell.y, cell.w, cell.h);
    }
    if (IS_MOBILE && visibleArea < state.width * state.height * 0.006) {
      ctx.restore();
      continue;
    }
    ctx.clip();
    ctx.drawImage(phraseGreenCanvas, 0, 0);
    ctx.restore();
  }
}

function checkGreenCoverageTrigger() {
  // Desktop e mobile agora usam o mesmo gesto: clique longo perto do centro.
  // Isso evita falsos positivos de cobertura e impede a tela preta prematura.
  return;
  if (IS_MOBILE) return;
  if (state.transition || state.phraseCoverageIndices.length === 0 || state.blasts.length === 0) return;

  coverageCtx.clearRect(0, 0, state.coverageWidth, state.coverageHeight);
  coverageCtx.fillStyle = "#fff";

  for (const blast of state.blasts) {
    if (blast.frame > blast.duration * 0.88) continue;
    for (const cell of blast.core) {
      if (blast.frame < cell.firstFrame || blast.frame > cell.lastFrame) continue;
      coverageCtx.fillRect(
        Math.floor((blast.x + cell.x) / PHRASE_COVERAGE_STEP),
        Math.floor((blast.y + cell.y) / PHRASE_COVERAGE_STEP),
        Math.max(1, Math.ceil(cell.w / PHRASE_COVERAGE_STEP)),
        Math.max(1, Math.ceil(cell.h / PHRASE_COVERAGE_STEP)),
      );
    }
  }

  const coverage = coverageCtx.getImageData(0, 0, state.coverageWidth, state.coverageHeight).data;
  let covered = 0;

  for (const index of state.phraseCoverageIndices) {
    if (coverage[index * 4] > 0) covered += 1;
  }

  if (covered / state.phraseCoverageIndices.length >= GREEN_TRIGGER_RATIO) {
    startSceneTransition();
  }
}

function startSceneTransition() {
  if (state.transition) return;

  const nextIndex = nextSceneIndex();
  const transition = {
    frame: 0,
    duration: REORGANIZE_DURATION,
    nextIndex,
    ditherImg: null,
    phraseImg: null,
    finalCanvas: null,
    currentDissolvePoints: [],
    dissolveCanvas: null,
    dissolveCtx: null,
    dissolveEraseIndex: 0,
    finalStampCanvas: null,
    mobileReadablePhrase: false,
    mobileGreenHoldCanvas: null,
    greenHoldCanvas: null,
    blastHoldCanvas: null,
    ready: false,
  };

  transition.greenHoldCanvas = buildGreenHoldCanvas();
  transition.blastHoldCanvas = buildBlastHoldCanvas();

  state.transition = transition;
  Promise.all([
    loadImageElement(SCENES[nextIndex].dither),
    loadImageElement(SCENES[nextIndex].phrase),
  ]).then(([ditherImg, phraseImg]) => {
    transition.ditherImg = ditherImg;
    transition.phraseImg = phraseImg;
    transition.finalCanvas = buildFinalSceneCanvas(ditherImg, phraseImg);
    setupDissolveTransition(transition);
    transition.ready = true;
  });
}

function backgroundDissolveBlockSize() {
  return IS_MOBILE ? 18 : 28;
}

function fadeOutFrames() {
  return IS_MOBILE ? MOBILE_FADE_OUT_FRAMES : DESKTOP_FADE_OUT_FRAMES;
}

function setupDissolveTransition(transition) {
  const dissolveCanvas = document.createElement("canvas");
  const dissolveCtx = dissolveCanvas.getContext("2d", { alpha: false });
  const finalStampCanvas = document.createElement("canvas");
  const finalStampCtx = finalStampCanvas.getContext("2d", { alpha: true });

  dissolveCanvas.width = state.width;
  dissolveCanvas.height = state.height;
  finalStampCanvas.width = state.width;
  finalStampCanvas.height = state.height;
  dissolveCtx.imageSmoothingEnabled = false;
  finalStampCtx.imageSmoothingEnabled = false;
  dissolveCtx.drawImage(baseCanvas, 0, 0);
  if (state.phraseReady) {
    dissolveCtx.drawImage(phraseCanvas, 0, 0);
  }
  if (transition.blastHoldCanvas) {
    finalStampCtx.drawImage(transition.blastHoldCanvas, 0, 0);
  }
  if (transition.greenHoldCanvas) {
    finalStampCtx.drawImage(transition.greenHoldCanvas, 0, 0);
  }

  transition.dissolveCanvas = dissolveCanvas;
  transition.dissolveCtx = dissolveCtx;
  transition.dissolveEraseIndex = 0;
  transition.finalStampCanvas = finalStampCanvas;
  transition.currentDissolvePoints = shuffle(collectCurrentDissolvePoints());
}

function collectCurrentDissolvePoints() {
  const points = [];
  const step = backgroundDissolveBlockSize();

  for (let y = 0; y < state.height; y += step) {
    for (let x = 0; x < state.width; x += step) {
      points.push({ x, y, size: step });
    }
  }

  return points;
}

function drawDissolveTransition(transition, localFrame) {
  if (localFrame >= REORGANIZE_DURATION - 1 && transition.finalCanvas) {
    ctx.drawImage(transition.finalCanvas, 0, 0);
    return;
  }

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, state.width, state.height);

  const outFrames = fadeOutFrames();

  if (localFrame < outFrames) {
    const progress = clamp(localFrame / outFrames, 0, 1);
    const eraseCount = Math.floor(transition.currentDissolvePoints.length * progress);
    if (transition.dissolveCtx && eraseCount > transition.dissolveEraseIndex) {
      transition.dissolveCtx.fillStyle = "#000";
      for (let i = transition.dissolveEraseIndex; i < eraseCount; i += 1) {
        const point = transition.currentDissolvePoints[i];
        transition.dissolveCtx.fillRect(point.x, point.y, point.size, point.size);
      }
      transition.dissolveEraseIndex = eraseCount;
    }
    if (transition.dissolveCanvas) {
      ctx.drawImage(transition.dissolveCanvas, 0, 0);
    }
    if (transition.finalStampCanvas) {
      ctx.drawImage(transition.finalStampCanvas, 0, 0);
    }
    return;
  }

  if (transition.finalCanvas) {
    ctx.drawImage(transition.finalCanvas, 0, 0);
  }
}

function buildBlastHoldCanvas() {
  const holdCanvas = document.createElement("canvas");
  const holdCtx = holdCanvas.getContext("2d", { alpha: true });

  holdCanvas.width = state.width;
  holdCanvas.height = state.height;
  holdCtx.imageSmoothingEnabled = false;
  holdCtx.fillStyle = "#fff";

  for (const blast of state.blasts) {
    if (blast.mobileFrames && blast.mobileFrames[0]) {
      holdCtx.drawImage(
        blast.mobileFrames[0],
        blast.x + blast.mobileFrameX,
        blast.y + blast.mobileFrameY,
      );
      continue;
    }

    for (const cell of blast.core) {
      if (blast.frame < cell.firstFrame || blast.frame > cell.lastFrame) continue;
      holdCtx.fillRect(blast.x + cell.x, blast.y + cell.y, cell.w, cell.h);
    }
  }

  return holdCanvas;
}

function buildGreenHoldCanvas() {
  const holdCanvas = document.createElement("canvas");
  const holdCtx = holdCanvas.getContext("2d", { alpha: true });

  holdCanvas.width = state.width;
  holdCanvas.height = state.height;
  holdCtx.imageSmoothingEnabled = false;

  for (const blast of state.blasts) {
    if (blast.mobileGreenFrames && blast.mobileGreenFrames[0]) {
      holdCtx.drawImage(
        blast.mobileGreenFrames[0],
        blast.x + blast.mobileFrameX,
        blast.y + blast.mobileFrameY,
      );
      continue;
    }

    holdCtx.save();
    holdCtx.beginPath();
    for (const cell of blast.core) {
      if (blast.frame < cell.firstFrame || blast.frame > cell.lastFrame) continue;
      holdCtx.rect(blast.x + cell.x, blast.y + cell.y, cell.w, cell.h);
    }
    holdCtx.clip();
    holdCtx.drawImage(phraseGreenCanvas, 0, 0);
    holdCtx.restore();
  }

  return holdCanvas;
}

function buildFinalSceneCanvas(ditherImg, phraseImg) {
  const { width, height } = renderSizeForImage(ditherImg);
  const finalCanvas = document.createElement("canvas");
  const finalCtx = finalCanvas.getContext("2d", { willReadFrequently: true });
  const ditherCanvas = document.createElement("canvas");
  const ditherCtx = ditherCanvas.getContext("2d", { willReadFrequently: true });
  const phraseSource = document.createElement("canvas");
  const phraseSourceCtx = phraseSource.getContext("2d", { willReadFrequently: true });

  finalCanvas.width = width;
  finalCanvas.height = height;
  ditherCanvas.width = width;
  ditherCanvas.height = height;
  ditherCtx.imageSmoothingEnabled = false;
  finalCtx.imageSmoothingEnabled = false;
  ditherCtx.drawImage(ditherImg, 0, 0, width, height);

  const ditherPixels = ditherCtx.getImageData(0, 0, width, height);
  const output = finalCtx.createImageData(width, height);

  for (let i = 0; i < width * height; i += 1) {
    const pixelIndex = i * 4;
    const white = isWhiteInk(
      ditherPixels.data[pixelIndex],
      ditherPixels.data[pixelIndex + 1],
      ditherPixels.data[pixelIndex + 2],
      ditherPixels.data[pixelIndex + 3],
    ) ? 255 : 0;

    output.data[pixelIndex] = white;
    output.data[pixelIndex + 1] = white;
    output.data[pixelIndex + 2] = white;
    output.data[pixelIndex + 3] = 255;
  }

  finalCtx.putImageData(output, 0, 0);

  phraseSource.width = phraseImg.naturalWidth || phraseImg.width;
  phraseSource.height = phraseImg.naturalHeight || phraseImg.height;
  phraseSourceCtx.imageSmoothingEnabled = false;
  phraseSourceCtx.drawImage(phraseImg, 0, 0);

  const phrasePixels = phraseSourceCtx.getImageData(0, 0, phraseSource.width, phraseSource.height);
  const scale = Math.min(width / phraseSource.width, height / phraseSource.height);
  const drawW = Math.round(phraseSource.width * scale);
  const drawH = Math.round(phraseSource.height * scale);
  const offsetX = Math.round((width - drawW) / 2);
  const offsetY = Math.round((height - drawH) / 2);

  finalCtx.fillStyle = "#000";
  for (let y = 0; y < drawH; y += 1) {
    for (let x = 0; x < drawW; x += 1) {
      const sx = Math.floor((x / drawW) * phraseSource.width);
      const sy = Math.floor((y / drawH) * phraseSource.height);
      const sourceIndex = (sy * phraseSource.width + sx) * 4;
      if (phrasePixels.data[sourceIndex + 3] < 40) continue;
      finalCtx.fillRect(offsetX + x, offsetY + y, 1, 1);
    }
  }

  return finalCanvas;
}

function drawSceneTransition() {
  if (!state.transition) return;

  const transition = state.transition;
  if (!transition.ready) {
    if (transition.greenHoldCanvas) ctx.drawImage(transition.greenHoldCanvas, 0, 0);
    return;
  }

  drawDissolveTransition(transition, transition.frame);

  transition.frame += 1;
  if (transition.frame > transition.duration && transition.ready) {
    applyScene(transition.nextIndex, transition.ditherImg, transition.phraseImg);
    state.transition = null;
  }
}

function drawChargeFeedback(now) {
  if (!state.charging) return;

  const charge = chargeFromTime(now - state.charging.startTime);
  const scale = stampScale();
  const cx = state.charging.x;
  const cy = state.charging.y;
  const readyCharge = IS_MOBILE ? MOBILE_SCENE_TRIGGER_CHARGE : DESKTOP_SCENE_TRIGGER_CHARGE;
  const ready = charge >= readyCharge;
  const tick = Math.floor(now / 90);
  const radius = Math.round(lerp(11, IS_MOBILE ? 27 : 34, charge) * scale);
  const finalPush = clamp((charge - 0.78) / 0.22, 0, 1);
  const dot = Math.max(1, Math.round((ready ? 2 : 1 + finalPush * 0.6) * scale));
  const dots = Math.round(lerp(IS_MOBILE ? 22 : 28, IS_MOBILE ? 50 : 66, charge) + finalPush * (IS_MOBILE ? 38 : 54));
  const density = lerp(0.88, ready ? 1 : 0.96, charge);
  const pulse = ready && tick % 2 === 0 ? scale : 0;

  ctx.fillStyle = "#fff";

  // Reticula de carga: pontos brancos secos que tremem e adensam, sem circulo
  // de raio visivel. A distribuicao por ruido evita a cara de grid tecnico.
  ctx.fillRect(Math.round(cx - dot - pulse), Math.round(cy - dot - pulse), dot * 2 + pulse * 2, dot * 2 + pulse * 2);

  for (let i = 0; i < dots; i += 1) {
    const angle = hashUnit(i, 4, 1) * Math.PI * 2;
    const distance = Math.sqrt(hashUnit(i, 9, 2)) * radius;
    const noise = hashUnit(i, tick, ready ? 12 : 5);
    if (!ready && noise > density) continue;

    const drift = ready ? 0 : (hashUnit(i, tick, 7) - 0.5) * 4 * scale;
    const crushX = (hashUnit(i, 14, tick) - 0.5) * radius * 0.28 * charge;
    const crushY = (hashUnit(i, 21, tick) - 0.5) * radius * 0.18 * charge;
    const x = Math.round(cx + Math.cos(angle) * distance + crushX + drift);
    const y = Math.round(cy + Math.sin(angle) * distance + crushY - drift);

    ctx.fillRect(x, y, dot, dot);
  }

  if (ready) {
    const arm = Math.round(6 * scale);
    const unit = Math.max(1, scale);
    ctx.fillRect(Math.round(cx - arm), Math.round(cy), arm * 2, unit);
    ctx.fillRect(Math.round(cx), Math.round(cy - arm), unit, arm * 2);
    ctx.fillRect(Math.round(cx - arm * 0.55), Math.round(cy - arm * 0.55), unit, unit);
    ctx.fillRect(Math.round(cx + arm * 0.55), Math.round(cy - arm * 0.55), unit, unit);
    ctx.fillRect(Math.round(cx - arm * 0.55), Math.round(cy + arm * 0.55), unit, unit);
    ctx.fillRect(Math.round(cx + arm * 0.55), Math.round(cy + arm * 0.55), unit, unit);
  }
}

function drawDebug() {
  if (!state.debug) return;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 620, 124);
  ctx.fillStyle = "#fff";
  ctx.font = "18px monospace";
  ctx.textBaseline = "top";
  ctx.fillText(`image: ${state.width} x ${state.height}`, 10, 8);
  ctx.fillText(`last affected: ${state.lastAffected} | blasts: ${state.blasts.length}`, 10, 30);
  ctx.fillText(`variant: ${state.lastVariant || "-"}`, 10, 52);
  ctx.fillText(`scene: ${state.sceneIndex + 1 || "-"} | queue: ${state.sceneBag.length}`, 10, 74);
  if (state.charging) {
    const charge = chargeFromTime(performance.now() - state.charging.startTime);
    ctx.fillText(`charging: ${Math.round(charge * 100)}% | radius: ${radiusFromCharge(charge)}`, 10, 96);
  }
}

function drawMessage() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.fillStyle = "#fff";
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(state.message, Math.round(state.width / 2), Math.round(state.height / 2));
  ctx.textAlign = "start";
}

function reset() {
  state.blasts = [];
  state.lastAffected = 0;
  state.lastStampIndex = -1;
  state.transition = null;
  state.charging = null;
}

function rememberCaptureFrame(now) {
  if (now - state.lastCaptureSampleAt < CAPTURE_SAMPLE_MS) return;

  const frameCanvas = document.createElement("canvas");
  const frameCtx = frameCanvas.getContext("2d", { alpha: false });
  frameCanvas.width = state.width;
  frameCanvas.height = state.height;
  frameCtx.imageSmoothingEnabled = false;
  frameCtx.drawImage(canvas, 0, 0);

  state.captureFrames.push({ time: now, canvas: frameCanvas });
  state.lastCaptureSampleAt = now;

  const oldestTime = now - CAPTURE_HISTORY_MS;
  state.captureFrames = state.captureFrames.filter((frame) => frame.time >= oldestTime);
}

async function shareOrDownloadBlob(blob) {
  const file = new File([blob], `paisagem-${Date.now()}.png`, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({
        files: [file],
        title: "paisagem",
      });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function captureDelayedFrame() {
  const targetTime = performance.now() - CAPTURE_DELAY_MS;
  const fallback = state.captureFrames[state.captureFrames.length - 1];
  const frame = [...state.captureFrames].reverse().find((item) => item.time <= targetTime) || fallback;
  const source = frame ? frame.canvas : canvas;

  source.toBlob((blob) => {
    if (!blob) return;
    shareOrDownloadBlob(blob);
  }, "image/png");
}

function animate(now) {
  if (!state.ready) {
    drawMessage();
    rememberCaptureFrame(now);
    requestAnimationFrame(animate);
    return;
  }

  // A cidade e uma base fixa. A cada frame restauramos o poster inteiro e
  // redesenhamos somente danos locais ativos por cima.
  drawBase();
  if (state.phraseReady) {
    ctx.drawImage(phraseCanvas, 0, 0);
  }
  state.blasts = state.blasts.filter((blast) => {
    blast.draw();
    return blast.update();
  });
  if (!state.transition && !IS_MOBILE) {
    drawGreenTextInsideBlasts();
  }
  checkGreenCoverageTrigger();
  drawSceneTransition();
  drawChargeFeedback(now);
  drawDebug();
  rememberCaptureFrame(now);

  requestAnimationFrame(animate);
}

function startCharge(event) {
  event.preventDefault();
  canvas.focus();
  const point = canvasPoint(event);
  if (!isInsideCanvas(point)) return;

  canvas.setPointerCapture(event.pointerId);

  state.charging = {
    pointerId: event.pointerId,
    x: point.x,
    y: point.y,
    startTime: performance.now(),
  };
}

function moveCharge(event) {
  if (!state.charging || state.charging.pointerId !== event.pointerId) return;
  event.preventDefault();
}

function releaseCharge(event) {
  if (!state.charging || state.charging.pointerId !== event.pointerId) return;
  event.preventDefault();

  const heldTime = performance.now() - state.charging.startTime;
  const charge = chargeFromTime(heldTime);
  const x = state.charging.x;
  const y = state.charging.y;
  triggerBlast(x, y, charge);
  state.charging = null;

  if (
    (
      (IS_MOBILE && charge >= MOBILE_SCENE_TRIGGER_CHARGE && isNearMobileSceneTrigger(x, y)) ||
      (!IS_MOBILE && charge >= DESKTOP_SCENE_TRIGGER_CHARGE && isNearDesktopSceneTrigger(x, y))
    ) &&
    !state.transition
  ) {
    startSceneTransition();
    if (state.transition) {
      state.transition.mobileReadablePhrase = true;
      state.transition.greenHoldCanvas = buildGreenHoldCanvas();
    }
  }

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function cancelCharge(event) {
  if (!state.charging || state.charging.pointerId !== event.pointerId) return;
  state.charging = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

canvas.addEventListener("pointerdown", startCharge);
canvas.addEventListener("pointermove", moveCharge);
canvas.addEventListener("pointerup", releaseCharge);
canvas.addEventListener("pointercancel", cancelCharge);
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
canvas.addEventListener("selectstart", (event) => event.preventDefault());
canvas.addEventListener("dragstart", (event) => event.preventDefault());
if (captureButton) {
  captureButton.addEventListener("click", captureDelayedFrame);
}

window.addEventListener("keydown", (event) => {
  if (event.key === "r" || event.key === "R") reset();
  if (event.key === "d" || event.key === "D") state.debug = !state.debug;
  if (event.key === "c" || event.key === "C") captureDelayedFrame();
});

resizeCanvas(FALLBACK_WIDTH, FALLBACK_HEIGHT);
loadExplosionStamps();
loadScene(nextSceneIndex());
requestAnimationFrame(animate);
