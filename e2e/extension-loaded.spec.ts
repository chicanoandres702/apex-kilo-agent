import { test, expect, chromium, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import JSZip from 'jszip';

let extensionPath: string;

test.beforeAll(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-kilo-ext-'));
  const resp = await fetch('http://localhost:3000/api/extension/download');
  if (!resp.ok) throw new Error(`Failed to download extension: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const zip = await JSZip.loadAsync(buf);
  const writes: Promise<void>[] = [];
  Object.keys(zip.files).forEach((rel) => {
    const e = zip.files[rel];
    if (!e.dir) {
      const t = path.join(tmpDir, rel);
      fs.mkdirSync(path.dirname(t), { recursive: true });
      writes.push(e.async('nodebuffer').then((c) => fs.writeFileSync(t, c)));
    }
  });
  await Promise.all(writes);
  if (!fs.existsSync(path.join(tmpDir, 'manifest.json'))) {
    throw new Error(`manifest.json not found in extracted extension at ${tmpDir}`);
  }
  extensionPath = tmpDir;
});

test.describe('Apex Kilo Browser Extension via Playwright', () => {
  let context: any;

  test.beforeAll(async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-kilo-ctx-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--load-extension=${extensionPath}`,
        `--disable-extensions-except=${extensionPath}`,
      ],
    });
  });

  test.afterAll(async () => {
    if (context) await context.close();
  });

  test('content script injects and logs on localhost app', async () => {
    const page = await context.newPage();
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      const txt = msg.text();
      if (txt.includes('Apex Kilo')) {
        consoleMessages.push(txt);
      }
    });

    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const injected = consoleMessages.some((m) =>
      m.includes('Browser Extension Content Script Injected')
    );
    expect(injected).toBe(true);
  });

  test('extension badge layer and HUD mount on the page', async () => {
    const page = await context.newPage();

    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // The content script sets data-agent-id on interactive elements
    const dataAgentElements = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-agent-id]')).map((el) => ({
        id: el.getAttribute('data-agent-id'),
        tag: el.tagName,
      }));
    });
    expect(dataAgentElements.length).toBeGreaterThan(0);
  });
});
