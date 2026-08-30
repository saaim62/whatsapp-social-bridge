import * as fs from 'fs';
const sharp = require('sharp');

async function test() {
  const width = 800;
  const height = 600;
  
  // Create a base image
  let img = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 250, g: 230, b: 230, alpha: 1 } // Pinkish background like the shoes
    }
  });

  const svgText = `
    <svg width="800" height="600">
      <rect x="250" y="250" width="300" height="80" fill="#e0c0c0" rx="10" />
      <text x="400" y="305" font-size="50" font-family="Arial" font-weight="bold" text-anchor="middle" fill="#333333">GUCCI</text>
    </svg>
  `;

  const originalBuffer = await img
    .composite([{ input: Buffer.from(svgText) }])
    .png()
    .toBuffer();
    
  fs.writeFileSync('original.png', originalBuffer);

  // Simulated Box coordinates (simulating OCR output for "GUCCI")
  const box = { left: 300, top: 260, width: 200, height: 60 };
  const paddingX = Math.round(box.width * 0.08);
  const paddingY = Math.round(box.height * 0.08);
  
  const left = Math.max(0, box.left - paddingX);
  const top = Math.max(0, box.top - paddingY);
  const boxWidth = Math.min(width - left, box.width + paddingX * 2);
  const boxHeight = Math.min(height - top, box.height + paddingY * 2);

  // Strategy 1: Full box blur (What we currently have)
  const region1 = await sharp(originalBuffer)
    .extract({ left, top, width: boxWidth, height: boxHeight })
    .blur(25)
    .toBuffer();
    
  const out1 = await sharp(originalBuffer)
    .composite([{ input: region1, left, top }])
    .toBuffer();
  fs.writeFileSync('test1-full-blur.png', out1);

  // Strategy 2: Middle characters blur only ("hide the few characters")
  const midWidth = Math.round(boxWidth * 0.5);
  const midLeft = left + Math.round(boxWidth * 0.25);
  const region2 = await sharp(originalBuffer)
    .extract({ left: midLeft, top, width: midWidth, height: boxHeight })
    .blur(15)
    .toBuffer();
    
  const out2 = await sharp(originalBuffer)
    .composite([{ input: region2, left: midLeft, top }])
    .toBuffer();
  fs.writeFileSync('test2-mid-blur.png', out2);

  console.log("Done generating test images.");
}

test().catch(console.error);
