const { PrismaClient } = require('@prisma/client');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function test() {
  const prisma = new PrismaClient();
  const media = await prisma.mediaAsset.findFirst({
    where: { localPath: { not: null } }
  });
  
  if (!media) {
    console.log("No media found");
    return;
  }
  
  console.log("Found media:", media.localPath);
  
  const absolutePath = path.join(process.cwd(), media.localPath);
  console.log("Absolute path:", absolutePath);
  
  try {
    const imageBuffer = fs.readFileSync(absolutePath);
    const metadata = await sharp(imageBuffer).metadata();
    console.log("Metadata:", metadata);
    
    const box = { left: 10, top: 10, width: 100, height: 100 };
    
    const left = Math.max(0, Math.min(metadata.width - 1, Math.round(box.left)));
    const top = Math.max(0, Math.min(metadata.height - 1, Math.round(box.top)));
    const width = Math.min(metadata.width - left, Math.max(1, Math.round(box.width)));
    const height = Math.min(metadata.height - top, Math.max(1, Math.round(box.height)));
    
    console.log("Cropping:", { left, top, width, height });
    
    const croppedArea = await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .blur(15)
      .toBuffer();

    console.log("Cropped area generated");

    const newBuffer = await sharp(imageBuffer)
      .composite([{ input: croppedArea, left, top }])
      .toBuffer();
      
    console.log("Composite generated");

    fs.writeFileSync(absolutePath + '.test.jpg', newBuffer);
    console.log("Success!");
    
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
