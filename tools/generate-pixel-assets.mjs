import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FRAME_SIZE = 32;
const COLUMNS = 4;
const ROWS = 4;
const ROOT = new URL("../", import.meta.url);

const palette = {
  line: [7, 10, 20, 255],
  body: [38, 41, 63, 255],
  body2: [52, 56, 90, 255],
  cyan: [92, 255, 234, 255],
  cyanDim: [24, 134, 138, 255],
  magenta: [255, 85, 247, 255],
  eye: [234, 255, 255, 255],
  pink: [255, 199, 247, 255],
  amber: [255, 208, 97, 255],
  green: [74, 137, 91, 255],
  green2: [42, 92, 65, 255],
  stone: [102, 116, 118, 255],
  stone2: [68, 78, 84, 255],
  white: [224, 250, 252, 255],
  shadow: [40, 255, 232, 110],
};

const specs = [
  {
    id: "cyber-cat",
    name: "NekoByte",
    draw: drawCat,
  },
  {
    id: "cyber-penguin",
    name: "PenByte",
    draw: drawPenguin,
  },
  {
    id: "kofun-friend",
    name: "KofunBit",
    draw: drawKofun,
  },
];

function c(name) {
  return palette[name];
}

function makeCanvas() {
  const width = FRAME_SIZE * COLUMNS;
  const height = FRAME_SIZE * ROWS;
  const rgba = new Uint8Array(width * height * 4);

  function px(x, y, w, h, color) {
    const [r, g, b, a] = color;
    for (let yy = y; yy < y + h; yy += 1) {
      if (yy < 0 || yy >= height) continue;
      for (let xx = x; xx < x + w; xx += 1) {
        if (xx < 0 || xx >= width) continue;
        const i = (yy * width + xx) * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = a;
      }
    }
  }

  return { width, height, rgba, px };
}

function drawSheet(spec) {
  const canvas = makeCanvas();
  ["idle", "walk", "sleep", "react"].forEach((mode, row) => {
    for (let col = 0; col < COLUMNS; col += 1) {
      spec.draw(canvas, col * FRAME_SIZE, row * FRAME_SIZE, mode, col);
    }
  });
  return canvas;
}

function drawShadow({ px }, ox, oy) {
  px(ox + 1, oy + 28, 30, 2, c("shadow"));
}

function drawCat(canvas, ox, oy, mode, frame) {
  const { px } = canvas;
  const tailUp = frame % 2 === 0;
  const step = frame % 2;
  const glitch = mode === "react" && frame % 2 === 1;
  const blink = mode === "idle" && frame === 3;
  const sleep = mode === "sleep";
  const walk = mode === "walk";
  const yLift = sleep ? 2 : 0;

  if (glitch) {
    px(ox + 3, oy + 7, 23, 14, c("magenta"));
    px(ox + 7, oy + 2, 20, 16, c("cyan"));
  }
  drawShadow(canvas, ox, oy);

  px(ox + 25, oy + 14 + yLift, 3, 10, c("line"));
  px(ox + 27, oy + (tailUp ? 10 : 13) + yLift, 4, tailUp ? 7 : 10, c("line"));
  px(ox + 26, oy + 13 + yLift, 3, 9, c("body2"));
  px(ox + 28, oy + (tailUp ? 10 : 13) + yLift, 3, tailUp ? 6 : 9, c("body2"));
  px(ox + 28, oy + (tailUp ? 9 : 12) + yLift, 3, 3, c("cyan"));

  px(ox + 4, oy + 12 + yLift, 21, 15, c("line"));
  px(ox + 6, oy + 13 + yLift, 18, 13, c("body"));
  px(ox + 9, oy + 15 + yLift, 12, 9, c("body2"));
  px(ox + 11, oy + (walk && step === 1 ? 23 : 24) + yLift, 3, 4, c("line"));
  px(ox + 19, oy + (walk && step === 0 ? 23 : 24) + yLift, 3, 4, c("line"));

  px(ox + 7, oy + 3 + yLift, 19, 16, c("line"));
  px(ox + 9, oy + 5 + yLift, 15, 13, c("body2"));
  px(ox + 8, oy + yLift, 5, 6, c("line"));
  px(ox + 20, oy + yLift, 5, 6, c("line"));
  px(ox + 10, oy + 2 + yLift, 3, 4, c("body2"));
  px(ox + 20, oy + 2 + yLift, 3, 4, c("body2"));
  px(ox + 10, oy + 3 + yLift, 1, 2, c("magenta"));
  px(ox + 22, oy + 3 + yLift, 1, 2, c("cyan"));

  drawFace(px, ox, oy + yLift, mode, blink);
  px(ox + 10, oy + 18 + yLift, 13, 2, c("line"));
  px(ox + 12, oy + 18 + yLift, 3, 2, c("cyan"));
  px(ox + 18, oy + 18 + yLift, 3, 2, c("magenta"));

  if (sleep) drawZzz(px, ox, oy, frame);
  if (walk) drawDust(px, ox, oy, step);
}

function drawPenguin(canvas, ox, oy, mode, frame) {
  const { px } = canvas;
  const step = frame % 2;
  const sleep = mode === "sleep";
  const glitch = mode === "react" && frame % 2 === 1;
  const bob = sleep ? 2 : frame % 2;

  if (glitch) {
    px(ox + 4, oy + 5, 23, 20, c("magenta"));
    px(ox + 7, oy + 3, 21, 18, c("cyan"));
  }
  drawShadow(canvas, ox, oy);

  px(ox + 8, oy + 4 + bob, 17, 23, c("line"));
  px(ox + 10, oy + 5 + bob, 13, 21, c("body"));
  px(ox + 11, oy + 12 + bob, 11, 12, c("white"));
  px(ox + 13, oy + 14 + bob, 7, 8, [190, 242, 244, 255]);

  px(ox + 5, oy + 14 + bob, 5, 8, c("line"));
  px(ox + 23, oy + 14 + bob, 5, 8, c("line"));
  px(ox + 6, oy + 15 + bob + step, 3, 6, c("body2"));
  px(ox + 24, oy + 15 + bob - step, 3, 6, c("body2"));

  px(ox + 13, oy + 23 + bob + step, 4, 3, c("amber"));
  px(ox + 18, oy + 23 + bob - step, 4, 3, c("amber"));

  if (sleep) {
    px(ox + 12, oy + 11 + bob, 4, 1, c("eye"));
    px(ox + 18, oy + 11 + bob, 4, 1, c("eye"));
  } else {
    px(ox + 12, oy + 9 + bob, 4, 4, c("cyan"));
    px(ox + 18, oy + 9 + bob, 4, 4, c("magenta"));
    px(ox + 13, oy + 10 + bob, 2, 2, c("eye"));
    px(ox + 19, oy + 10 + bob, 2, 2, c("eye"));
  }

  px(ox + 15, oy + 13 + bob, 4, 2, c("amber"));
  px(ox + 11, oy + 7 + bob, 12, 1, c("cyan"));
  px(ox + 10, oy + 8 + bob, 14, 1, c("magenta"));

  if (sleep) drawZzz(px, ox, oy, frame);
  if (mode === "walk") drawDust(px, ox, oy, step);
}

function drawKofun(canvas, ox, oy, mode, frame) {
  const { px } = canvas;
  const step = frame % 2;
  const sleep = mode === "sleep";
  const glitch = mode === "react" && frame % 2 === 1;
  const bob = sleep ? 2 : frame % 2;

  if (glitch) {
    px(ox + 4, oy + 7, 24, 17, c("magenta"));
    px(ox + 6, oy + 4, 21, 15, c("cyan"));
  }
  drawShadow(canvas, ox, oy);

  // Original keyhole-tomb mascot silhouette.
  px(ox + 12, oy + 3 + bob, 9, 5, c("line"));
  px(ox + 10, oy + 7 + bob, 13, 7, c("line"));
  px(ox + 6, oy + 13 + bob, 22, 11, c("line"));
  px(ox + 9, oy + 24 + bob, 16, 3, c("line"));

  px(ox + 13, oy + 4 + bob, 7, 4, c("green"));
  px(ox + 11, oy + 8 + bob, 11, 6, c("green"));
  px(ox + 8, oy + 14 + bob, 18, 9, c("green2"));
  px(ox + 10, oy + 23 + bob, 14, 3, c("green"));
  px(ox + 12, oy + 8 + bob, 9, 2, c("cyanDim"));
  px(ox + 9, oy + 17 + bob, 16, 1, c("cyan"));

  px(ox + 12, oy + 14 + bob, 10, 8, c("stone2"));
  px(ox + 13, oy + 15 + bob, 8, 6, c("stone"));

  if (sleep) {
    px(ox + 14, oy + 17 + bob, 2, 1, c("eye"));
    px(ox + 19, oy + 17 + bob, 2, 1, c("eye"));
  } else {
    px(ox + 14, oy + 16 + bob, 2, 3, c("eye"));
    px(ox + 19, oy + 16 + bob, 2, 3, c("eye"));
    px(ox + 15, oy + 16 + bob, 1, 1, c("cyan"));
    px(ox + 20, oy + 16 + bob, 1, 1, c("magenta"));
  }
  px(ox + 16, oy + 20 + bob, 3, 1, c("pink"));

  px(ox + 10, oy + 25 + bob + step, 4, 3, c("line"));
  px(ox + 21, oy + 25 + bob - step, 4, 3, c("line"));

  if (sleep) drawZzz(px, ox, oy, frame);
  if (mode === "walk") drawDust(px, ox, oy, step);
}

function drawFace(px, ox, oy, mode, blink) {
  if (mode === "sleep" || blink) {
    px(ox + 12, oy + 11, 4, 1, c("eye"));
    px(ox + 19, oy + 11, 4, 1, c("eye"));
  } else {
    const eyeHeight = mode === "react" ? 5 : 4;
    px(ox + 12, oy + 9, 3, eyeHeight, c("eye"));
    px(ox + 19, oy + 9, 3, eyeHeight, c("eye"));
    px(ox + 13, oy + 9, 1, 2, c("cyan"));
    px(ox + 20, oy + 9, 1, 2, c("magenta"));
  }
  px(ox + 16, oy + 14, 2, 1, c("pink"));
  px(ox + 15, oy + 16, 1, 1, c("cyan"));
  px(ox + 18, oy + 16, 1, 1, c("cyan"));
}

function drawZzz(px, ox, oy, frame) {
  px(ox + 27, oy + 3, 3, 1, c("cyan"));
  if (frame > 0) px(ox + 28, oy + 1, 3, 2, c("cyan"));
  if (frame > 1) px(ox + 24, oy + 0, 2, 1, c("magenta"));
}

function drawDust(px, ox, oy, step) {
  px(ox + 1 + step, oy + 30, 2, 1, c("magenta"));
  px(ox + 5 + step * 2, oy + 29, 2, 1, c("cyan"));
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writePng(path, canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    const rowStart = y * (canvas.width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(canvas.rgba.buffer, y * canvas.width * 4, canvas.width * 4).copy(raw, rowStart + 1);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    Buffer.concat([
      signature,
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

function writeMetadata(path, name) {
  const metadata = {
    image: "spritesheet.png",
    name,
    license: "Original pixel art created for pixel-pet. Released under the repository 0BSD License.",
    frame: {
      width: FRAME_SIZE,
      height: FRAME_SIZE,
    },
    layout: {
      columns: COLUMNS,
      rows: ROWS,
    },
    animations: {
      idle: { row: 0, frames: [0, 1, 2, 3], fps: 8, loop: true },
      walk: { row: 1, frames: [0, 1, 2, 3], fps: 10, loop: true },
      sleep: { row: 2, frames: [0, 1, 2, 3], fps: 4, loop: true },
      react: { row: 3, frames: [0, 1, 2, 3], fps: 12, loop: false },
    },
  };

  writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

for (const spec of specs) {
  const outDir = new URL(`assets/pets/${spec.id}/`, ROOT);
  const sheetPath = fileURLToPath(new URL("spritesheet.png", outDir));
  const metaPath = fileURLToPath(new URL("spritesheet.json", outDir));
  const canvas = drawSheet(spec);
  writePng(sheetPath, canvas);
  writeMetadata(metaPath, spec.name);
  console.log(`Generated ${sheetPath}`);
  console.log(`Generated ${metaPath}`);
}
