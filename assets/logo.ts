// Writes the logo's sizes from the generated source image, for the docs and
// the VS Code extension. The outputs are gitignored; `bun run logo` (and the
// docs' dev/build and the extension's package scripts) write them.
import { join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dir, "..");
const source = join(import.meta.dir, "Crystalline .Z{} Geometric Logo.png");

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;

// Drop the faint speckles left by background removal, and the colour hidden in
// fully transparent pixels, then find the mark's bounds.
let left = width, top = height, right = -1, bottom = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i + 3]! < 16) {
      data.fill(0, i, i + 4);
      continue;
    }
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
}
const mark = { left, top, width: right - left + 1, height: bottom - top + 1 };

/** The mark scaled to `w` x `h` (it keeps its own shape), centred on a transparent canvas. */
async function render(w: number, h: number, fill: number): Promise<Buffer> {
  const scale = Math.min((w * fill) / mark.width, (h * fill) / mark.height);
  const mw = Math.round(mark.width * scale);
  const mh = Math.round(mark.height * scale);
  return sharp(data, { raw: { width, height, channels: 4 } })
    .extract(mark)
    .resize(mw, mh, { fit: "fill", kernel: "lanczos3" })
    .extend({
      left: Math.floor((w - mw) / 2),
      right: Math.ceil((w - mw) / 2),
      top: Math.floor((h - mh) / 2),
      bottom: Math.ceil((h - mh) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** An .ico holding the given square PNGs. */
function ico(images: [size: number, png: Buffer][]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([size, png], n) => {
    const entry = 6 + 16 * n;
    header.writeUInt8(size % 256, entry); // width; 0 means 256
    header.writeUInt8(size % 256, entry + 1); // height
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(([, png]) => png)]);
}

const outputs: Record<string, Buffer> = {};
const out = (path: string, png: Buffer) => (outputs[path] = png);

// Tight, no margin: for places that size it themselves (the docs' nav and hero).
const tightWidth = 1200;
out("assets/logo/zamn-logo.png", await render(tightWidth, Math.round((mark.height * tightWidth) / mark.width), 1));
// Wide, 2:1, with a margin.
for (const w of [1600, 1200, 800, 400]) {
  out(`assets/logo/zamn-logo-${w}x${w / 2}.png`, await render(w, w / 2, 0.84));
}
// Square, with little margin: icons are small.
const square: Record<number, Buffer> = {};
for (const s of [1024, 512, 256, 128, 64, 48, 32, 16]) {
  square[s] = out(`assets/logo/zamn-icon-${s}.png`, await render(s, s, 0.96));
}

// VS Code: the Marketplace icon (a PNG, at least 128px; 256 for Retina) and the
// icon of .zamn files.
out("packages/vscode-zamn/images/icon.png", square[256]!);
out("packages/vscode-zamn/images/file-icon.png", square[32]!);
// The docs' favicon.
out("docs/public/favicon.ico", ico([16, 32, 48].map((s) => [s, square[s]!])));

for (const [path, bytes] of Object.entries(outputs)) await Bun.write(join(root, path), bytes);
console.log(`logo: wrote ${Object.keys(outputs).length} files`);
