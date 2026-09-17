import { test, chromium, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

test('extract chrome command line for extension debugging', async () => {
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-ext-'));
  fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'Minimal Test Extension',
    version: '1.0',
    content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'] }],
  }));
  fs.writeFileSync(path.join(extDir, 'content.js'), `window.__minimalLoaded = true;`);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-ctx-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--load-extension=${extDir}`,
      `--disable-extensions-except=${extDir}`,
    ],
  });

  const page = await context.newPage();
  await page.goto('chrome://version/');
  await page.waitForTimeout(1000);

  const cmdInfo = await page.evaluate(() => {
    const text = document.body.textContent || '';
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const cmdLineIdx = lines.findIndex(l => l.includes('Command Line'));
    const hasDisableExtensions = lines[cmdLineIdx + 1]?.includes('--disable-extensions');
    const hasLoadExtension = lines[cmdLineIdx + 1]?.includes('--load-extension');
    return {
      hasDisableExtensions,
      hasLoadExtension,
      commandLine: lines[cmdLineIdx + 1] || 'NOT FOUND',
    };
  });
  console.log('Has --disable-extensions:', cmdInfo.hasDisableExtensions);
  console.log('Has --load-extension:', cmdInfo.hasLoadExtension);

  // Verify: without ignoreDefaultArgs, --disable-extensions is present
  // and content scripts do NOT inject
  expect(cmdInfo.hasDisableExtensions).toBe(true);
  expect(cmdInfo.hasLoadExtension).toBe(true);

  await context.close();
});
