// "Keep it stupid" photo match: 32x32 downscale, dHash + 4-bin-per-channel colour histogram.
export const THRESHOLD = 0.6; // tune me

const img = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

function draw(source, w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d", { willReadFrequently: true }).drawImage(source, 0, 0, w, h);
  return c;
}
const pixels = (c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data;

async function withFile(file, fn) {
  const url = URL.createObjectURL(file);
  try {
    return await fn(await img(url));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ~128px JPEG data URL for the reference photo.
export const thumb = (file) =>
  withFile(file, (i) => {
    const k = 128 / Math.max(i.width, i.height);
    return draw(i, Math.round(i.width * k), Math.round(i.height * k)).toDataURL("image/jpeg", 0.7);
  });

export function features(px32, px9x8) {
  const hist = new Array(64).fill(0);
  for (let i = 0; i < px32.length; i += 4) hist[(px32[i] >> 6) * 16 + (px32[i + 1] >> 6) * 4 + (px32[i + 2] >> 6)]++;
  const lum = (i) => px9x8[i * 4] * 0.299 + px9x8[i * 4 + 1] * 0.587 + px9x8[i * 4 + 2] * 0.114;
  const bits = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(lum(y * 9 + x) > lum(y * 9 + x + 1));
  return { hist, bits, n: px32.length / 4 };
}

export function similarity(a, b) {
  let ham = 0,
    inter = 0;
  for (let i = 0; i < 64; i++) {
    ham += a.bits[i] !== b.bits[i];
    inter += Math.min(a.hist[i], b.hist[i]);
  }
  return (1 - ham / 64 + inter / a.n) / 2;
}

const featuresOf = (i) => {
  const small = draw(i, 32, 32);
  return features(pixels(small), pixels(draw(small, 9, 8)));
};

export async function compare(refDataUrl, file) {
  const ref = featuresOf(await img(refDataUrl));
  return withFile(file, (i) => similarity(ref, featuresOf(i)));
}
