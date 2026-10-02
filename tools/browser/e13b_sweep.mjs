// E-13b: Visual flicker sweep for estate 3D view (Item E6).
// Runs against WebKit (WKWebView parity with TauriTavern).
// Modes: B2, B1, F1, F2, F3, exterior.
// Keeps camera still for 5s, takes two screenshots per mode, verifies 100% pixel match.
import * as B from './lib.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OUT = path.join(os.homedir(), 'eden-map-review/tt/e13b');
fs.mkdirSync(OUT, { recursive: true });

const srv = await B.ensureServer();
const P = await B.newPage('desktopWk');

const MODES = [
  { name: 'exterior', mode: 'ext' },
  { name: 'B2', mode: 'B2' },
  { name: 'B1', mode: 'B1' },
  { name: 'F1', mode: 'F1' },
  { name: 'F2', mode: 'F2' },
  { name: 'F3', mode: 'F3' },
];

console.log('Opening estate in WebKit (desktopWk)...');
await B.openEstate(P, { stats: false });
const f = P.page.mainFrame();

const report = [];

for (const { name, mode } of MODES) {
  console.log(`\nTesting mode: ${name} (${mode})...`);
  await f.evaluate((m) => window.__estate.setMode(m), mode);
  if (mode !== 'ext') {
    await f.waitForFunction(() => window.__estate.houseState() !== 1, null, { timeout: 40000 }).catch(() => {});
  }
  // Reset idle timer so auto-orbit does not trigger during the 5s still test
  await f.evaluate(() => window.dispatchEvent(new Event('pointerdown')));
  // Let flight animation finish
  await B.wait(3000);
  // Keep camera still for 5s
  console.log(`Camera still for 5s on ${name}...`);
  await B.wait(5000);

  const file1 = path.join(OUT, `E6-${name}-1.png`);
  const file2 = path.join(OUT, `E6-${name}-2.png`);

  await P.page.screenshot({ path: file1 });

  // In-page 2-frame exact pixel comparison across 2 seconds
  const frameCheck = await f.evaluate(async () => {
    const H = window.__estate;
    const canvas = H.canvas || H.renderer.domElement;
    const c2 = document.createElement('canvas');
    c2.width = canvas.width; c2.height = canvas.height;
    const g2 = c2.getContext('2d', { willReadFrequently: true });
    H.renderer.render(H.scene, H.camera);
    g2.drawImage(canvas, 0, 0);
    const d1 = g2.getImageData(0, 0, c2.width, c2.height).data.slice();
    await new Promise((r) => setTimeout(r, 2000));
    H.renderer.render(H.scene, H.camera);
    g2.drawImage(canvas, 0, 0);
    const d2 = g2.getImageData(0, 0, c2.width, c2.height).data;
    let diffCount = 0;
    for (let i = 0; i < d1.length; i += 4) {
      if (Math.abs(d1[i] - d2[i]) > 0 || Math.abs(d1[i + 1] - d2[i + 1]) > 0 || Math.abs(d1[i + 2] - d2[i + 2]) > 0) {
        diffCount++;
      }
    }
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return {
      diffCount,
      totalPixels: c2.width * c2.height,
      depth: gl.getParameter(gl.DEPTH_BITS),
      stencil: gl.getParameter(gl.STENCIL_BITS),
      near: H.camera.near,
      far: H.camera.far,
    };
  });

  await P.page.screenshot({ path: file2 });

  const buf1 = fs.readFileSync(file1);
  const buf2 = fs.readFileSync(file2);
  const match = frameCheck.diffCount === 0;

  console.log(`  Shot 1: ${file1} (${buf1.length} bytes)`);
  console.log(`  Shot 2: ${file2} (${buf2.length} bytes)`);
  console.log(`  Pixel differences across 2s: ${frameCheck.diffCount} / ${frameCheck.totalPixels}`);
  console.log(`  Pixel-identical: ${match ? 'YES ✓' : 'NO ✗'}`);
  console.log(`  GL state: depth=${frameCheck.depth} stencil=${frameCheck.stencil} near=${frameCheck.near.toFixed(1)} far=${frameCheck.far.toFixed(1)}`);

  report.push({ name, mode, match, info: frameCheck });
}

await P.close();
if (srv?.started) srv.stop();

const allMatch = report.every((r) => r.match);
console.log('\n=== SUMMARY ===');
for (const r of report) {
  console.log(`${r.match ? '✓' : '✗'} ${r.name.padEnd(10)}: match=${r.match} depth=${r.info.depth} stencil=${r.info.stencil}`);
}
console.log(`Result: ${allMatch ? 'ALL MATCH (ZERO FLICKER) ✓' : 'MISMATCH DETECTED ✗'}`);

if (!allMatch) process.exit(1);
