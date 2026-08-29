import path from "node:path";
import sharp from "sharp";

const directory = process.argv[2];
if (!directory) throw new Error("Output directory is required.");

const cards = ["welchius", "dogiragon-gyaku", "chakra-delfin"];
const tiers = [
  ["high", 384, "A: 384px / q78"],
  ["medium", 320, "B: 320px / q60"],
  ["low", 256, "C: 256px / q42"],
];

for (const card of cards) {
  let left = 20;
  const layers = [];
  for (const [tier, width, label] of tiers) {
    layers.push({
      input: await sharp(path.join(directory, `${card}-${tier}.webp`)).toBuffer(),
      left,
      top: 55,
    });
    layers.push({
      input: Buffer.from(
        `<svg width="${width}" height="35" xmlns="http://www.w3.org/2000/svg"><text x="0" y="24" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="#111">${label}</text></svg>`,
      ),
      left,
      top: 12,
    });
    left += width + 20;
  }

  await sharp({
    create: { width: left, height: 615, channels: 3, background: "#f4f4f4" },
  })
    .composite(layers)
    .webp({ quality: 90 })
    .toFile(path.join(directory, `${card}-comparison.webp`));
}
