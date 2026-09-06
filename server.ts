import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';

const PORT = 3000;

// Lazy initialization for Gemini client
let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: key });
  }
  return geminiClient;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // 1. Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      agent: 'Apex Kilo Autonomous Agent',
      version: '8.14.0',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // 2. Serve the raw userscript file directly for Tampermonkey 1-click install
  const userScriptPath = path.join(process.cwd(), 'apex_kilo_autonomous_agent.user.js');

  app.get('/apex_kilo_autonomous_agent.user.js', (req: Request, res: Response) => {
    if (fs.existsSync(userScriptPath)) {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="apex_kilo_autonomous_agent.user.js"');
      fs.createReadStream(userScriptPath).pipe(res);
    } else {
      res.status(404).send('Userscript file not found');
    }
  });

  app.get('/api/script/raw', (req: Request, res: Response) => {
    if (fs.existsSync(userScriptPath)) {
      const content = fs.readFileSync(userScriptPath, 'utf-8');
      res.json({ content, version: '8.14.0' });
    } else {
      res.status(404).json({ error: 'Userscript file not found' });
    }
  });

  // 3. OpenCode / DevProject server diagnostics & models
  app.get('/api/opencode/status', async (req: Request, res: Response) => {
    const startT = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch('https://devproject.vip/ai/agent', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - startT;

      if (!resp.ok) {
        return res.json({
          ok: false,
          status: resp.status,
          latencyMs,
          message: `OpenCode server returned HTTP ${resp.status}`,
        });
      }

      const agents = (await resp.json()) as any[];
      const agentNames = Array.isArray(agents) ? agents.map((a: any) => a.name) : [];

      res.json({
        ok: true,
        latencyMs,
        agents: agentNames,
        connected: ['kilo'],
        models: [
          'kilo-auto/free',
          'google/gemini-3.8-flash',
          'kilo-auto/balanced',
          'anthropic/claude-sonnet-4.6',
          'deepseek/deepseek-v4-pro',
          'openai/gpt-5.6-sol',
          'moonshotai/kimi-k3',
        ],
        defaultModel: 'kilo-auto/free',
      });
    } catch (err: any) {
      res.json({
        ok: false,
        latencyMs: Date.now() - startT,
        error: err.message || 'Unable to connect to OpenCode server',
      });
    }
  });

  // 4. Chrome / Edge Manifest V3 WebExtension ZIP Builder
  app.get('/api/extension/download', async (req: Request, res: Response) => {
    try {
      const zip = new JSZip();
      const scriptCode = fs.existsSync(userScriptPath)
        ? fs.readFileSync(userScriptPath, 'utf-8')
        : '// Apex Kilo Autonomous Agent content script';

      // manifest.json
      const manifest = {
        manifest_version: 3,
        name: 'Apex Kilo Autonomous Agent',
        version: '8.14.0',
        description: 'Autonomous browser action agent with deep DOM scanning, numbered badges, in-page HUD, and multi-provider AI planning.',
        permissions: ['activeTab', 'scripting', 'storage'],
        host_permissions: ['<all_urls>'],
        action: {
          default_popup: 'popup.html',
          default_title: 'Apex Kilo Agent',
        },
        content_scripts: [
          {
            matches: ['<all_urls>'],
            js: ['content_script.js'],
            run_at: 'document_idle',
          },
        ],
        background: {
          service_worker: 'background.js',
        },
      };
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // content_script.js: wrapper around userscript logic
      zip.file('content_script.js', `// Apex Kilo Autonomous Agent v8.14 Content Script\n(function() {\n  console.log('[Apex Kilo] Browser Extension Content Script Injected');\n  ${scriptCode}\n})();\n`);

      // background.js
      const backgroundJs = `// Apex Kilo Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Apex Kilo Extension] Successfully installed.');
});

// Relay messages between popup and active tab
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_TAB_STATUS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'QUERY_AGENT_STATE' }, (resp) => {
          sendResponse(resp || { running: false, step: 0 });
        });
      } else {
        sendResponse({ running: false });
      }
    });
    return true;
  }
});
`;
      zip.file('background.js', backgroundJs);

      // popup.html
      const popupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Apex Kilo Agent</title>
  <style>
    body {
      margin: 0;
      width: 360px;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #020617;
      color: #f8fafc;
      padding: 16px;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      color: white;
    }
    .title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .badge {
      font-size: 10px;
      background: #082f49;
      color: #38bdf8;
      border: 1px solid #0369a1;
      border-radius: 4px;
      padding: 2px 6px;
      font-family: monospace;
    }
    .status-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .status-label {
      font-size: 11px;
      color: #94a3b8;
    }
    .status-val {
      font-size: 11px;
      font-weight: 600;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    .input-label {
      font-size: 11px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 6px;
      display: block;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      background: #020617;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 12px;
      color: #f1f5f9;
      resize: none;
      outline: none;
      margin-bottom: 12px;
    }
    textarea:focus {
      border-color: #0284c7;
    }
    .btn-row {
      display: flex;
      gap: 8px;
    }
    button {
      flex: 1;
      background: #0284c7;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover {
      background: #0369a1;
    }
    button.secondary {
      background: #1e293b;
      color: #cbd5e1;
    }
    button.secondary:hover {
      background: #334155;
    }
    .footer {
      margin-top: 14px;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="logo">K</div>
      <div>
        <div class="title">Apex Kilo Extension</div>
        <div style="font-size: 10px; color: #94a3b8;">Autonomous In-Browser Agent</div>
      </div>
    </div>
    <span class="badge">v8.14</span>
  </div>

  <div class="status-card">
    <div>
      <div class="status-label">Active Webpage Agent</div>
      <div class="status-val"><div class="pulse"></div> Injected & Ready</div>
    </div>
    <button id="btnRescan" class="secondary" style="flex: 0 0 auto; padding: 4px 8px; font-size: 11px;">Rescan DOM</button>
  </div>

  <label class="input-label">Autonomous Goal for this tab:</label>
  <textarea id="goalInput" rows="3" placeholder="e.g., Search flights to Tokyo, add item to cart, fill and submit form..."></textarea>

  <div class="btn-row">
    <button id="btnStart">Launch Autonomous Run</button>
    <button id="btnPause" class="secondary">Pause</button>
  </div>

  <div class="footer">
    In-page floating HUD is mounted in the lower right corner of the tab.
  </div>

  <script src="popup.js"></script>
</body>
</html>`;
      zip.file('popup.html', popupHtml);

      // popup.js
      const popupJs = `document.addEventListener('DOMContentLoaded', () => {
  const goalInput = document.getElementById('goalInput');
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const btnRescan = document.getElementById('btnRescan');

  // Load saved goal
  chrome.storage.local.get(['apex_kilo_ext_goal'], (data) => {
    if (data.apex_kilo_ext_goal) goalInput.value = data.apex_kilo_ext_goal;
  });

  btnStart.addEventListener('click', () => {
    const goal = goalInput.value.trim();
    if (!goal) return;
    chrome.storage.local.set({ apex_kilo_ext_goal: goal });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'START_MISSION', goal });
        window.close();
      }
    });
  });

  btnPause.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'PAUSE_MISSION' });
      }
    });
  });

  btnRescan.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESCAN_DOM' });
      }
    });
  });
});`;
      zip.file('popup.js', popupJs);

      // README.md installation instructions
      const readme = `# Apex Kilo Autonomous Agent - Chrome Extension (Manifest V3)

## How to Install in Chrome, Edge, Brave, or Opera:
1. Extract this ZIP file into a folder on your computer.
2. Open your browser and navigate to \`chrome://extensions\` (or \`edge://extensions\`).
3. Toggle on **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** in the top left.
5. Select the unzipped folder containing \`manifest.json\`.
6. Done! Navigate to any website — the Apex Kilo HUD will automatically mount in the bottom right corner with interactive numerical badges!
`;
      zip.file('README.md', readme);

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="apex-kilo-extension-v8.14.zip"');
      res.send(zipBuffer);
    } catch (err: any) {
      console.error('Error generating extension ZIP:', err);
      res.status(500).send('Failed to generate extension zip');
    }
  });

  // 5. AI Plan generation endpoint
  app.post('/api/plan', async (req: Request, res: Response) => {
    try {
      const { goal, tree, history, provider, model, customApiKey, customEndpoint } = req.body;

      if (!goal) {
        return res.status(400).json({ error: 'Goal is required' });
      }

      // Compact representation of interactive elements for the planner
      const treeSummary = Array.isArray(tree)
        ? tree.slice(0, 80).map((el: any) => ({
            id: el.id,
            tag: el.tag,
            role: el.role,
            type: el.type,
            name: el.name,
            text: el.text ? String(el.text).slice(0, 120) : '',
            value: el.value ? String(el.value).slice(0, 60) : undefined,
            pos: el.pos,
          }))
        : [];

      const systemPrompt = `You are Apex Kilo, an autonomous in-browser reasoning agent.
Your mission is to accomplish the user's goal by analyzing the DOM elements and deciding the single best next action.
You must return ONLY a single JSON object with no markdown formatting or commentary.

AVAILABLE ACTIONS:
- "click": Click an element. Must specify "target": <element id number>.
- "type": Type into an input/textarea. Must specify "target": <element id number> and "value": "<text to type>".
- "clear": Clear a field. Must specify "target": <element id number>.
- "select": Choose a dropdown option. Must specify "target": <element id number> and "value": "<option value/text>".
- "scroll": Scroll page or element. Specify "target": <element id number> or "value": "down" | "up".
- "wait": Pause briefly for dynamic content to render.
- "done": Goal is completely achieved. Specify "answer": "<final summary or result>".

JSON FORMAT SPECIFICATION:
{
  "thought": "Short explanation of your reasoning for this step",
  "action": "click" | "type" | "clear" | "select" | "scroll" | "wait" | "done",
  "target": 0,
  "value": "optional string value for type/select/scroll",
  "answer": "optional final conclusion if action is done"
}`;

      const userPrompt = `USER GOAL: "${goal}"

CURRENT PAGE INTERACTIVE ELEMENTS (with numeric badge IDs):
${JSON.stringify(treeSummary, null, 2)}

PREVIOUS STEPS TAKEN:
${JSON.stringify(history || [], null, 2)}

Select the next optimal action to advance the goal. Output ONLY valid JSON.`;

      // Branch 1: Gemini Planner (Default or Explicit)
      if (provider === 'gemini' || (!provider && process.env.GEMINI_API_KEY)) {
        const apiKey = customApiKey || process.env.GEMINI_API_KEY;
        if (apiKey) {
          try {
            const client = new GoogleGenAI({ apiKey });
            const modelName = model || 'gemini-2.5-flash';

            const response = await client.models.generateContent({
              model: modelName,
              contents: `${systemPrompt}\n\n${userPrompt}`,
              config: {
                responseMimeType: 'application/json',
                temperature: 0.2,
              },
            });

            const text = response.text || '';
            try {
              const plan = JSON.parse(text.replace(/```json|```/g, '').trim());
              return res.json({ ok: true, plan, provider: 'gemini', model: modelName });
            } catch (parseErr) {
              return res.json({
                ok: true,
                plan: {
                  thought: 'Interpreting response',
                  action: 'wait',
                  raw: text,
                },
              });
            }
          } catch (geminiErr: any) {
            console.warn('Gemini plan error:', geminiErr.message);
            // Fall through to other branches
          }
        }
      }

      // Branch 2: DevProject / OpenCode REST session API (Port 4096 / https://devproject.vip/ai)
      if (provider === 'devproject' || provider === 'kilo') {
        const base = (customEndpoint || 'https://devproject.vip/ai').replace(/\/+$/, '');
        let sessionId: string | null = null;

        try {
          // Create short-lived session
          const sessRes = await fetch(`${base}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory: '/' }),
          });

          if (sessRes.ok) {
            const sessData = (await sessRes.json()) as any;
            sessionId = sessData?.id || sessData?.session?.id;

            if (sessionId) {
              const msgRes = await fetch(`${base}/session/${encodeURIComponent(sessionId)}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  agent: 'plan', // Native OpenCode planner mode
                  model: {
                    providerID: 'kilo',
                    modelID: model || 'kilo-auto/free',
                  },
                  parts: [
                    {
                      type: 'text',
                      text: `${systemPrompt}\n\n${userPrompt}`,
                    },
                  ],
                }),
              });

              if (msgRes.ok) {
                const msgData = (await msgRes.json()) as any;
                let rawText = '';
                if (Array.isArray(msgData.parts)) {
                  rawText = msgData.parts.map((p: any) => p.text || '').join('');
                }

                if (rawText) {
                  const cleanJson = rawText.replace(/```json|```/g, '').trim();
                  const match = cleanJson.match(/\{[\s\S]*\}/);
                  if (match) {
                    const plan = JSON.parse(match[0]);
                    // Cleanup session in background
                    fetch(`${base}/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
                    return res.json({ ok: true, plan, provider });
                  }
                }
              }
            }
          }
        } catch (opencodeErr: any) {
          console.warn('OpenCode session error:', opencodeErr.message);
        } finally {
          if (sessionId) {
            fetch(`${base}/session/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
          }
        }

        // If OpenCode had 500 error or is unavailable, fallback to Gemini if key exists!
        if (process.env.GEMINI_API_KEY) {
          try {
            const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await client.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `${systemPrompt}\n\n${userPrompt}`,
              config: { responseMimeType: 'application/json', temperature: 0.2 },
            });
            const text = response.text || '';
            const plan = JSON.parse(text.replace(/```json|```/g, '').trim());
            return res.json({
              ok: true,
              plan,
              provider: 'gemini (fallback from devproject)',
              model: 'gemini-2.5-flash',
            });
          } catch (_) {}
        }
      }

      // Fallback: Inform client to use client-side heuristic engine
      return res.json({
        ok: false,
        fallbackToHeuristic: true,
        message: 'External provider unavailable or returned error. Using resilient client-side heuristic engine.',
      });
    } catch (err: any) {
      console.error('Plan generation error:', err);
      res.status(500).json({ error: err.message || 'Failed to generate plan' });
    }
  });

  // 6. Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Apex Kilo Autonomous Agent running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
