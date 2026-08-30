const sharp = require('sharp');
async function test() {
  const meta = await sharp('uploads/3A70166A5C168AFD1E15.jpeg').metadata();
  console.log("EXIF Orientation:", meta.orientation);
}
test();
