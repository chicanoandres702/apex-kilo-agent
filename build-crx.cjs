const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const chromeBin = '/opt/google/chrome/chrome';
const userScriptPath = path.join(process.cwd(), 'apex_kilo_autonomous_agent.user.js');
const crxOutPath = path.join(process.cwd(), 'dist', 'apex-kilo-extension-v8.15.crx');

const tmpDir = `/tmp/crx-build-${Date.now()}`;
fs.mkdirSync(tmpDir, { recursive: true });

const scriptCode = fs.existsSync(userScriptPath)
  ? fs.readFileSync(userScriptPath, 'utf-8')
  : '// Apex Kilo Autonomous Agent content script';

const manifest = {
  manifest_version: 3,
  name: 'Apex Kilo Autonomous Agent',
  version: '8.15.0',
  description: 'Autonomous browser action agent with deep DOM scanning, numbered badges, in-page HUD, and multi-provider AI planning.',
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: ['<all_urls>'],
  action: { default_popup: 'popup.html', default_title: 'Apex Kilo Agent' },
  content_scripts: [{ matches: ['<all_urls>'], js: ['content_script.js'], run_at: 'document_idle' }],
  background: { service_worker: 'background.js' },
};

fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(tmpDir, 'content_script.js'),
  `// Apex Kilo Autonomous Agent v8.15 Content Script\n(function() {\n  console.log('[Apex Kilo] Browser Extension Content Script Injected');\n  ${scriptCode}\n})();\n`);
fs.writeFileSync(path.join(tmpDir, 'background.js'),
  `// Apex Kilo Background Service Worker\nchrome.runtime.onInstalled.addListener(() => {\n  console.log('[Apex Kilo Extension] Successfully installed.');\n});\n\nchrome.runtime.onMessage.addListener((request, sender, sendResponse) => {\n  if (request.type === 'GET_TAB_STATUS') {\n    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {\n      if (tabs[0]?.id) {\n        chrome.tabs.sendMessage(tabs[0].id, { type: 'QUERY_AGENT_STATE' }, (resp) => {\n          sendResponse(resp || { running: false, step: 0 });\n        });\n      } else {\n        sendResponse({ running: false });\n      }\n    });\n    return true;\n  }\n});\n`);

// PEM key must be OUTSIDE the extension directory
const pemPath = `/tmp/crx-key-${Date.now()}.pem`;
execSync(`openssl genrsa -out "${pemPath}" 2048`);

const cmd = `"${chromeBin}" --pack-extension="${tmpDir}" --pack-extension-key="${pemPath}" --no-default-browser-check --no-first-run --headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage`;
console.log('Packing extension:', cmd);
execSync(cmd, { stdio: 'pipe' });

const generatedCrx = `${tmpDir}.crx`;
if (fs.existsSync(generatedCrx)) {
  fs.copyFileSync(generatedCrx, crxOutPath);
  fs.copyFileSync(pemPath, path.join(process.cwd(), 'dist', path.basename(pemPath)));
  console.log('CRX generated:', crxOutPath);
  console.log('PEM preserved:', path.join('dist', path.basename(pemPath)));
} else {
  console.error('CRX generation failed — output not found at', generatedCrx);
  process.exit(1);
}
