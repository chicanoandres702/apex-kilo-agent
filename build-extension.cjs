const fs = require('fs');
const path = require('path');
const src = '/home/administrator/apex-kilo-agent';
const dest = '/tmp/apex-extension-unpacked';

fs.mkdirSync(dest, { recursive: true });

const scriptCode = fs.readFileSync(path.join(src, 'apex_kilo_autonomous_agent.user.js'), 'utf-8');
const manifest = {
  manifest_version: 3,
  name: 'Apex Kilo Autonomous Agent',
  version: '8.15.0',
  description: 'Autonomous browser action agent with deep DOM scanning.',
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: ['<all_urls>'],
  action: { default_popup: 'popup.html', default_title: 'Apex Kilo Agent' },
  content_scripts: [{ matches: ['<all_urls>'], js: ['content_script.js'], run_at: 'document_idle' }],
  background: { service_worker: 'background.js' },
};

fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(dest, 'content_script.js'),
  '// Apex Kilo Content Script\n(function() {\n  console.log("[Apex Kilo] Extension Content Script Injected");\n  ' + scriptCode + '\n})();\n');
fs.writeFileSync(path.join(dest, 'background.js'),
  'chrome.runtime.onInstalled.addListener(()=>{console.log("[Apex Kilo Extension] Installed");});\n');

console.log('Unpacked extension written to', dest);
