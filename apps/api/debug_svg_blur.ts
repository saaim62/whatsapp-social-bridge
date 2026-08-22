const sharp = require('sharp');
import * as fs from 'fs';

async function testSvgBlur() {
  const width = 200, height = 200;
  const maskSvg = `<svg width="${width}" height="${height}"><polygon points="100,0 200,200 0,200" fill="white" /></svg>`;
  
  const maskBufferNoBlur = await sharp(Buffer.from(maskSvg)).png().toBuffer();
  fs.writeFileSync('mask_no_blur.png', maskBufferNoBlur);
  
  const maskBufferBlur = await sharp(Buffer.from(maskSvg)).blur(2).png().toBuffer();
  fs.writeFileSync('mask_blur.png', maskBufferBlur);

  const statsNoBlur = await sharp(maskBufferNoBlur).stats();
  const statsBlur = await sharp(maskBufferBlur).stats();
  console.log("No blur alpha min/max:", statsNoBlur.channels[3].min, statsNoBlur.channels[3].max);
  console.log("Blur alpha min/max:", statsBlur.channels[3].min, statsBlur.channels[3].max);
}

testSvgBlur().catch(console.error);
