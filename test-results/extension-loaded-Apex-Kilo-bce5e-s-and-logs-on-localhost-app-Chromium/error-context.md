# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extension-loaded.spec.ts >> Apex Kilo Browser Extension via Playwright >> content script injects and logs on localhost app
- Location: e2e/extension-loaded.spec.ts:50:3

# Error details

```
Error: browserType.launchPersistentContext: Target page, context or browser has been closed
Browser logs:

╔════════════════════════════════════════════════════════════════════════════════════════════════╗
║ Looks like you launched a headed browser without having a XServer running.                     ║
║ Set either 'headless: true' or use 'xvfb-run <your-playwright-app>' before running Playwright. ║
║                                                                                                ║
║ <3 Playwright Team                                                                             ║
╚════════════════════════════════════════════════════════════════════════════════════════════════╝
Call log:
  - <launching> /home/administrator/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome --disable-field-trial-config --disable-background-networking --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-back-forward-cache --disable-breakpad --disable-client-side-phishing-detection --disable-component-extensions-with-background-pages --disable-component-update --no-default-browser-check --disable-default-apps --disable-dev-shm-usage --disable-edgeupdater --disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,Translate,AutoDeElevate,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion --enable-features=CDPScreenshotNewSurface --allow-pre-commit-input --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-renderer-backgrounding --disable-updater-scheduler --force-color-profile=srgb --metrics-recording-only --no-first-run --password-store=basic --use-mock-keychain --no-service-autorun --export-tagged-pdf --disable-search-engine-choice-screen --unsafely-disable-devtools-self-xss-warnings --edge-skip-compat-layer-relaunch --disable-infobars --disable-search-engine-choice-screen --disable-sync --enable-unsafe-swiftshader --no-sandbox --load-extension=/tmp/apex-kilo-ext-tYizMk --disable-extensions-except=/tmp/apex-kilo-ext-tYizMk --user-data-dir=/tmp/apex-kilo-ctx-nKv8jp --remote-debugging-pipe about:blank
  - <launched> pid=59752
  - [pid=59752][err] [59752:59752:0916/163303.173899:ERROR:ui/ozone/platform/x11/ozone_platform_x11.cc:257] Missing X server or $DISPLAY
  - [pid=59752][err] [59752:59752:0916/163303.174017:ERROR:ui/aura/env.cc:246] The platform failed to initialize.  Exiting.
  - [pid=59752] <gracefully close start>
  - [pid=59752] <kill>
  - [pid=59752] <will force kill>
  - [pid=59752] <process did exit: exitCode=1, signal=null>
  - [pid=59752] starting temporary directories cleanup
  - [pid=59752] finished temporary directories cleanup
  - [pid=59752] <gracefully close end>

```

# Test source

```ts
  1  | import { test, expect, chromium, type Page } from '@playwright/test';
  2  | import * as fs from 'fs';
  3  | import * as path from 'path';
  4  | import * as os from 'os';
  5  | import JSZip from 'jszip';
  6  | 
  7  | let extensionPath: string;
  8  | 
  9  | test.beforeAll(async () => {
  10 |   const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-kilo-ext-'));
  11 |   const resp = await fetch('http://localhost:3000/api/extension/download');
  12 |   if (!resp.ok) throw new Error(`Failed to download extension: ${resp.status}`);
  13 |   const buf = Buffer.from(await resp.arrayBuffer());
  14 |   const zip = await JSZip.loadAsync(buf);
  15 |   const writes: Promise<void>[] = [];
  16 |   Object.keys(zip.files).forEach((rel) => {
  17 |     const e = zip.files[rel];
  18 |     if (!e.dir) {
  19 |       const t = path.join(tmpDir, rel);
  20 |       fs.mkdirSync(path.dirname(t), { recursive: true });
  21 |       writes.push(e.async('nodebuffer').then((c) => fs.writeFileSync(t, c)));
  22 |     }
  23 |   });
  24 |   await Promise.all(writes);
  25 |   if (!fs.existsSync(path.join(tmpDir, 'manifest.json'))) {
  26 |     throw new Error(`manifest.json not found in extracted extension at ${tmpDir}`);
  27 |   }
  28 |   extensionPath = tmpDir;
  29 | });
  30 | 
  31 | test.describe('Apex Kilo Browser Extension via Playwright', () => {
  32 |   let context: any;
  33 | 
  34 |   test.beforeAll(async () => {
  35 |     const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-kilo-ctx-'));
> 36 |     context = await chromium.launchPersistentContext(userDataDir, {
     |               ^ Error: browserType.launchPersistentContext: Target page, context or browser has been closed
  37 |       headless: false,
  38 |       ignoreDefaultArgs: ['--disable-extensions'],
  39 |       args: [
  40 |         `--load-extension=${extensionPath}`,
  41 |         `--disable-extensions-except=${extensionPath}`,
  42 |       ],
  43 |     });
  44 |   });
  45 | 
  46 |   test.afterAll(async () => {
  47 |     if (context) await context.close();
  48 |   });
  49 | 
  50 |   test('content script injects and logs on localhost app', async () => {
  51 |     const page = await context.newPage();
  52 |     const consoleMessages: string[] = [];
  53 |     page.on('console', (msg) => {
  54 |       const txt = msg.text();
  55 |       if (txt.includes('Apex Kilo')) {
  56 |         consoleMessages.push(txt);
  57 |       }
  58 |     });
  59 | 
  60 |     await page.goto('http://localhost:3000/');
  61 |     await page.waitForLoadState('networkidle');
  62 |     await page.waitForTimeout(1500);
  63 | 
  64 |     const injected = consoleMessages.some((m) =>
  65 |       m.includes('Browser Extension Content Script Injected')
  66 |     );
  67 |     expect(injected).toBe(true);
  68 |   });
  69 | 
  70 |   test('extension badge layer and HUD mount on the page', async () => {
  71 |     const page = await context.newPage();
  72 | 
  73 |     await page.goto('http://localhost:3000/');
  74 |     await page.waitForLoadState('networkidle');
  75 |     await page.waitForTimeout(1500);
  76 | 
  77 |     // The content script sets data-agent-id on interactive elements
  78 |     const dataAgentElements = await page.evaluate(() => {
  79 |       return Array.from(document.querySelectorAll('[data-agent-id]')).map((el) => ({
  80 |         id: el.getAttribute('data-agent-id'),
  81 |         tag: el.tagName,
  82 |       }));
  83 |     });
  84 |     expect(dataAgentElements.length).toBeGreaterThan(0);
  85 |   });
  86 | });
  87 | 
```