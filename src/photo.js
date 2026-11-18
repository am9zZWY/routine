// "Keep it stupid" photo match: 32x32 downscale, dHash + 4-bin-per-channel colour histogram.
export const THRESHOLD = 0.6; // tune me

const img = (src) =>
  new Promise((res, rej) => {
    const image = new Image();
    image.onload = () => res(image);
    image.onerror = rej;
    image.src = src;
  });

function draw(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(source, 0, 0, width, height);
  return canvas;
}
const pixels = (canvas) => canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;

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
  withFile(file, (image) => {
    const scale = 128 / Math.max(image.width, image.height);
    return draw(image, Math.round(image.width * scale), Math.round(image.height * scale)).toDataURL("image/jpeg", 0.7);
  });

export function features(px32, px9x8) {
  const hist = new Array(64).fill(0);
  for (let index = 0; index < px32.length; index += 4)
    hist[(px32[index] >> 6) * 16 + (px32[index + 1] >> 6) * 4 + (px32[index + 2] >> 6)]++;
  const lum = (pixel) => px9x8[pixel * 4] * 0.299 + px9x8[pixel * 4 + 1] * 0.587 + px9x8[pixel * 4 + 2] * 0.114;
  const bits = [];
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) bits.push(lum(row * 9 + col) > lum(row * 9 + col + 1));
  return { hist, bits, n: px32.length / 4 };
}

export function similarity(first, second) {
  let ham = 0,
    inter = 0;
  for (let index = 0; index < 64; index++) {
    ham += first.bits[index] !== second.bits[index];
    inter += Math.min(first.hist[index], second.hist[index]);
  }
  return (1 - ham / 64 + inter / first.n) / 2;
}

const featuresOf = (image) => {
  const small = draw(image, 32, 32);
  return features(pixels(small), pixels(draw(small, 9, 8)));
};

export async function compare(refDataUrl, file) {
  const ref = featuresOf(await img(refDataUrl));
  return withFile(file, (image) => similarity(ref, featuresOf(image)));
}
