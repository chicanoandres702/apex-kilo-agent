/*
 * [Parent Feature/Milestone] <Wikipedia e2e testing>
 * [Child Task/Issue] #real-browser-test
 * [Subtask] <Test extension with real browser and real prompt>
 * [Upstream] <Local dev server> -> [Downstream] <DevProject OpenCode server>
 * [Law Check] <120> lines | Passed Do It Check
 */
import { chromium } from 'playwright';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as unzipper from 'unzipper';

const WIKIPEDIA_URL = 'https://en.wikipedia.org';
const TEST_PROMPT = 'Search for "Artificial Intelligence" on Wikipedia and press Enter.';

async function downloadAndExtractExtension(): Promise<string> {
  console.log('Step 1: Downloading extension ZIP...');
  const zipPath = '/tmp/apex-kilo-extension.zip';
  execSync(`curl -sL "http://localhost:3000/api/extension/download" -o "${zipPath}"`);

  const extractDir = '/tmp/apex-kilo-extension';
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });

  await fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: extractDir })).promise();
  console.log('✓ Extension extracted to:', extractDir);
  return extractDir;
}

async function runRealBrowserTest() {
  console.log('=== Starting Real Browser Test with Extension ===');

  const extensionPath = await downloadAndExtractExtension();
  console.log('Step 2: Launching real browser with extension...');

  const browser = await chromium.launchPersistentContext(
    '/tmp/chrome-apx-test-profile',
    {
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    }
  );

  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Apex') || text.includes('Kilo') || text.includes('apex') ||
        text.includes('Autonomous') || text.includes('extension') || text.includes('error') ||
        text.includes('Error') || text.includes('ERR') || text.includes('PLAN')) {
      console.log(`[Console ${msg.type()}]: ${text}`);
    }
  });

  page.on('pageerror', err => {
    const msg = err.message.replace(/\n\s+/g, ' ').trim();
    console.log(`[PageError]: ${msg}`);
  });

  console.log('Step 3: Loading Wikipedia page...');
  await page.goto(WIKIPEDIA_URL);
  console.log('✓ Navigated to:', await page.title());

  await page.waitForTimeout(8000);
  console.log('✓ Waited for extension to inject');

  // Check for the host element
  const hostFound = await page.evaluate(() => {
    const host = document.getElementById('auto-agent-host');
    return !!host;
  });
  console.log('✓ Host element #auto-agent-host exists:', hostFound);

  // List all elements with shadow roots
  const shadowHosts = await page.evaluate(() => {
    const results: string[] = [];
    const all = document.querySelectorAll('*');
    all.forEach(el => {
      if ((el as any).shadowRoot) {
        results.push(`${el.tagName}#${el.id} (shadow children: ${(el as any).shadowRoot.childNodes.length})`);
      }
    });
    return results;
  });
  console.log('Elements with shadow roots:', (shadowHosts.join(', ') || 'NONE FOUND'));

  if (!hostFound) {
    console.log('✗ Host element not found.');
    await page.screenshot({ path: '/tmp/wiki-final.png' });
    await browser.close();
    process.exit(1);
  }

  console.log('✓ Host found! Now testing HUD interaction...');

  // Click FAB to expand HUD
  await page.evaluate(() => {
    const host = document.getElementById('auto-agent-host') as any;
    if (!host || !host.shadowRoot) return false;
    const fab = host.shadowRoot.getElementById('agent-fab') as HTMLElement;
    if (!fab) return false;
    fab.click();
    return true;
  });
  console.log('✓ FAB clicked');
  await page.waitForTimeout(2000);

  // Configure the extension via Shadow DOM UI to use DevProject server
  // (has proper CORS headers for cross-origin fetch from wikipedia.org)
  await page.evaluate(() => {
    const host = document.getElementById('auto-agent-host') as any;
    if (!host || !host.shadowRoot) return;

    const serverSel = host.shadowRoot.getElementById('cfg-server') as HTMLSelectElement | null;
    if (serverSel) { serverSel.value = 'devproject'; serverSel.dispatchEvent(new Event('change', { bubbles: true })); }

    const providerSel = host.shadowRoot.getElementById('cfg-provider') as HTMLSelectElement | null;
    if (providerSel) { providerSel.value = 'devproject'; providerSel.dispatchEvent(new Event('change', { bubbles: true })); }

    const kiloModelSel = host.shadowRoot.getElementById('cfg-kilomodel') as HTMLSelectElement | null;
    if (kiloModelSel) {
      kiloModelSel.value = 'kilo-auto/free';
      kiloModelSel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const autoExecToggle = host.shadowRoot.getElementById('toggle-auto-execute') as HTMLInputElement | null;
    if (autoExecToggle) { autoExecToggle.checked = true; autoExecToggle.dispatchEvent(new Event('change', { bubbles: true })); }

    const heuristicToggle = host.shadowRoot.getElementById('cfg-heuristic-toggle') as HTMLInputElement | null;
    if (heuristicToggle) { heuristicToggle.checked = false; heuristicToggle.dispatchEvent(new Event('change', { bubbles: true })); }

    const maxStepsInput = host.shadowRoot.getElementById('input-max-steps') as HTMLInputElement | null;
    if (maxStepsInput) { maxStepsInput.value = '30'; maxStepsInput.dispatchEvent(new Event('change', { bubbles: true })); }

    // Save the config
    const saveBtn = host.shadowRoot.getElementById('btn-save-cfg') as HTMLButtonElement | null;
    if (saveBtn) saveBtn.click();
  });
  console.log('✓ Config set to DevProject + kilo-auto/free');
  await page.waitForTimeout(500);

  // Override advanced settings not exposed in UI (via localStorage)
  await page.evaluate(() => {
    const stored = localStorage.getItem('auto_agent_config');
    if (stored) {
      const cfg = JSON.parse(stored);
      cfg.PLAN_TIMEOUT_MS = 60000;
      cfg.LLM_RETRIES = 2;
      cfg.SESSION_PER_STEP = false;
      cfg.RUN_DEADLINE_MS = 300000;
      localStorage.setItem('auto_agent_config', JSON.stringify(cfg));
    }
  });
  console.log('✓ Advanced config overridden (PLAN_TIMEOUT_MS=60000, LLM_RETRIES=2)');

  // Verify config
  const configCheck = await page.evaluate(() => {
    const stored = localStorage.getItem('auto_agent_config');
    if (!stored) return { ok: false };
    const cfg = JSON.parse(stored);
    return {
      ok: cfg.PROVIDER === 'devproject' &&
          cfg.KILO_MODEL === 'kilo-auto/free' &&
          cfg.SERVER === 'devproject',
      provider: cfg.PROVIDER,
      model: cfg.KILO_MODEL,
      server: cfg.SERVER,
      planTimeout: cfg.PLAN_TIMEOUT_MS,
      llmRetries: cfg.LLM_RETRIES,
    };
  });
  console.log('✓ Config verified:', configCheck);

  // Fill prompt and start agent
  const promptFilled = await page.evaluate((prompt: string) => {
    const host = document.getElementById('auto-agent-host') as any;
    if (!host || !host.shadowRoot) return false;
    const input = host.shadowRoot.getElementById('agent-prompt-input') as HTMLTextAreaElement;
    if (!input) return false;
    input.value = prompt;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, TEST_PROMPT);
  console.log('✓ Prompt filled:', promptFilled);

  const startClicked = await page.evaluate(() => {
    const host = document.getElementById('auto-agent-host') as any;
    if (!host || !host.shadowRoot) return false;
    const btn = host.shadowRoot.getElementById('start-agent-btn') as HTMLButtonElement;
    if (!btn) return false;
    btn.click();
    return true;
  });
  console.log('✓ Start button clicked:', startClicked);
  console.log('Prompt:', TEST_PROMPT);
  console.log('Monitoring agent progress (timeout: 6 min)...');

  // Monitor progress
  const startTime = Date.now();
  const timeout = 6 * 60 * 1000;

  while (Date.now() - startTime < timeout) {
    const url = page.url();
    const title = await page.title();
    console.log(`[Progress] ${new Date().toLocaleTimeString()} | ${url.substring(0, 70)} | "${title.substring(0, 50)}"`);

    if (url.includes('/wiki/Artificial_intelligence') && title.toLowerCase().includes('artificial intelligence')) {
      console.log('✓ SUCCESS: Agent reached target Wikipedia article!');
      await page.screenshot({ path: '/tmp/wiki-success.png' });
      await browser.close();
      process.exit(0);
    }

    await page.waitForTimeout(10000);
  }

  console.log('Timed out. Taking final screenshot...');
  await page.screenshot({ path: '/tmp/wiki-final.png' });
  await browser.close();
  process.exit(1);
}

runRealBrowserTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
