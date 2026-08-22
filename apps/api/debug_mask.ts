import * as fs from 'fs';
const sharp = require('sharp');

async function debugMask() {
  const width = 200;
  const height = 100;
  // A simple slanted polygon
  const maskSvg = `<svg width="${width}" height="${height}"><polygon points="20,80 180,60 160,20 0,40" fill="white" /></svg>`;
  
  fs.writeFileSync('mask.svg', maskSvg);

  const maskBuffer = await sharp(Buffer.from(maskSvg))
    .blur(2)
    .png()
    .toBuffer();
    
  fs.writeFileSync('mask.png', maskBuffer);
  console.log("Mask written to mask.png");

  // Create a red image to blur
  const img = await sharp({ create: { width, height, channels: 4, background: {r: 255, g: 0, b: 0, alpha: 1} } }).png().toBuffer();

  const maskedBlurred = await sharp(img)
    .composite([{ input: maskBuffer, blend: 'dest-in' }])
    .toBuffer();
    
  fs.writeFileSync('masked_blurred.png', maskedBlurred);
  console.log("Composite written to masked_blurred.png");
}

debugMask().catch(console.error);
