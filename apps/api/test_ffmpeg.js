const { exec } = require('child_process');
exec('ffmpeg -i test.mp4 -vframes 1 test.jpeg', (error, stdout, stderr) => {
  console.log(error);
});
