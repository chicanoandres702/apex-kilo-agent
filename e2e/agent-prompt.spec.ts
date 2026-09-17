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

test.describe('Apex Kilo Agent — Real DevProject API E2E', () => {
  let context: any;
  let page: Page;

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

  test.beforeEach(async () => {
    page = await context.newPage();

    // Capture all browser console output for debugging
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Apex') || text.includes('apex') || text.includes('Kilo') || text.includes('plan') || text.includes('error') || text.includes('Error') || msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`  [browser:${msg.type()}] ${text}`);
      }
    });
    page.on('pageerror', (err) => {
      console.log(`  [browser:pageerror] ${err.message}`);
    });
  });

  test.afterEach(async () => {
    if (page) await page.close();
  });

  test('agent fills a search input via real DevProject API', async () => {
    test.setTimeout(120000);

    await page.goto('http://localhost:3000/src/test-page.html');
    await page.waitForLoadState('networkidle');

    // Wait for the extension content script to mount the HUD shadow host
    await page.waitForFunction(
      () => document.getElementById('auto-agent-host') !== null,
      { timeout: 15000 }
    );

    // Give the shadow DOM a moment to build its HUD
    await page.waitForTimeout(1000);

    // Clear any persisted config/state from previous runs to start fresh
    // Content scripts in Chrome MV3 share localStorage with the page origin
    await page.evaluate(() => {
      localStorage.removeItem('auto_agent_config');
      localStorage.removeItem('auto_agent_run_state_v1');
    });

    // --- Open the config sheet and verify/set defaults ---
    // The Shadow DOM is open mode, accessible from the page's main context.
    await page.evaluate(() => {
      const host = document.getElementById('auto-agent-host') as HTMLElement & { shadowRoot: ShadowRoot };
      if (!host || !host.shadowRoot) return { ok: false, error: 'shadow root missing' };

      const fab = host.shadowRoot.getElementById('agent-fab');
      if (fab) fab.click();

      // Open the custom API settings sheet so we can set values explicitly
      const customApiBtn = host.shadowRoot.getElementById('btn-custom-api');
      if (customApiBtn) customApiBtn.click();

      // Set server to devproject
      const serverSel = host.shadowRoot.getElementById('cfg-server') as HTMLSelectElement | null;
      if (serverSel) { serverSel.value = 'devproject'; serverSel.dispatchEvent(new Event('change', { bubbles: true })); }

      // Set provider to devproject (Kilo session API)
      const providerSel = host.shadowRoot.getElementById('cfg-provider') as HTMLSelectElement | null;
      if (providerSel) { providerSel.value = 'devproject'; providerSel.dispatchEvent(new Event('change', { bubbles: true })); }

      // Set model to kilo-auto/free
      const kiloModelSel = host.shadowRoot.getElementById('cfg-kilomodel') as HTMLSelectElement | null;
      if (kiloModelSel) { kiloModelSel.value = 'kilo-auto/free'; kiloModelSel.dispatchEvent(new Event('change', { bubbles: true })); }

      // Auto-execute ON
      const autoExecToggle = host.shadowRoot.getElementById('toggle-auto-execute') as HTMLInputElement | null;
      if (autoExecToggle) { autoExecToggle.checked = true; autoExecToggle.dispatchEvent(new Event('change', { bubbles: true })); }

      // Heuristic fallback OFF (strict real-API mode)
      const heuristicToggle = host.shadowRoot.getElementById('cfg-heuristic-toggle') as HTMLInputElement | null;
      if (heuristicToggle) { heuristicToggle.checked = false; heuristicToggle.dispatchEvent(new Event('change', { bubbles: true })); }

      // Max steps = 5
      const maxStepsInput = host.shadowRoot.getElementById('input-max-steps') as HTMLInputElement | null;
      if (maxStepsInput) { maxStepsInput.value = '5'; maxStepsInput.dispatchEvent(new Event('change', { bubbles: true })); }

      // Close the settings sheet — saveConfigFromUI is called on close
      const closeConfigBtn = host.shadowRoot.getElementById('close-config-btn');
      if (closeConfigBtn) closeConfigBtn.click();

      return { ok: true };
    });

    // Give config save time to flush to localStorage
    await page.waitForTimeout(500);

    // Verify config was saved correctly
    const configCheck = await page.evaluate(() => {
      const stored = localStorage.getItem('auto_agent_config');
      if (!stored) return { ok: false, error: 'config not in localStorage' };
      try {
        const cfg = JSON.parse(stored);
        return {
          ok: cfg.PROVIDER === 'devproject' &&
              cfg.PROVIDER === 'devproject' &&
              cfg.KILO_MODEL === 'kilo-auto/free' &&
              cfg.SERVER === 'devproject' &&
              cfg.ALLOW_HEURISTIC_FALLBACK === false,
          provider: cfg.PROVIDER,
          model: cfg.KILO_MODEL,
          server: cfg.SERVER,
          heuristic: cfg.ALLOW_HEURISTIC_FALLBACK,
          maxSteps: cfg.MAX_STEPS,
        };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });
    console.log('  [config check]', JSON.stringify(configCheck));
    expect(configCheck.ok).toBe(true);

    // --- Set the goal and start the agent ---
    await page.evaluate(() => {
      const host = document.getElementById('auto-agent-host') as HTMLElement & { shadowRoot: ShadowRoot };
      if (!host || !host.shadowRoot) return null;

      const promptInput = host.shadowRoot.getElementById('agent-prompt-input') as HTMLTextAreaElement | null;
      if (promptInput) {
        promptInput.value = 'Type "AI agents" into the search box on this page';
        promptInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const startBtn = host.shadowRoot.getElementById('start-agent-btn');
      if (startBtn) startBtn.click();

      return promptInput?.value || null;
    });

    // --- Wait for the agent to begin (status pill or fullscreen panel) ---
    let agentStarted = false;
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !agentStarted) {
      agentStarted = await page.evaluate(() => {
        const host = document.getElementById('auto-agent-host') as HTMLElement & { shadowRoot: ShadowRoot };
        if (!host || !host.shadowRoot) return false;

        // Check the status pill text (always present in the DOM)
        const pillText = host.shadowRoot.querySelector('.status-text') as HTMLElement | null;
        if (pillText && pillText.textContent) {
          const txt = pillText.textContent.toLowerCase();
          if (txt.includes('scanning') || txt.includes('think') || txt.includes('act') || txt.includes('synthesiz')) return true;
        }

        // Also check the fullscreen panel title
        const fsTitle = host.shadowRoot.getElementById('fs-status-title') as HTMLElement | null;
        if (fsTitle && fsTitle.textContent) {
          const txt = fsTitle.textContent.toLowerCase();
          if (txt.includes('scann') || txt.includes('think') || txt.includes('act') || txt.includes('synthesiz')) return true;
        }

        return false;
      });
      if (!agentStarted) await page.waitForTimeout(500);
    }
    expect(agentStarted).toBe(true);

    // --- Wait for the search input to be filled (or timeout) ---
    let searchFilled = false;
    let agentError = false;
    let lastStatus = '';
    const fillDeadline = Date.now() + 90000;
    while (Date.now() < fillDeadline && !searchFilled && !agentError) {
      const result = await page.evaluate(() => {
        const searchBox = document.getElementById('searchBox') as HTMLInputElement | null;
        if (searchBox && searchBox.value.includes('AI agents')) return { status: 'filled', pillText: '', fsTitle: '' };

        // Check the Shadow DOM status for errors or progress
        const host = document.getElementById('auto-agent-host') as HTMLElement & { shadowRoot: ShadowRoot };
        if (host && host.shadowRoot) {
          const pillText = host.shadowRoot.querySelector('.status-text') as HTMLElement | null;
          const fsTitle = host.shadowRoot.getElementById('fs-status-title') as HTMLElement | null;
          const pill = pillText ? pillText.textContent || '' : '';
          const fs = fsTitle ? fsTitle.textContent || '' : '';

          const combined = (pill + ' ' + fs).toLowerCase();
          if (combined.includes('error') && !combined.includes('scan') && !combined.includes('think') && !combined.includes('synthes')) {
            return { status: 'error', pillText: pill, fsTitle: fs };
          }
          return { status: 'waiting', pillText: pill, fsTitle: fs };
        }
        return { status: 'waiting', pillText: '', fsTitle: '' };
      });

      lastStatus = JSON.stringify(result);
      if (result.status === 'filled') searchFilled = true;
      if (result.status === 'error') agentError = true;
      if (!searchFilled && !agentError) {
        console.log(`  [poll] ${lastStatus}`);
        await page.waitForTimeout(1000);
      }
    }

    // Final status output
    const finalSearchValue = await page.$eval('#searchBox', (el) => (el as HTMLInputElement).value);
    console.log('  [final] search value:', finalSearchValue);
    console.log('  [final] searchFilled:', searchFilled, 'agentError:', agentError);

    expect(agentError).toBe(false);
    expect(searchFilled).toBe(true);
    expect(finalSearchValue).toContain('AI agents');
  });
});
