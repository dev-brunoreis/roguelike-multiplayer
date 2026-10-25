function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("frame"));
    image.src = url;
  });
}

export async function composeStrip(urls: string[]) {
  const images = await Promise.all(urls.map(loadImage));
  const first = images[0];
  if (!first) return "";
  const scale = Math.min(1, 360 / first.width);
  const w = Math.max(1, Math.round(first.width * scale));
  const h = Math.max(1, Math.round(first.height * scale));
  const cols = Math.min(4, images.length);
  const rows = Math.ceil(images.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = w * cols;
  canvas.height = h * rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  images.forEach((image, index) => {
    ctx.drawImage(image, (index % cols) * w, Math.floor(index / cols) * h, w, h);
  });
  return canvas.toDataURL("image/png");
}

export function waitFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

let stripRan = "";

export function claimStrip(key: string) {
  if (stripRan === key) return false;
  stripRan = key;
  return true;
}
