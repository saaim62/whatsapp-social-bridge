require('dotenv').config();
const nodemailer = require('nodemailer');

async function test() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const info = await transporter.sendMail({
    from: '"DropRoute Test" <noreply@droproute.com>',
    to: process.env.SMTP_USER, // send to themselves
    subject: 'Test Email Verification',
    html: '<p>If you see this, the SMTP credentials are working!</p>',
  });

  console.log('Email sent successfully!', info.messageId);
}

test().catch(console.error);
