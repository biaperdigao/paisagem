const IS_MOBILE = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
const MIN_BLAST_RADIUS = IS_MOBILE ? 260 : 700;
const MAX_BLAST_RADIUS = IS_MOBILE ? 1250 : 3600;
const MAX_CHARGE_TIME = 1600;
const MIN_BLAST_DURATION = 40;
const MAX_BLAST_DURATION = 160;
const RETURN_SLOWNESS = 1.25;
const JITTER_DENSITY = IS_MOBILE ? 0.16 : 0.35;
const SCENE_COUNT = 12;
const GREEN_TRIGGER_RATIO = 0.93;
const PHRASE_COVERAGE_STEP = 32;
const TEXT_GREEN_HOLD_FRAMES = 108;
const TEXT_WHITE_HOLD_FRAMES = 18;
const REORGANIZE_DURATION = IS_MOBILE ? 120 : 140;
const REVEAL_SAMPLE_STEP = IS_MOBILE ? 3 : 3;
const REVEAL_DOT_SIZE = IS_MOBILE ? 1 : 2;
const MAX_CANVAS_WIDTH = IS_MOBILE ? 720 : 1400;
const MAX_CANVAS_HEIGHT = IS_MOBILE ? 960 : 1867;
const ASSET_VERSION = "2026-05-12-mobile-fix-1";

const IMAGE_SRC = "cidade-dither.png";
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
const PHRASE_SRC = "cidade_frase.png";
const POSTER_TEXT_GREEN = "#66f05f";

const canvas = document.querySelector("#poster");
const ctx = canvas.getContext("2d", { alpha: false });

const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
const baseCanvas = document.createElement("canvas");
const baseCtx = baseCanvas.getContext("2d", { alpha: false });
const phraseCanvas = document.createElement("canvas");
const phraseCtx = phraseCanvas.getContext("2d", { willReadFrequently: true });
const phraseGreenCanvas = document.createElement("canvas");
const phraseGreenCtx = phraseGreenCanvas.getContext("2d", { willReadFrequently: true });
const phraseWhiteCanvas = document.createElement("canvas");
const phraseWhiteCtx = phraseWhiteCanvas.getContext("2d", { willReadFrequently: true });
const coverageCanvas = document.createElement("canvas");
const coverageCtx = coverageCanvas.getContext("2d", { willReadFrequently: true });

ctx.imageSmoothingEnabled = false;
sourceCtx.imageSmoothingEnabled = false;
baseCtx.imageSmoothingEnabled = false;
phraseCtx.imageSmoothingEnabled = false;
phraseGreenCtx.imageSmoothingEnabled = false;
phraseWhiteCtx.imageSmoothingEnabled = false;
coverageCtx.imageSmoothingEnabled = false;

const state = {
  width: FALLBACK_WIDTH,
  height: FALLBACK_HEIGHT,
  whiteMask: new Uint8Array(0),
  blasts: [],
  debug: false,
  ready: false,
  message: "carregando cidade-dither.png",
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
  state.message = `carregando cena ${sceneIndex + 1}`;

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

function loadImage() {
  const img = new Image();

  img.onload = () => {
    const { width, height } = renderSizeForImage(img);

    resizeCanvas(width, height);
    buildFixedBitmapBase(img);
    if (state.phraseImage) {
      buildPhraseLayers(state.phraseImage);
      state.phraseReady = true;
    }
    state.ready = true;
    state.message = "";
  };

  img.onerror = () => {
    resizeCanvas(FALLBACK_WIDTH, FALLBACK_HEIGHT);
    state.ready = false;
    state.message = "arquivo cidade-dither.png nao encontrado";
  };

  img.src = `${IMAGE_SRC}?v=${ASSET_VERSION}`;
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

function loadPhraseImage() {
  const img = new Image();

  img.onload = () => {
    state.phraseImage = img;
    buildPhraseLayers(img);
    state.phraseReady = true;
  };

  img.src = `${PHRASE_SRC}?v=${ASSET_VERSION}`;
}

function buildPhraseLayers(img) {
  phraseCanvas.width = state.width;
  phraseCanvas.height = state.height;
  phraseGreenCanvas.width = state.width;
  phraseGreenCanvas.height = state.height;
  phraseWhiteCanvas.width = state.width;
  phraseWhiteCanvas.height = state.height;

  const source = document.createElement("canvas");
  const sourceCtx = source.getContext("2d", { willReadFrequently: true });
  source.width = img.naturalWidth || img.width;
  source.height = img.naturalHeight || img.height;
  sourceCtx.imageSmoothingEnabled = false;
  sourceCtx.drawImage(img, 0, 0);

  const sourcePixels = sourceCtx.getImageData(0, 0, source.width, source.height);
  const blackLayer = phraseCtx.createImageData(state.width, state.height);
  const greenLayer = phraseGreenCtx.createImageData(state.width, state.height);
  const whiteLayer = phraseWhiteCtx.createImageData(state.width, state.height);

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

      whiteLayer.data[targetIndex] = 255;
      whiteLayer.data[targetIndex + 1] = 255;
      whiteLayer.data[targetIndex + 2] = 255;
      whiteLayer.data[targetIndex + 3] = 255;
    }
  }

  phraseCtx.clearRect(0, 0, state.width, state.height);
  phraseGreenCtx.clearRect(0, 0, state.width, state.height);
  phraseWhiteCtx.clearRect(0, 0, state.width, state.height);
  phraseCtx.putImageData(blackLayer, 0, 0);
  phraseGreenCtx.putImageData(greenLayer, 0, 0);
  phraseWhiteCtx.putImageData(whiteLayer, 0, 0);
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
      const x = Math.min(state.width - 1, gx * PHRASE_COVERAGE_STEP);
      const y = Math.min(state.height - 1, gy * PHRASE_COVERAGE_STEP);
      const alpha = layer.data[(y * state.width + x) * 4 + 3];
      if (alpha > 0) {
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
        size: (Math.random() < 0.82 ? 1 : 2) * sampleStep,
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
  return Math.round(lerp(MIN_BLAST_DURATION, MAX_BLAST_DURATION, charge));
}

function triggerBlast(x, y, charge) {
  if (!state.ready) return;

  const radius = radiusFromCharge(charge);
  const duration = durationFromCharge(charge);
  const maxDisplacement = Math.round(lerp(IS_MOBILE ? 45 : 160, IS_MOBILE ? 180 : 660, charge));
  const affected = collectAffectedPixels(x, y, radius, maxDisplacement, duration);
  const blast = new Blast(x, y, radius, duration, charge, affected);

  state.lastAffected = blast.affected.length;
  state.lastVariant = blast.variant;
  state.blasts.push(blast);
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
  }

  buildFromStamp(stamp, scale) {
    const stampSize = this.radius * (IS_MOBILE ? 0.74 + this.charge * 0.24 : 0.82 + this.charge * 0.32);
    const cellScale = Math.max(1, Math.round(stampSize / (IS_MOBILE ? 260 : 360)));
    const keepEvery = Math.max(1, Math.round(stamp.cells.length / (IS_MOBILE ? 5200 : 9500)));

    for (let i = 0; i < stamp.cells.length; i += keepEvery) {
      const cell = stamp.cells[i];
      if (Math.random() < 0.08) continue;

      const x = Math.round(cell.x * stampSize);
      const y = Math.round(cell.y * stampSize);
      const size = Math.max(2 * scale, Math.round(cell.size * stampSize) * cellScale);

      this.core.push({
        x,
        y,
        w: size,
        h: size,
        firstFrame: Math.round(random(0, this.duration * 0.05)),
        lastFrame: Math.round(random(this.duration * 0.42, this.duration * 0.88)),
      });
    }

    this.holes = [];
  }

  update() {
    this.frame += 1;
    return this.frame <= this.duration;
  }

  draw() {
    this.eraseLocalWhitePixels();
    this.drawDisplacedPixels();
    this.drawCore();
    this.drawHoles();
    this.drawClusters();
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
    duration: TEXT_GREEN_HOLD_FRAMES + TEXT_WHITE_HOLD_FRAMES + REORGANIZE_DURATION,
    nextIndex,
    ditherImg: null,
    phraseImg: null,
    finalCanvas: null,
    revealCanvas: null,
    revealCtx: null,
    whiteRevealCells: [],
    blackRevealCells: [],
    whiteRevealIndex: 0,
    blackRevealIndex: 0,
    ready: false,
  };

  state.transition = transition;
  Promise.all([
    loadImageElement(SCENES[nextIndex].dither),
    loadImageElement(SCENES[nextIndex].phrase),
  ]).then(([ditherImg, phraseImg]) => {
    transition.ditherImg = ditherImg;
    transition.phraseImg = phraseImg;
    transition.finalCanvas = buildFinalSceneCanvas(ditherImg, phraseImg);
    setupWhiteRevealTransition(transition);
    transition.ready = true;
  });
}

function setupWhiteRevealTransition(transition) {
  const revealCanvas = document.createElement("canvas");
  const revealCtx = revealCanvas.getContext("2d", { alpha: false });

  revealCanvas.width = state.width;
  revealCanvas.height = state.height;
  revealCtx.imageSmoothingEnabled = false;
  revealCtx.fillStyle = "#000";
  revealCtx.fillRect(0, 0, state.width, state.height);

  transition.revealCanvas = revealCanvas;
  transition.revealCtx = revealCtx;
  transition.whiteRevealCells = buildWhiteRevealCells();
  transition.blackRevealCells = buildBlackRevealCells(transition.finalCanvas);
  transition.whiteRevealIndex = 0;
  transition.blackRevealIndex = 0;
}

function buildWhiteRevealCells() {
  const cells = [];

  for (let y = 0; y < state.height; y += REVEAL_SAMPLE_STEP) {
    for (let x = 0; x < state.width; x += REVEAL_SAMPLE_STEP) {
      cells.push({
        x,
        y,
        w: REVEAL_DOT_SIZE,
        h: REVEAL_DOT_SIZE,
      });
    }
  }

  return shuffle(cells);
}

function buildBlackRevealCells(finalCanvas) {
  const finalCtx = finalCanvas.getContext("2d", { willReadFrequently: true });
  const pixels = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height).data;
  const cells = [];

  for (let y = 0; y < finalCanvas.height; y += REVEAL_SAMPLE_STEP) {
    for (let x = 0; x < finalCanvas.width; x += REVEAL_SAMPLE_STEP) {
      const pixelIndex = (y * finalCanvas.width + x) * 4;
      const isBlack = pixels[pixelIndex] < 128;
      if (!isBlack) continue;

      cells.push({
        x,
        y,
        w: REVEAL_DOT_SIZE,
        h: REVEAL_DOT_SIZE,
      });
    }
  }

  return shuffle(cells);
}

function drawWhiteRevealTransition(transition, localFrame) {
  const whiteDuration = Math.max(1, Math.round(REORGANIZE_DURATION * 0.5));
  const blackDuration = Math.max(1, REORGANIZE_DURATION - whiteDuration);
  const whiteProgress = clamp(localFrame / whiteDuration, 0, 1);
  const whiteTargetIndex = Math.floor(transition.whiteRevealCells.length * whiteProgress);

  if (transition.revealCtx && whiteTargetIndex > transition.whiteRevealIndex) {
    transition.revealCtx.fillStyle = "#fff";
    for (let i = transition.whiteRevealIndex; i < whiteTargetIndex; i += 1) {
      const cell = transition.whiteRevealCells[i];
      transition.revealCtx.fillRect(cell.x, cell.y, cell.w, cell.h);
    }
    transition.whiteRevealIndex = whiteTargetIndex;
  }

  if (localFrame >= whiteDuration && transition.revealCtx) {
    const blackFrame = localFrame - whiteDuration;
    const blackProgress = clamp(blackFrame / blackDuration, 0, 1);
    const blackTargetIndex = Math.floor(transition.blackRevealCells.length * blackProgress);

    transition.revealCtx.fillStyle = "#000";
    for (let i = transition.blackRevealIndex; i < blackTargetIndex; i += 1) {
      const cell = transition.blackRevealCells[i];
      transition.revealCtx.fillRect(cell.x, cell.y, cell.w, cell.h);
    }
    transition.blackRevealIndex = blackTargetIndex;
  }

  if (localFrame >= REORGANIZE_DURATION - 1 && transition.finalCanvas) {
    ctx.drawImage(transition.finalCanvas, 0, 0);
    return;
  }

  ctx.drawImage(transition.revealCanvas, 0, 0);
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

  if (transition.frame < TEXT_GREEN_HOLD_FRAMES) {
    drawGreenTextInsideBlasts();
  } else if (transition.frame < TEXT_GREEN_HOLD_FRAMES + TEXT_WHITE_HOLD_FRAMES) {
    ctx.drawImage(phraseWhiteCanvas, 0, 0);
  } else if (transition.ready) {
    const localFrame = transition.frame - TEXT_GREEN_HOLD_FRAMES - TEXT_WHITE_HOLD_FRAMES;
    drawWhiteRevealTransition(transition, localFrame);
  }

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
  const blocks = 4 + Math.round(charge * 18);
  const unit = 5 * scale;

  ctx.fillStyle = "#fff";
  ctx.fillRect(cx - unit, cy - unit, unit * 2, unit * 2);

  // Feedback de carga sem circulo de raio: so blocos duros acumulando no ponto.
  for (let i = 0; i < blocks; i += 1) {
    const row = Math.floor(i / 6);
    const col = i % 6;
    const jitterX = ((Math.round(now / 90) + i) % 2) * scale;
    const jitterY = ((Math.round(now / 130) + i) % 2) * scale;
    ctx.fillRect(
      Math.round(cx - unit * 3 + col * unit + jitterX),
      Math.round(cy + unit * 2 + row * unit + jitterY),
      unit,
      unit,
    );
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

function animate(now) {
  if (!state.ready) {
    drawMessage();
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
  if (!state.transition) {
    drawGreenTextInsideBlasts();
  }
  checkGreenCoverageTrigger();
  drawSceneTransition();
  drawChargeFeedback(now);
  drawDebug();

  requestAnimationFrame(animate);
}

function startCharge(event) {
  event.preventDefault();
  canvas.focus();
  canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);

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
  triggerBlast(state.charging.x, state.charging.y, charge);
  state.charging = null;

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

window.addEventListener("keydown", (event) => {
  if (event.key === "r" || event.key === "R") reset();
  if (event.key === "d" || event.key === "D") state.debug = !state.debug;
});

resizeCanvas(FALLBACK_WIDTH, FALLBACK_HEIGHT);
loadExplosionStamps();
loadScene(nextSceneIndex());
requestAnimationFrame(animate);
