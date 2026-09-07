'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');

const files = [
  'index.html',
  'landing.css',
  'script.js',
  'seat-pricing.js',
  'styles.css',
  'inscribirse/index.html',
  'invitado/index.html',
  'admin/index.html',
  'admin/check-in/index.html',
  'legal/index.html',
  'assets/standup-cosmic-hero-v2.jpg',
  'assets/standup-cosmic-hero-mobile-v2.jpg',
  'assets/html5-qrcode.min.js',
  'assets/html5-qrcode.LICENSE',
];

fs.rmSync(output, { recursive: true, force: true });

for (const relativePath of files) {
  const source = path.join(root, relativePath);
  const destination = path.join(output, relativePath);
  if (!fs.existsSync(source)) throw new Error('Missing build input: ' + relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

console.log('Built', files.length, 'public files in dist/');
