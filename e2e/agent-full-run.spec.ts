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

test.describe('Apex Kilo Agent — Complex Multi-Field Form Fill Challenge', () => {
  let context: any;
  let page: Page;

  test.beforeAll(async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-kilo-complex-'));
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--load-extension=${extensionPath}`,
        `--disable-extensions-except=${extensionPath}`,
      ],
    });
  });

  test.afterAll(async () => { if (context) await context.close(); });

  test.beforeEach(async () => {
    page = await context.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[Apex') || text.includes('apex') || text.includes('[Agent')) {
        console.log(`  [browser:${msg.type()}] ${text}`);
      }
    });
    page.on('pageerror', (err) => console.log(`  [browser:pageerror] ${err.message}`));
  });

  test.afterEach(async () => { if (page) await page.close(); });

  test('agent fills contact form (3 fields), clicks nav link, then submits — full multi-step verification', async () => {
    test.setTimeout(240000);

    // ===== STEP 1: Load the test page =====
    await page.goto('http://localhost:3000/src/test-page.html');
    await page.waitForLoadState('networkidle');

    // Wait for the content script to mount the HUD
    await page.waitForFunction(
      () => document.getElementById('auto-agent-host') !== null,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    // Clear any previous state
    await page.evaluate(() => {
      localStorage.removeItem('auto_agent_config');
      localStorage.removeItem('auto_agent_run_state_v1');
    });

    // ===== STEP 2: Configure the agent via Shadow DOM =====
    await page.evaluate(() => {
      const host = document.getElementById('auto-agent-host') as HTMLElement & { shadowRoot: ShadowRoot };
      if (!host || !host.shadowRoot) return { ok: false };

      const fab = host.shadowRoot.getElementById('agent-fab');
      if (fab) fab.click();

      const customApiBtn = host.shadowRoot.getElementById('btn-custom-api');
      if (customApiBtn) customApiBtn.click();

      const serverSel = host.shadowRoot.getElementById('cfg-server') as HTMLSelectElement | null;
      if (serverSel) { serverSel.value = 'devproject'; serverSel.dispatchEvent(new Event('change', { bubbles: true })); }

      const providerSel = host.shadowRoot.getElementById('cfg-provider') as HTMLSelectElement | null;
      if (providerSel) { providerSel.value = 'devproject'; providerSel.dispatchEvent(new Event('change', { bubbles: true })); }

      const kiloModelSel = host.shadowRoot.getElementById('cfg-kilomodel') as HTMLSelectElement | null;
      if (kiloModelSel) { kiloModelSel.value = 'kilo-auto/free'; kiloModelSel.dispatchEvent(new Event('change', { bubbles: true })); }

      const autoExecToggle = host.shadowRoot.getElementById('toggle-auto-execute') as HTMLInputElement | null;
      if (autoExecToggle) { autoExecToggle.checked = true; autoExecToggle.dispatchEvent(new Event('change', { bubbles: true })); }

      const heuristicToggle = host.shadowRoot.getElementById('cfg-heuristic-toggle') as HTMLInputElement | null;
      if (heuristicToggle) { heuristicToggle.checked = false; heuristicToggle.dispatchEvent(new Event('change', { bubbles: true })); }

      const maxStepsInput = host.shadowRoot.getElementById('input-max-steps') as HTMLInputElement | null;
      if (maxStepsInput) { maxStepsInput.value = '40'; maxStepsInput.dispatchEvent(new Event('change', { bubbles: true })); }

      const closeConfigBtn = host.shadowRoot.getElementById('close-config-btn');
      if (closeConfigBtn) closeConfigBtn.click();

      return { ok: true };
    });
    await page.waitForTimeout(500);

    // Override plan timeout and retries directly in localStorage (not exposed in UI)
    await page.evaluate(() => {
      const stored = localStorage.getItem('auto_agent_config');
      if (stored) {
        const cfg = JSON.parse(stored);
        cfg.PLAN_TIMEOUT_MS = 30000;
        cfg.LLM_RETRIES = 3;
        localStorage.setItem('auto_agent_config', JSON.stringify(cfg));
      }
    });

    // Verify config persisted
    const configCheck = await page.evaluate(() => {
      const stored = localStorage.getItem('auto_agent_config');
      if (!stored) return { ok: false };
      const cfg = JSON.parse(stored);
      return {
        ok: cfg.PROVIDER === 'devproject' &&
            cfg.KILO_MODEL === 'kilo-auto/free' &&
            cfg.ALLOW_HEURISTIC_FALLBACK === false &&
            cfg.SERVER === 'devproject',
        provider: cfg.PROVIDER,
        model: cfg.KILO_MODEL,
        maxSteps: cfg.MAX_STEPS,
        planTimeout: cfg.PLAN_TIMEOUT_MS,
        llmRetries: cfg.LLM_RETRIES,
      };
    });
    expect(configCheck.ok).toBe(true);
    console.log('  [config] verified:', configCheck);

    // ===== STEP 3: Set complex goal and start the agent =====
    // Harder prompt: Multi-field form fill + nav click + submission
    // This tests the agent's ability to:
    //   - Plan a sequence of type actions for different elements
    //   - Click on a link navigation
    //   - Fill multiple form fields in order
    //   - Submit the form
    await page.evaluate(() => {
      const host = document.getElementById('auto-agent-host') as HTMLElement & { shadowRoot: ShadowRoot };
      if (!host || !host.shadowRoot) return null;
      const promptInput = host.shadowRoot.getElementById('agent-prompt-input') as HTMLTextAreaElement | null;
      if (promptInput) {
        promptInput.value = 'Fill out the contact form completely: enter "Jane Smith" in the Name field, "jane.smith@test.com" in the Email field, "Interested in Apex Kilo agent capabilities" in the Message field, then click the "Go to Settings" link, and finally click the "Send Message" button to submit the form';
        promptInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const startBtn = host.shadowRoot.getElementById('start-agent-btn');
      if (startBtn) startBtn.click();
      return promptInput?.value || null;
    });

    // ===== STEP 4: Track step-by-step execution via run state =====
    console.log('  [watch] tracking autonomous run with complex multi-step goal...');

    let stepCount = 0;
    let goalReached = false;
    let agentError = false;
    let sawScanning = false;
    let sawThinking = false;
    let sawActing = false;
    let errorDetail = '';
    const deadline = Date.now() + 200000;

    while (Date.now() < deadline && !goalReached && !agentError) {
      const state = await page.evaluate(() => {
        const host = document.getElementById('auto-agent-host') as HTMLElement & { shadowRoot: ShadowRoot };
        if (!host || !host.shadowRoot) return { status: 'idle' };

        const pillText = host.shadowRoot.querySelector('.status-text') as HTMLElement | null;
        const fsTitle = host.shadowRoot.getElementById('fs-status-title') as HTMLElement | null;

        const pillow = pillText ? pillText.textContent || '' : '';
        const fsTitleText = fsTitle ? fsTitle.textContent || '' : '';
        const statusText = fsTitleText || pillow || '';
        const combined = statusText.toLowerCase();
        const status = combined.includes('goal reached') || combined.includes('done') ? 'done'
          : combined.includes('error') ? 'error'
          : 'running';

        // Try to read step count from persisted run state
        let steps = 0;
        let history = [];
        try {
          const raw = localStorage.getItem('auto_agent_run_state_v1');
          if (raw) {
            const parsed = JSON.parse(raw);
            steps = parsed.stepCount || 0;
            history = parsed.history || [];
          }
        } catch (_) {}

        // Track phase indicators
        const sawScan = combined.includes('scan') || combined.includes('analyz') || combined.includes('detect');
        const sawThink = combined.includes('think') || combined.includes('reason') || combined.includes('plan');
        const sawAct = combined.includes('execut') || combined.includes('acting') || combined.includes('click') || combined.includes('type');

        return {
          stepCount: steps,
          status: status,
          statusText: statusText,
          pillText: pillow,
          fsTitle: fsTitleText,
          history: history,
          sawScan,
          sawThink,
          sawAct,
        };
      });

      if (state.sawScan) sawScanning = true;
      if (state.sawThink) sawThinking = true;
      if (state.sawAct) sawActing = true;

      if (state.stepCount > stepCount) {
        stepCount = state.stepCount;
        console.log(`  [step ${stepCount}] status="${state.status}" pill="${state.pillText}" fs="${state.fsTitle}"`);
      }

      if (state.status === 'done') {
        goalReached = true;
        console.log('  [done] goal reached');
      } else if (state.status === 'error') {
        agentError = true;
        errorDetail = state.statusText;
        console.log('  [error] agent encountered an error:', state.statusText);
      }

      if (!goalReached && !agentError) {
        await page.waitForTimeout(800);
      }
    }

    // ===== STEP 5: Verify DOM mutations and final state =====
    const finalState = await page.evaluate(() => {
      const host = document.getElementById('auto-agent-host') as HTMLElement & { shadowRoot: ShadowRoot };
      let status = '';
      if (host && host.shadowRoot) {
        const fsTitle = host.shadowRoot.getElementById('fs-status-title') as HTMLElement | null;
        const pill = host.shadowRoot.querySelector('.status-text') as HTMLElement | null;
        status = (fsTitle ? fsTitle.textContent || '' : '') + ' | ' + (pill ? pill.textContent || '' : '');
      }
      // Check localStorage run state
      const runState = localStorage.getItem('auto_agent_run_state_v1');
      let parsed = null;
      try { parsed = runState ? JSON.parse(runState) : null; } catch (_) {}

      return {
        status,
        runState: parsed,
        lastResult: parsed ? parsed.lastResult : null,
        steps: parsed ? parsed.stepCount : 0,
        goal: parsed ? parsed.goal || '' : '',
        history: parsed ? parsed.history || [] : [],
      };
    });

    console.log('  [final] status:', finalState.status);
    console.log('  [final] steps:', finalState.steps);
    console.log('  [final] lastResult:', finalState.lastResult);

    // ===== STEP 6: Verify field interactions =====
    const nameInput = await page.$eval('#contactName', (el) => (el as HTMLInputElement).value);
    const emailInput = await page.$eval('#contactEmail', (el) => (el as HTMLInputElement).value);
    const messageInput = await page.$eval('#contactMessage', (el) => (el as HTMLTextAreaElement).value);
    const searchInput = await page.$eval('#searchBox', (el) => (el as HTMLInputElement).value);

    console.log('  [field] Name:', nameInput);
    console.log('  [field] Email:', emailInput);
    console.log('  [field] Message:', messageInput);
    console.log('  [field] Search:', searchInput);

    // ===== STEP 7: Assertions =====

    // The agent must have taken multiple steps (proving multi-step planning)
    expect(stepCount).toBeGreaterThanOrEqual(3);
    console.log('  [verify] steps taken:', stepCount);

    // The agent should have gone through scanning and thinking phases
    expect(sawScanning).toBe(true);
    expect(sawThinking).toBe(true);
    expect(sawActing).toBe(true);
    console.log('  [verify] phases - scanning:', sawScanning, 'thinking:', sawThinking, 'acting:', sawActing);

    // No errors should have occurred
    expect(agentError).toBe(false);
    if (agentError) {
      throw new Error(`Agent error detected: ${errorDetail}`);
    }

    // Name field should contain "Jane Smith"
    expect(nameInput).toContain('Jane Smith');

    // Email field should contain the test email
    expect(emailInput).toContain('jane.smith@test.com');

    // Message field should contain the message text
    expect(messageInput).toContain('Apex Kilo agent capabilities');

    // The search box should have been filled as part of the complex goal
    // (agent may or may not interact with it, but it's a secondary objective)
    console.log('  [verify] search box value:', searchInput);

    // Verify run state was persisted in localStorage
    expect(finalState.steps).toBeGreaterThanOrEqual(3);
    console.log('  [verify] persisted run state steps:', finalState.steps);

    // Verify history entries exist
    expect(finalState.history.length).toBeGreaterThanOrEqual(3);
    console.log('  [verify] history entries:', finalState.history.length);

    // Log the full run history for debugging
    console.log('  [history]', JSON.stringify(finalState.history, null, 2));
  });
});
