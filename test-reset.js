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
    from: '"DropRoute" <noreply@droproute.com>',
    to: process.env.SMTP_USER, // send to themselves
    subject: 'Reset your DropRoute Password',
    html: '<p>Please click <a href="http://localhost:3000/reset-password?token=123">here</a> to reset your password.</p>',
  });

  console.log('Reset Email sent successfully!', info.messageId);
}

test().catch(console.error);
