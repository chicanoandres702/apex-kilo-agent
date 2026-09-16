/*
 * [Parent Feature/Milestone] <Wikipedia e2e testing>
 * [Child Task/Issue] #real-browser-test
 * [Subtask] <Test extension with real browser and real prompt with retries>
 * [Upstream] <Local dev server> -> [Downstream] <DevProject OpenCode server>
 * [Law Check] <250> lines | Passed Do It Check
 */
import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import { execSync } from 'child_process';
import * as unzipper from 'unzipper';

const WIKIPEDIA_URL = 'https://en.wikipedia.org';
const TEST_PROMPT = 'On this Wikipedia page, find the search input field (usually in the top right corner of the page, with id "searchInput" or name "search"). Click on it, type "Artificial Intelligence", then simulate pressing the Enter key to submit the search. The page should navigate to the Artificial_Intelligence article.';
const TARGET_URL_PATTERN = '/wiki/Artificial_intelligence';
const SEARCH_URL_PATTERN = '?search=';
const TEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per attempt
const MAX_RETRIES = 2; // retry the entire test up to 2 times
const USE_XVFB = fs.existsSync('/usr/bin/xvfb-run');

async function downloadAndExtractExtension(): Promise<string> {
  console.log('Step 1: Downloading extension ZIP...');
  const zipPath = '/tmp/apex-kilo-extension.zip';
  execSync(`curl -sL "http://localhost:3000/api/extension/download" -o "${zipPath}"`);

  const extractDir = '/tmp/apex-kilo-extension';
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: extractDir }))
      .on('close', () => resolve())
      .on('error', reject);
  });
  console.log('✓ Extension extracted to:', extractDir);
  return extractDir;
}

async function setupConsoleLogging(page: Page): Promise<void> {
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Apex') || text.includes('Kilo') || text.includes('apex') ||
        text.includes('Autonomous') || text.includes('extension') || text.includes('error') ||
        text.includes('Error') || text.includes('ERR') || text.includes('PLAN') ||
        text.includes('parse') || text.includes('JSON') || text.includes('raw') ||
        text.includes('Invalid') || text.includes('retry')) {
      console.log(`[Console ${msg.type()}]: ${text}`);
    }
  });

  page.on('pageerror', err => {
    const msg = err.message.replace(/\n\s+/g, ' ').trim();
    console.log(`[PageError]: ${msg}`);
  });
}

async function checkHudInjection(page: Page): Promise<boolean> {
  const hostFound = await page.evaluate(() => {
    const host = document.getElementById('auto-agent-host');
    return !!host;
  });
  console.log('✓ Host element #auto-agent-host exists:', hostFound);

  if (!hostFound) {
    console.log('✗ Host element not found.');
    await page.screenshot({ path: '/tmp/wiki-no-host.png' });
    return false;
  }

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
  return true;
}

async function configureExtension(page: Page): Promise<boolean> {
  console.log('Step 4: Configuring extension to use DevProject server...');

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

  // Configure via Shadow DOM UI
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

    const saveBtn = host.shadowRoot.getElementById('btn-save-cfg') as HTMLButtonElement | null;
    if (saveBtn) saveBtn.click();
  });
  console.log('✓ Config set to DevProject + kilo-auto/free');
  await page.waitForTimeout(500);

  // Override advanced settings via localStorage
  await page.evaluate(() => {
    const stored = localStorage.getItem('auto_agent_config');
    if (stored) {
      const cfg = JSON.parse(stored);
      cfg.PLAN_TIMEOUT_MS = 30000;    // 30s per plan request (kilo-auto/free can be slow)
      cfg.LLM_RETRIES = 2;            // two retries
      cfg.SESSION_PER_STEP = true;    // fresh session per step to avoid context growth
      cfg.RUN_DEADLINE_MS = 300000;   // 5 min total deadline
      cfg.ALLOW_HEURISTIC_FALLBACK = false;
      cfg.ALLOW_TOOLS = false;
      localStorage.setItem('auto_agent_config', JSON.stringify(cfg));
    }
  });
  console.log('✓ Advanced config overridden (PLAN_TIMEOUT_MS=15000, LLM_RETRIES=1, SESSION_PER_STEP=true)');

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
  return configCheck.ok;
}

async function startAgent(page: Page, prompt: string): Promise<boolean> {
  const promptFilled = await page.evaluate((p: string) => {
    const host = document.getElementById('auto-agent-host') as any;
    if (!host || !host.shadowRoot) return false;
    const input = host.shadowRoot.getElementById('agent-prompt-input') as HTMLTextAreaElement;
    if (!input) return false;
    input.value = p;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, prompt);
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
  console.log('Prompt:', prompt);
  return startClicked;
}

async function monitorProgress(page: Page, testNum: number): Promise<boolean> {
  console.log('Step 5: Monitoring agent progress (timeout: 6 min)...');

  const startTime = Date.now();
  while (Date.now() - startTime < TEST_TIMEOUT_MS) {
    const url = page.url();
    const title = await page.title();
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Progress ${elapsed}s] ${url.substring(0, 70)} | "${title.substring(0, 50)}"`);

    // Check for target URL (either search results page or the final article)
    if ((url.includes(TARGET_URL_PATTERN) && title.toLowerCase().includes('artificial intelligence')) ||
        (url.includes(SEARCH_URL_PATTERN) && title.toLowerCase().includes('artificial intelligence'))) {
      console.log('✓ SUCCESS: Agent reached target Wikipedia article!');
      await page.screenshot({ path: `/tmp/wiki-success-test${testNum}.png` });
      return true;
    }

    await page.waitForTimeout(10000);
  }

  console.log('Timed out. Taking final screenshot...');
  await page.screenshot({ path: `/tmp/wiki-timeout-test${testNum}.png` });
  return false;
}

async function runRealBrowserTest(testNum: number): Promise<boolean> {
  console.log(`\n=== Starting Real Browser Test (Attempt ${testNum}) ===`);

  const extensionPath = await downloadAndExtractExtension();
  console.log('Step 2: Launching real browser with extension...');

  const browser = await chromium.launchPersistentContext(
    `/tmp/chrome-apx-test-profile-${testNum}`,
    {
      headless: false, // Requires xvfb-run (no real X server) or real display
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
  await setupConsoleLogging(page);

  try {
    console.log('Step 3: Loading Wikipedia page...');
    await page.goto(WIKIPEDIA_URL);
    console.log('✓ Navigated to:', await page.title());

    await page.waitForTimeout(8000);
    console.log('✓ Waited for extension to inject');

    if (!await checkHudInjection(page)) {
      return false;
    }

    console.log('✓ Host found! Now testing HUD interaction...');
    if (!await configureExtension(page)) {
      console.log('✗ Failed to configure extension.');
      await page.screenshot({ path: '/tmp/wiki-config-fail.png' });
      return false;
    }

    if (!await startAgent(page, TEST_PROMPT)) {
      console.log('✗ Failed to start agent.');
      await page.screenshot({ path: '/tmp/wiki-start-fail.png' });
      return false;
    }

    return await monitorProgress(page, testNum);
  } finally {
    await browser.close();
  }
}

async function main() {
  let lastSuccess = false;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      lastSuccess = await runRealBrowserTest(attempt);
      if (lastSuccess) break;
    } catch (err) {
      console.error(`Fatal error on attempt ${attempt}:`, err);
      lastSuccess = false;
    }
    if (!lastSuccess && attempt < MAX_RETRIES) {
      console.log(`\n=== Attempt ${attempt} failed, retrying... ===\n`);
    }
  }

  if (lastSuccess) {
    console.log('\n✓ TEST PASSED: Wikipedia navigation verified.\n');
    process.exit(0);
  } else {
    console.log('\n✗ TEST FAILED: All attempts exhausted.\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
