// ==UserScript==
// @name         Autonomous Web Browser Agent (Kilo Server Edition)
// @namespace    http://tampermonkey.net/
// @version      8.14
// @updateURL    https://devproject.vip/apex-agent/apex_kilo_autonomous_agent.user.js
// @downloadURL  https://devproject.vip/apex-agent/apex_kilo_autonomous_agent.user.js
// @description  Full autonomous browser agent userscript for Tampermonkey. Deep Shadow DOM scanner, visual numbered badges, and LLM reasoning via the Kilo Code CLI server gateway (devproject.vip/ai), ported from Kilocode-Android2.
// @author       Autonomous Agent Project
// @match        *://*/*
// @connect      devproject.vip
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_notification
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // 1. CONFIGURATION & STATE MANAGEMENT
    // =========================================================================
    const DEFAULT_CONFIG = {
        // Kilo Server (Kilo Code) hosted at devproject.vip.
        //  - /ai  (port 4096) = Kilo Code session REST API (Kilocode-Android2 implementation).
        //    This is the DEFAULT planner. It runs the apex-browser agent: a tool-locked,
        //    in-page planner whose only job is to reason about the page and return a plan
        //    JSON that THIS script executes locally (no MCP/CLI/tools ever invoked).
        //  - /v1  (port 4097) = OpenAI-compatible chat completions — used by the 'kilo' provider.
        BASE_URL: 'https://devproject.vip/v1',
        API_KEY: '',
        MODEL: 'kilo-auto/free',
        PROVIDER: 'devproject', // 'devproject' (ai session API · 4096 · DEFAULT) | 'kilo' (v1 chat) | 'ollama' | 'openai' | 'openrouter' | 'groq' | 'custom' | 'heuristic'
        // Which server endpoint to use.
        //  'devproject' = DevProject OpenCode server, port 4096 (/ai). This IS the
        //                 OpenCode server (same API as https://opencode.ai/docs/server/)
        //                 and is the DEFAULT planner backend.
        //  'local'      = a LOCAL OpenCode server (`opencode serve`, port 4096) — same
        //                 API, no remote queue, so it's faster when available locally.
        //                 Point KILO_AI_BASE at http://127.0.0.1:4096.
        //  'kilo4097'   = same host but defaults the planner to the /v1 chat provider.
        //  'custom'     = reveals editable base URLs so you can point at your own server.
        SERVER: 'devproject',
        // Shared secret sent as the `X-Kilo-Auth` header (mirrors Android AuthInterceptor).
        KILO_AUTH: '',
        // Working directory the Kilo session API operates against (POST /session).
        KILO_DIRECTORY: '/',
        // Base for the OpenCode / Kilo session REST API (port 4096).
        //  DevProject (default):     https://devproject.vip/ai
        //  Local OpenCode server:     http://127.0.0.1:4096
        // The planner appends /session and /session/:id/message to this base.
        KILO_AI_BASE: 'https://devproject.vip/ai',
        // Model for the OpenCode server session API (opencode.ai/docs/server) at
        // https://devproject.vip/ai (port 4096). The 'kilo' provider is connected here
        // and serves "kilo-auto/free" (and "kilo-auto/balanced") — we pin kilo free.
        // kilo model IDs contain a slash (e.g. "kilo-auto/free"); the planner keeps them
        // under the 'kilo' provider and does NOT split them into provider/model.
        KILO_MODEL: 'kilo-auto/free',
        MAX_STEPS: 35,
        STEP_DELAY_MS: 450,
        MAX_ELEMENTS: 65,
        ENABLE_BADGES: true,
        CUSTOM_ENDPOINT: 'https://devproject.vip/v1',
        // When false (recommended), the agent will NOT fall back to the built-in
        // Heuristic Engine. Instead it retries the LLM call and, if it still fails,
        // throws so the run stops instead of silently guessing.
        ALLOW_HEURISTIC_FALLBACK: false,
        // Number of retry attempts for transient LLM failures AND for invalid /
        // non-JSON plans (the model is re-prompted each time). After these are
        // exhausted the run stops (heuristic guessing is disabled by design).
        LLM_RETRIES: 3,
        // Per-plan LLM request timeout (ms). Kept tight so a slow/queued model fails
        // fast and the run surfaces a clear error instead of appearing "stuck".
        // NOTE: the devproject 'kilo-auto/free' model commonly replies in 8-19s, so a
        // value below that just triggers wasted retries. Set above the model's typical
        // latency if you'd rather wait for a real answer than retry.
        PLAN_TIMEOUT_MS: 10000,
        // Planner reasoning effort. Lower = fewer reasoning tokens = faster replies.
        // 'low' is the default; 'none' (where the server supports it) skips reasoning
        // entirely and is the fastest. Some servers reject 'none' with a 400 — if so,
        // the run will surface that error and you should set this back to 'low'.
        REASONING_EFFORT: 'low',
        // Max characters of each element's text/name sent to the planner. Smaller =
        // fewer input tokens = faster prefill. The executor re-scans the live DOM, so
        // the planner only needs enough text to pick the right node.
        ELEMENT_TEXT_LIMIT: 120,
        // Create a FRESH short-lived session for EVERY step (default true). This keeps
        // each request's input small but costs an extra ~0.5-2.6s POST /session per
        // step. Set false to reuse ONE session across the whole run: saves that
        // round-trip on every step, at the cost of growing context on very long runs.
        SESSION_PER_STEP: true,
        // Hard wall-clock deadline (ms) for the ENTIRE run. No matter what, the agent
        // stops after this so it can never hang the tab forever. 0 = disabled.
        RUN_DEADLINE_MS: 180000,
        // When false (default), the agent is strictly forbidden from using ANY
        // external tools (MCP servers, CLI, shell, file system, etc.). It only
        // reasons about the page and returns a plan JSON that THIS script executes
        // locally in the browser. The agent never wanders off to do tool work.
        ALLOW_TOOLS: false,
        // When true (default), after a type/clear/select action the agent reads the
        // actual field value back and confirms the text really landed. If it didn't,
        // it retries with alternate injection strategies and tells the planner to
        // "retry a different way" instead of lying that the field was filled.
        VERIFY_FIELDS: true
    };

    // Safe GM / LocalStorage abstraction
    function getConfig() {
        let stored = null;
        try {
            if (typeof GM_getValue !== 'undefined') {
                stored = GM_getValue('auto_agent_config', null);
            } else if (typeof localStorage !== 'undefined') {
                const item = localStorage.getItem('auto_agent_config');
                if (item) stored = JSON.parse(item);
            }
        } catch (e) {}
        return Object.assign({}, DEFAULT_CONFIG, stored || {});
    }

    function setConfig(cfg) {
        try {
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue('auto_agent_config', cfg);
            } else if (typeof localStorage !== 'undefined') {
                localStorage.setItem('auto_agent_config', JSON.stringify(cfg));
            }
        } catch (e) {}
    }

    function execApiRequest(options) {
        addLog('NET', `→ ${options.method || 'POST'} ${options.url}`, { headers: options.headers, body: options.data ? String(options.data).slice(0, 800) : undefined }, true);
        const wrapped = Object.assign({}, options, {
            onload: (res) => {
                addLog('NET', `← ${options.method || 'POST'} ${options.url} → HTTP ${res.status}`, { status: res.status, body: typeof res.responseText === 'string' ? res.responseText.slice(0, 800) : undefined }, true);
                if (options.onload) options.onload(res);
            },
            onerror: (err) => {
                addLog('ERR', `Network error on ${options.method || 'POST'} ${options.url}: ${err && err.error ? err.error : (err || 'unknown')}`, err, true);
                if (options.onerror) options.onerror(err);
            }
        });
        if (typeof GM_xmlhttpRequest !== 'undefined') {
            GM_xmlhttpRequest(wrapped);
        } else if (typeof fetch !== 'undefined') {
            fetch(options.url, {
                method: options.method || 'POST',
                headers: options.headers || {},
                body: options.data
            })
            .then(async (res) => {
                const text = await res.text();
                if (wrapped.onload) wrapped.onload({ status: res.status, responseText: text });
            })
            .catch((err) => {
                if (wrapped.onerror) wrapped.onerror(err);
            });
        }
    }

    let STATE = {
        isRunning: false,
        isExpanded: false,
        panelOpen: false,
        showSettings: false,
        settingsTab: 'server',
        showConsole: true,
        verbose: false,
        logCount: 0,
        goal: '',
        stepCount: 0,
        history: [],
        debugLogs: [],
        lastResult: null,
        statusText: 'Ready for instructions.',
        agentMood: 'idle',
        activeElementId: null,
        verifyFeedback: '',
        runStartedAt: null
    };

    // Cap on retained in-memory logs so a long run can never OOM the tab.
    const LOG_CAP = 5000;

    // Kilo Server session state (one session reused across steps within a run).
    let kiloSessionId = null;
    let kiloSessionPromise = null;

    // =========================================================================
    // 1b. CROSS-PAGE STATE PERSISTENCE (survive full page navigations)
    // =========================================================================
    const RUN_STATE_KEY = 'auto_agent_run_state_v1';

    function persistState() {
        try {
            const snap = {
                isRunning: STATE.isRunning,
                isExpanded: STATE.isExpanded,
                panelOpen: STATE.panelOpen,
                showSettings: STATE.showSettings,
                showConsole: STATE.showConsole,
                goal: STATE.goal,
                stepCount: STATE.stepCount,
                history: STATE.history,
                lastResult: STATE.lastResult,
                statusText: STATE.statusText,
                agentMood: STATE.agentMood,
                activeElementId: STATE.activeElementId,
                kiloSessionId: kiloSessionId,
                verbose: !!STATE.verbose,
                MODEL: getConfig().MODEL,
                KILO_MODEL: getConfig().KILO_MODEL,
                PROVIDER: getConfig().PROVIDER
            };
            const str = JSON.stringify(snap);
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue(RUN_STATE_KEY, str);
            } else if (typeof localStorage !== 'undefined') {
                localStorage.setItem(RUN_STATE_KEY, str);
            }
        } catch (e) {}
    }

    function clearPersistedState() {
        try {
            if (typeof GM_deleteValue !== 'undefined') {
                GM_deleteValue(RUN_STATE_KEY);
            } else if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(RUN_STATE_KEY);
            }
        } catch (e) {}
    }

    // Returns true if a run was in-progress and should be resumed on this page.
    function loadPersistedState() {
        try {
            let str = null;
            if (typeof GM_getValue !== 'undefined') {
                str = GM_getValue(RUN_STATE_KEY, null);
            } else if (typeof localStorage !== 'undefined') {
                str = localStorage.getItem(RUN_STATE_KEY);
            }
            if (!str) return false;
            const snap = JSON.parse(str);
            if (!snap || typeof snap !== 'object') return false;

            STATE.isRunning = !!snap.isRunning;
            STATE.isExpanded = !!snap.isExpanded;
            STATE.panelOpen = !!snap.panelOpen;
            STATE.showSettings = !!snap.showSettings;
            STATE.showConsole = snap.showConsole !== false;
            STATE.goal = snap.goal || '';
            STATE.stepCount = snap.stepCount || 0;
            STATE.history = Array.isArray(snap.history) ? snap.history : [];
            STATE.lastResult = snap.lastResult || null;
            STATE.statusText = snap.statusText || 'Ready for instructions.';
            STATE.agentMood = snap.agentMood || 'idle';
            STATE.activeElementId = snap.activeElementId || null;
            STATE.verbose = !!snap.verbose;
            if (snap.kiloSessionId) kiloSessionId = snap.kiloSessionId;

            // Restore the saved model/provider selection so a resumed run keeps
            // the same model the user had chosen (saved state for models & settings).
            try {
                const cfg = getConfig();
                let changed = false;
                if (snap.MODEL && snap.MODEL !== cfg.MODEL) { cfg.MODEL = snap.MODEL; changed = true; }
                if (snap.KILO_MODEL && snap.KILO_MODEL !== cfg.KILO_MODEL) { cfg.KILO_MODEL = snap.KILO_MODEL; changed = true; }
                if (snap.PROVIDER && snap.PROVIDER !== cfg.PROVIDER) { cfg.PROVIDER = snap.PROVIDER; changed = true; }
                if (changed) setConfig(cfg);
            } catch (e) {}

            return STATE.isRunning === true;
        } catch (e) {
            return false;
        }
    }

    function getPreciseTimestamp() {
        const d = new Date();
        const pad = (n, z = 2) => String(n).padStart(z, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    }

    // JSON.stringify that tolerates circular refs, functions, and huge structures
    // so verbose logging of arbitrary objects never throws or hangs.
    function safeStringify(value, maxLen) {
        try {
            const seen = new WeakSet();
            let out = JSON.stringify(value, (k, v) => {
                if (typeof v === 'function') return '[fn]';
                if (typeof v === 'object' && v !== null) {
                    if (seen.has(v)) return '[circular]';
                    seen.add(v);
                }
                if (typeof v === 'undefined') return '[undefined]';
                return v;
            }, 2);
            if (out === undefined) out = String(value);
            if (maxLen && out.length > maxLen) out = out.slice(0, maxLen) + ' …[truncated]';
            return out;
        } catch (e) {
            try { return String(value); } catch (_) { return '[unstringifiable]'; }
        }
    }

    // Slim, storage-safe projection of a log entry (used for cross-page persistence
    // and clipboard/export). Raw objects/stacks are dropped to keep size bounded.
    function slimLogEntry(e) {
        return {
            time: e.time,
            level: e.level,
            message: e.message,
            details: typeof e.details === 'string' ? e.details : (e.details == null ? null : safeStringify(e.details, 1000)),
            verbose: !!e.verbose
        };
    }

    // Robust, verbose-aware logger. Never throws. Captures full structured details
    // (not truncated) in entry.raw, a human string in entry.details, and a stack
    // trace for error levels. Verbose entries are suppressed unless STATE.verbose.
    function addLog(level, message, details, verbose) {
        try {
            if (verbose && !STATE.verbose) return;
            const timestamp = getPreciseTimestamp();
            let stack = null;
            if (level === 'ERR' || level === 'ERROR') {
                try { stack = new Error().stack; } catch (e2) {}
            }
            const entry = {
                id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                time: timestamp,
                level: level,
                message: message,
                details: details ? (typeof details === 'object' ? safeStringify(details, 2000) : String(details)) : null,
                raw: details,
                verbose: !!verbose,
                stack: stack
            };
            if (typeof STATE.debugLogs !== 'undefined') {
                STATE.debugLogs.push(entry);
                if (STATE.debugLogs.length > LOG_CAP) STATE.debugLogs.shift();
                STATE.logCount = (STATE.logCount || 0) + 1;
            }
            try { renderConsole(); } catch (e3) {}
            try {
                if (level === 'ERR' || level === 'ERROR') {
                    console.error(`[${timestamp}] [Agent ${level}] ${message}`, details || '');
                } else {
                    console.log(`[${timestamp}] [Agent ${level}] ${message}`, details || '');
                }
            } catch (e4) {}
        } catch (e) {
            try { console.error('addLog internal failure:', e); } catch (_) {}
        }
    }

    // =========================================================================
    // 2. UNIVERSAL DOM & SHADOW DOM SCANNER
    // =========================================================================
    function scanInteractiveElements(maxElements = 65) {
        const interactiveSelectors = [
            'button', 'a[href]', 'input', 'textarea', 'select', 'summary',
            '[role="button"]', '[role="tab"]', '[role="textbox"]', '[role="searchbox"]',
            '[role="combobox"]', '[role="menuitem"]', '[role="option"]', '[role="checkbox"]',
            '[role="radio"]', '[role="switch"]', '[contenteditable="true"]', '[contenteditable=""]',
            '[tabindex]:not([tabindex="-1"])', 'faceplate-combobox', 'shreddit-tab',
            'shreddit-tab-list', 'faceplate-search-input', 'community-picker-combobox',
            'faceplate-dropdown-menu', '[data-testid]'
        ].join(',');

        const matched = [];
        const seen = new Set();
        const queue = [document.body || document.documentElement];
        let shadowDives = 0;
        const MAX_SHADOWS = 60;

        while (queue.length > 0 && matched.length < maxElements) {
            const root = queue.shift();
            if (!root) continue;

            try {
                const nodes = root.querySelectorAll(interactiveSelectors);
                for (let i = 0; i < nodes.length; i++) {
                    const el = nodes[i];
                    if (el.closest && el.closest('#auto-agent-host')) continue;
                    if (seen.has(el)) continue;
                    seen.add(el);

                    const isFile = el.tagName === 'INPUT' && el.type === 'file';
                    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
                    const isVisible = isFile || (rect && (rect.width > 0 || rect.height > 0 || (el.getClientRects && el.getClientRects().length > 0)));

                    if (isVisible) {
                        matched.push(el);
                        if (matched.length >= maxElements) break;
                    }
                }

                if (shadowDives < MAX_SHADOWS) {
                    const allHosts = root.querySelectorAll('*');
                    for (let i = 0; i < allHosts.length; i++) {
                        const host = allHosts[i];
                        if (host.shadowRoot && host.id !== 'auto-agent-host' && !seen.has(host.shadowRoot)) {
                            seen.add(host.shadowRoot);
                            shadowDives++;
                            queue.push(host.shadowRoot);
                            if (shadowDives >= MAX_SHADOWS) break;
                        }
                    }
                }
            } catch (e) {}
        }

        const vh = window.innerHeight;
        const vw = window.innerWidth;

        addLog('DOM', `Shadow DOM scan complete: ${matched.length} interactive node(s), ${shadowDives} shadow root(s) dived, ${maxElements} max.`, { matched: matched.length, shadowDives, maxElements }, true);

        return matched.map((el, index) => {
            el.setAttribute('data-agent-id', String(index));
            const rect = el.getBoundingClientRect();
            const inViewport = rect.top >= 0 && rect.top < vh && rect.left >= 0 && rect.left < vw;
            const posHint = inViewport ? 'in-view' : rect.top < 0 ? 'scroll-up' : 'scroll-down';

            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || undefined;
            const type = el.getAttribute('type') || undefined;
            const name = el.getAttribute('name') || undefined;
            const rawText = el.value || el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.title || el.innerText || el.textContent || '';
            const cleanText = rawText.replace(/\s+/g, ' ').trim().slice(0, 70);

            return {
                id: index,
                tag,
                role,
                type,
                name,
                text: cleanText,
                pos: posHint,
                elementRef: el,
                rect: {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                }
            };
        });
    }

    // =========================================================================
    // 3. VISUAL NUMBERED BADGE OVERLAY
    // =========================================================================
    let badgeLayer = null;

    function ensureBadgeLayer() {
        if (!badgeLayer) {
            badgeLayer = document.createElement('div');
            badgeLayer.id = 'auto-agent-badge-layer';
            badgeLayer.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:999998;overflow:hidden;';
            document.body.appendChild(badgeLayer);
        }
    }

    function renderBadges(elements, activeId = null) {
        const config = getConfig();
        if (!config.ENABLE_BADGES) {
            if (badgeLayer) badgeLayer.innerHTML = '';
            return;
        }

        ensureBadgeLayer();
        badgeLayer.innerHTML = '';

        elements.forEach(el => {
            if (!el.rect || el.pos !== 'in-view') return;
            const isActive = activeId === el.id;

            const badge = document.createElement('span');
            badge.innerText = el.id;
            badge.style.cssText = `
                position: fixed;
                top: ${Math.max(2, Math.min(window.innerHeight - 20, el.rect.top - 4))}px;
                left: ${Math.max(2, Math.min(window.innerWidth - 24, el.rect.left - 4))}px;
                background: ${isActive ? 'linear-gradient(135deg, #10b981, #06b6d4)' : 'linear-gradient(135deg, #0284c7, #7c3aed)'};
                color: #ffffff;
                font-family: monospace, sans-serif;
                font-size: 10px;
                font-weight: 800;
                padding: 1px 4px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                pointer-events: none;
                z-index: ${isActive ? '1000000' : '999999'};
                transform: ${isActive ? 'scale(1.25)' : 'scale(1)'};
                transition: transform 0.15s ease;
            `;
            badgeLayer.appendChild(badge);

            if (isActive) {
                const box = document.createElement('div');
                box.style.cssText = `
                    position: fixed;
                    top: ${Math.max(0, el.rect.top - 2)}px;
                    left: ${Math.max(0, el.rect.left - 2)}px;
                    width: ${el.rect.width + 4}px;
                    height: ${el.rect.height + 4}px;
                    border: 2px solid #10b981;
                    background: rgba(16, 185, 129, 0.15);
                    border-radius: 6px;
                    pointer-events: none;
                    z-index: 999997;
                `;
                badgeLayer.appendChild(box);
            }
        });
    }

    function clearBadges() {
        if (badgeLayer) {
            badgeLayer.innerHTML = '';
        }
    }

    // =========================================================================
    // 4. ACTION EXECUTOR WITH SYNTHETIC REACT/ANGULAR/VUE EVENT EMISSION
    // =========================================================================
    function injectNativeText(element, text) {
        if (!element) return;
        const tag = (element.tagName || '').toLowerCase();
        const inputType = (element.type || '').toLowerCase();

        if (tag === 'input' && ['file', 'checkbox', 'radio', 'image', 'button', 'submit', 'reset', 'color'].includes(inputType)) {
            console.warn('injectNativeText skipped non-textual input type: ' + inputType);
            return;
        }

        element.focus();
        try {
            if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
                element.innerText = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                const isTextArea = tag === 'textarea';
                const proto = isTextArea ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
                const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                if (desc && desc.set) {
                    desc.set.call(element, text);
                } else {
                    element.value = text;
                }
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (err) {
            console.warn('injectNativeText caught DOM exception safely:', err);
        }
    }

    // Read back whatever text currently lives in a field (input, textarea, or
    // contenteditable). Used to CONFIRM an action actually landed.
    function readFieldValue(el) {
        if (!el) return '';
        try {
            if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
                return (el.innerText || el.textContent || '');
            }
            if (typeof el.value === 'string') { /* guard */ }
            if (typeof el.value === 'string') return el.value;
            return (el.innerText || el.textContent || '');
        } catch (e) { return ''; }
    }

    // Confirm a field holds the expected text. For empty/expected we treat it as a
    // "clear" check (field should be empty). Otherwise require a meaningful chunk
    // of the expected text to actually appear in the live field.
    function verifyFieldValue(el, expected) {
        const actual = readFieldValue(el);
        if (!expected || !expected.trim()) {
            return { ok: (actual == null ? true : actual.trim().length === 0), actual: actual || '' };
        }
        const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const a = norm(actual);
        const e = norm(expected);
        if (!a) return { ok: false, actual: actual || '' };
        const frag1 = e.slice(0, 25);
        const frag2 = e.length > 40 ? e.slice(-25) : '';
        const ok = a.includes(frag1) && (frag2 ? a.includes(frag2) : true);
        return { ok, actual: actual || '' };
    }

    // Inject text into a field, then CONFIRM it landed. If verification fails we
    // retry with progressively different techniques (click-into, execCommand,
    // char-by-char) — i.e. "retry a different way" — and report the final result.
    async function injectTextWithVerify(el, text, config) {
        const value = text || '';
        if (!config.VERIFY_FIELDS) {
            injectNativeText(el, value);
            return { verified: null, actual: readFieldValue(el) };
        }

        const strategies = [
            // 1) native property setter + input/change events
            () => injectNativeText(el, value),
            // 2) focus, click into the field, then native setter
            async () => {
                el.focus();
                try { el.click(); } catch (e) {}
                await new Promise(r => setTimeout(r, 120));
                injectNativeText(el, value);
            },
            // 3) select-all + execCommand insertText (React/contenteditable safe-ish)
            async () => {
                el.focus();
                try { el.select && el.select(); } catch (e) {}
                try { document.execCommand('selectAll', false, null); } catch (e) {}
                try { document.execCommand('insertText', false, value); } catch (e) {}
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        ];

        let last = null;
        let attemptNo = 0;
        for (const s of strategies) {
            attemptNo++;
            try { await s(); } catch (e) {}
            await new Promise(r => setTimeout(r, 160));
            const v = verifyFieldValue(el, value);
            last = v;
            addLog('VERIFY', `Injection strategy #${attemptNo} for "${value.slice(0, 40)}": ${v.ok ? 'OK' : 'FAILED'} (field now: "${String(v.actual).slice(0, 40)}")`, v, true);
            if (v.ok) return { verified: true, actual: v.actual };
        }
        return { verified: false, actual: last ? last.actual : '' };
    }


    async function executeAction(actionItem, elements) {
        const { action, text, direction, durationMs, elementId, toElementId, deltaX, deltaY, url } = actionItem;
        const config = getConfig();
        const planTarget = elements.find(e => e.id === elementId) || elements[0];
        addLog('ACT', `Executing action "${action}"${elementId !== undefined && elementId !== null ? ' on #' + elementId : ''}${text ? ' text="' + String(text).slice(0, 60) + '"' : ''}`, { actionItem, targetTag: planTarget ? planTarget.tag : null, targetText: planTarget ? planTarget.text : null }, true);

        if (action === 'done') {
            return { finished: true, result: actionItem.answer || text || 'Task completed!' };
        }

        if (action === 'wait') {
            await new Promise(r => setTimeout(r, durationMs || 600));
            return { success: true };
        }

        if (action === 'navigate' || action === 'goto' || action === 'open_url') {
            const targetUrl = url || text;
            if (targetUrl) {
                // Persist the run so the destination page (full navigation) resumes the plan.
                persistState();
                if (targetUrl === 'back') window.history.back();
                else if (targetUrl === 'forward') window.history.forward();
                else if (targetUrl === 'reload') window.location.reload();
                else window.location.href = targetUrl.startsWith('http') ? targetUrl : 'https://' + targetUrl;
                await new Promise(r => setTimeout(r, 1000));
                return { success: true };
            }
        }

        if (action === 'scroll') {
            if (elementId !== undefined && elementId !== null) {
                const scrollTarget = elements.find(e => e.id === elementId);
                if (scrollTarget && scrollTarget.elementRef) {
                    scrollTarget.elementRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await new Promise(r => setTimeout(r, 350));
                    return { success: true };
                }
            }

            if (direction === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
            else if (direction === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            else if (direction === 'left') window.scrollBy({ left: -window.innerWidth * 0.5, behavior: 'smooth' });
            else if (direction === 'right') window.scrollBy({ left: window.innerWidth * 0.5, behavior: 'smooth' });
            else if (direction === 'up') window.scrollBy({ top: -window.innerHeight * 0.6, behavior: 'smooth' });
            else window.scrollBy({ top: window.innerHeight * 0.6, behavior: 'smooth' });

            await new Promise(r => setTimeout(r, 400));
            return { success: true };
        }

        const target = elements.find(e => e.id === elementId) || elements[0];
        if (!target || !target.elementRef) {
            throw new Error(`Target node #${elementId} not found in live DOM`);
        }

        const targetEl = target.elementRef;
        renderBadges(elements, target.id);
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 200));

        // Click / Press / Tap
        if (action === 'click' || action === 'press' || action === 'tap') {
            targetEl.focus();
            const rect = targetEl.getBoundingClientRect();
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height / 2;

            const baseOpts = { bubbles: true, cancelable: true, clientX, clientY };
            try {
                const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : (typeof window !== 'undefined' ? window : null);
                if (win) baseOpts.view = win;
            } catch (e) {}

            try {
                targetEl.dispatchEvent(new PointerEvent('pointerover', baseOpts));
                targetEl.dispatchEvent(new PointerEvent('pointerenter', baseOpts));
                targetEl.dispatchEvent(new PointerEvent('pointerdown', baseOpts));
            } catch (e) {
                try {
                    targetEl.dispatchEvent(new MouseEvent('mouseover', baseOpts));
                } catch (e2) {}
            }

            try {
                targetEl.dispatchEvent(new MouseEvent('mousedown', baseOpts));
                targetEl.dispatchEvent(new PointerEvent('pointerup', baseOpts));
                targetEl.dispatchEvent(new MouseEvent('mouseup', baseOpts));
            } catch (e) {
                try {
                    targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    targetEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                } catch (e2) {}
            }

            try {
                targetEl.click();
            } catch (e) {}

            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true };
        }

        // Touch gesture
        if (action === 'touch' || action === 'touch_tap') {
            targetEl.focus();
            const rect = targetEl.getBoundingClientRect();
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height / 2;

            try {
                const touchObj = new Touch({
                    identifier: Date.now(),
                    target: targetEl,
                    clientX,
                    clientY,
                    screenX: clientX,
                    screenY: clientY,
                    pageX: clientX + window.scrollX,
                    pageY: clientY + window.scrollY
                });

                targetEl.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touchObj], targetTouches: [touchObj], changedTouches: [touchObj] }));
                targetEl.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touchObj] }));
            } catch (e) {
                targetEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }));
                targetEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch' }));
            }
            targetEl.click();
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true };
        }

        // Double Click
        if (action === 'dblclick' || action === 'double_click') {
            targetEl.focus();
            const rect = targetEl.getBoundingClientRect();
            const opts = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, detail: 2 };
            targetEl.dispatchEvent(new MouseEvent('mousedown', opts));
            targetEl.dispatchEvent(new MouseEvent('mouseup', opts));
            targetEl.dispatchEvent(new MouseEvent('click', opts));
            targetEl.dispatchEvent(new MouseEvent('dblclick', opts));
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true };
        }

        // Right Click / Context Menu
        if (action === 'rightclick' || action === 'contextmenu') {
            targetEl.focus();
            const rect = targetEl.getBoundingClientRect();
            const opts = { bubbles: true, cancelable: true, button: 2, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
            targetEl.dispatchEvent(new MouseEvent('mousedown', opts));
            targetEl.dispatchEvent(new MouseEvent('mouseup', opts));
            targetEl.dispatchEvent(new MouseEvent('contextmenu', opts));
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true };
        }

        // Hover
        if (action === 'hover' || action === 'mouseover' || action === 'mousemove') {
            const rect = targetEl.getBoundingClientRect();
            const opts = { bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
            targetEl.dispatchEvent(new PointerEvent('pointerover', opts));
            targetEl.dispatchEvent(new PointerEvent('pointermove', opts));
            targetEl.dispatchEvent(new MouseEvent('mouseover', opts));
            targetEl.dispatchEvent(new MouseEvent('mousemove', opts));
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true };
        }

        // Drag & Drop
        if (action === 'drag' || action === 'drag_drop' || action === 'drag_and_drop') {
            targetEl.focus();
            const startRect = targetEl.getBoundingClientRect();
            const startX = startRect.left + startRect.width / 2;
            const startY = startRect.top + startRect.height / 2;

            let endX = startX + (deltaX || 150);
            let endY = startY + (deltaY || 0);

            if (toElementId !== undefined && toElementId !== null) {
                const destNode = elements.find(e => e.id === toElementId);
                if (destNode && destNode.elementRef) {
                    const destRect = destNode.elementRef.getBoundingClientRect();
                    endX = destRect.left + destRect.width / 2;
                    endY = destRect.top + destRect.height / 2;
                }
            }

            const dt = new DataTransfer();
            targetEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: startX, clientY: startY }));
            targetEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: startX, clientY: startY }));

            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            targetEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: midX, clientY: midY }));

            const dropTarget = document.elementFromPoint(endX, endY) || targetEl;
            dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: endX, clientY: endY }));
            dropTarget.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: endX, clientY: endY }));
            targetEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: endX, clientY: endY }));
            dropTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: endX, clientY: endY }));

            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true };
        }

        // Type / Input
        if (action === 'type' || action === 'input' || action === 'write') {
            targetEl.focus();
            targetEl.click();
            await new Promise(r => setTimeout(r, 100));
            const res = await injectTextWithVerify(targetEl, text || '', config);
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true, verified: res.verified, actual: res.actual, expected: text || '', verifyAction: 'type' };
        }

        // Clear input
        if (action === 'clear') {
            const res = await injectTextWithVerify(targetEl, '', config);
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true, verified: res.verified, actual: res.actual, expected: '', verifyAction: 'clear' };
        }

        // Select dropdown option
        if (action === 'select' || action === 'dropdown') {
            targetEl.focus();
            if (targetEl.tagName.toLowerCase() === 'select') {
                const selectEl = targetEl;
                const val = text || '';
                let found = false;
                for (let i = 0; i < selectEl.options.length; i++) {
                    const opt = selectEl.options[i];
                    if (opt.value === val || opt.text.toLowerCase().includes(val.toLowerCase())) {
                        selectEl.selectedIndex = i;
                        found = true;
                        break;
                    }
                }
                if (!found && selectEl.options.length > 0) {
                    selectEl.selectedIndex = Math.min(parseInt(val) || 0, selectEl.options.length - 1);
                }
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                selectEl.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                targetEl.click();
            }
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true };
        }

        // Check / Uncheck
        if (action === 'check' || action === 'uncheck') {
            targetEl.focus();
            if (targetEl.type === 'checkbox' || targetEl.type === 'radio') {
                const shouldCheck = action === 'check';
                if (targetEl.checked !== shouldCheck) {
                    targetEl.click();
                }
            } else {
                targetEl.click();
            }
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true };
        }

        // Press a keyboard key on the focused element (e.g. Enter, Escape, Tab, ArrowDown).
        // Synthetic key events do NOT trigger native default actions, so for Enter inside a
        // form we also call form.requestSubmit() so search boxes / forms actually submit.
        if (action === 'key' || action === 'press_key' || action === 'keyboard' || action === 'keypress') {
            targetEl.focus();
            const keyName = actionItem.key || actionItem.keyName || text || 'Enter';
            const keyMap = { Enter: 13, Return: 13, Escape: 27, Esc: 27, Tab: 9, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32, ' ': 32, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
            const keyCode = keyMap[keyName] != null ? keyMap[keyName] : (typeof keyName === 'string' && keyName.length === 1 ? keyName.toUpperCase().charCodeAt(0) : 0);
            const kopts = { key: keyName, code: keyName, keyCode, which: keyCode, bubbles: true, cancelable: true };
            try {
                targetEl.dispatchEvent(new KeyboardEvent('keydown', kopts));
                targetEl.dispatchEvent(new KeyboardEvent('keypress', kopts));
                targetEl.dispatchEvent(new KeyboardEvent('keyup', kopts));
            } catch (e) {
                try { targetEl.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true })); } catch (e2) {}
            }
            if ((keyName === 'Enter' || keyName === 'Return') && targetEl.form) {
                try {
                    if (typeof targetEl.form.requestSubmit === 'function') targetEl.form.requestSubmit();
                    else targetEl.form.submit();
                    persistState();
                    await new Promise(r => setTimeout(r, 800));
                    return { success: true, pressed: keyName, submitted: true };
                } catch (e) {}
            }
            await new Promise(r => setTimeout(r, config.STEP_DELAY_MS));
            return { success: true, pressed: keyName };
        }

        throw new Error(`Unrecognized action type: ${action}`);
    }

    // =========================================================================
    // 5. LLM REASONING & HEURISTIC ENGINE
    // =========================================================================
    function getEndpointAndHeaders(cfg) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (cfg.PROVIDER === 'kilo') {
            // Kilo Server OpenAI-compatible chat completions (port 4097 -> /v1).
            const base = (cfg.BASE_URL || 'https://devproject.vip/v1').replace(/\/+$/, '');
            const url = base.includes('/chat/completions') ? base : base + '/chat/completions';
            if (cfg.KILO_AUTH) headers['X-Kilo-Auth'] = cfg.KILO_AUTH;
            return { url, headers };
        }

        if (cfg.PROVIDER === 'devproject' || cfg.SERVER === 'local') {
            // OpenCode-compatible session REST API on port 4096.
            //  - Local OpenCode server:  http://127.0.0.1:4096  (paths: /session, /session/:id/message, /provider)
            //  - DevProject fork:        https://devproject.vip/ai
            const base = (cfg.KILO_AI_BASE || 'https://devproject.vip/ai').replace(/\/+$/, '');
            if (cfg.KILO_AUTH) headers['X-Kilo-Auth'] = cfg.KILO_AUTH;
            return { url: base, headers, base };
        }

        // OpenAI-compatible chat completions endpoint (Ollama / OpenAI / OpenRouter / Groq / custom).
        const base = (cfg.CUSTOM_ENDPOINT || cfg.BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
        const url = base.includes('/chat/completions') ? base : base + '/v1/chat/completions';

        if (cfg.API_KEY) {
            headers['Authorization'] = `Bearer ${cfg.API_KEY}`;
        }

        return { url, headers };
    }

    // =========================================================================
    // MODEL DISCOVERY (populate the model picker from the live Kilo server)
    // =========================================================================
    const modelListCache = {};

    function fetchModelIds(provider) {
        return new Promise((resolve) => {
            if (modelListCache[provider]) return resolve(modelListCache[provider]);
            let url;
            if (provider === 'kilo') {
                url = (getConfig().BASE_URL || 'https://devproject.vip/v1').replace(/\/+$/, '') + '/models';
            } else if (provider === 'devproject') {
                url = (getConfig().KILO_AI_BASE || 'https://devproject.vip/ai').replace(/\/+$/, '') + '/provider';
            } else {
                return resolve([]);
            }
            execApiRequest({
                method: 'GET',
                url: url,
                headers: { 'Content-Type': 'application/json' },
                timeout: 20000,
                onload: (res) => {
                    try {
                        if (res.status >= 200 && res.status < 300) {
                            const d = JSON.parse(res.responseText);
                            let ids = [];
                            if (provider === 'kilo') {
                                ids = (d.data || []).map(m => m.id).filter(Boolean);
                            } else {
                                for (const p of (d.all || [])) {
                                    for (const mid of Object.keys(p.models || {})) {
                                        // The session /init expects the aggregator id (p.id)
                                        // as a prefix, e.g. "hpc-ai/deepseek/deepseek-v4-flash".
                                        const full = (mid.indexOf(p.id + '/') === 0) ? mid : (p.id + '/' + mid);
                                        ids.push(full);
                                    }
                                }
                            }
                            modelListCache[provider] = ids;
                            resolve(ids);
                        } else {
                            resolve([]);
                        }
                    } catch (e) {
                        resolve([]);
                    }
                },
                onerror: () => resolve([]),
                ontimeout: () => resolve([])
            });
        });
    }

    // A model is treated as "free" if its id advertises a free tier. This lets us
    // surface free models in their own dedicated optgroup in the picker.
    function isFreeModel(id) {
        const s = (id || '').toLowerCase();
        if (!s) return false;
        return /(^|[-/_])free([-/_]|$)/.test(s) || s.includes('free');
    }

    // Resolve the human-facing provider name for a model id. The 4096 aggregator
    // "hpc-ai" re-exposes many upstream providers, so for hpc-ai ids we surface the
    // SECOND path segment (e.g. "deepseek") as the provider; for everything else we
    // use the first segment. This keeps the picker grouped by real provider.
    function providerOfModel(id) {
        const parts = (id || '').split('/');
        if (parts[0] === 'hpc-ai' && parts.length > 2) return parts[1];
        return parts[0] || 'Other';
    }

    // Populate a <select> with model ids for `provider`. Models are grouped into
    // <optgroup>s: a dedicated "🆓 Free Models" group at the top, then the rest
    // bucketed by real provider (see providerOfModel). All option values are also
    // tagged with a data attribute so a filter box can show/hide them live.
    async function populateModelSelect(selectEl, customEl, provider, currentValue) {
        if (!selectEl) return;
        const ids = await fetchModelIds(provider);
        selectEl.innerHTML = '';
        const CUSTOM = '__custom__';

        const freeIds = [];
        const byProvider = {};
        for (const id of ids) {
            if (isFreeModel(id)) {
                freeIds.push(id);
            } else {
                const prov = providerOfModel(id);
                (byProvider[prov] = byProvider[prov] || []).push(id);
            }
        }

        const addOption = (parent, id) => {
            const o = document.createElement('option');
            o.value = id;
            o.textContent = id;
            o.dataset.model = id.toLowerCase();
            parent.appendChild(o);
        };

        if (freeIds.length) {
            const og = document.createElement('optgroup');
            og.label = '🆓 Free Models';
            freeIds.sort().forEach(id => addOption(og, id));
            selectEl.appendChild(og);
        }

        Object.keys(byProvider).sort().forEach(prov => {
            const og = document.createElement('optgroup');
            og.label = prov;
            byProvider[prov].sort().forEach(id => addOption(og, id));
            selectEl.appendChild(og);
        });

        const co = document.createElement('option');
        co.value = CUSTOM;
        co.textContent = '✏️ Custom…';
        selectEl.appendChild(co);

        if (currentValue && ids.includes(currentValue)) {
            selectEl.value = currentValue;
            if (customEl) customEl.style.display = 'none';
        } else if (currentValue) {
            selectEl.value = CUSTOM;
            if (customEl) { customEl.style.display = ''; customEl.value = currentValue; }
        } else {
            selectEl.value = CUSTOM;
            if (customEl) customEl.style.display = '';
        }
    }

    // Wire a filter <input> to live-show/hide options in a model <select>.
    function wireModelFilter(filterEl, selectEl) {
        if (!filterEl || !selectEl) return;
        filterEl.addEventListener('input', () => {
            const q = filterEl.value.trim().toLowerCase();
            Array.from(selectEl.options).forEach(o => {
                if (o.value === '__custom__' || !o.dataset.model) { o.style.display = ''; return; }
                o.style.display = (!q || o.dataset.model.indexOf(q) !== -1) ? '' : 'none';
            });
        });
    }

    function readModelValue(selectEl, customEl) {
        if (!selectEl) return (customEl && customEl.value.trim()) || '';
        const v = selectEl.value;
        if (v === '__custom__') return (customEl && customEl.value.trim()) || '';
        return v;
    }

    // Fetch the full provider→models map from the 4096 server. This drives the
    // Provider + Model pickers. Model ids are normalized to "provider/model" form.
    // A separate "free" list aggregates every model whose id advertises a free tier,
    // so the picker can expose a dedicated 🆓 Free Models group across providers.
    const modelMapCache = { data: null };
    async function fetchProviderModelMap() {
        if (modelMapCache.data) return modelMapCache.data;
        const cfg = getConfig();
        const base = (cfg.KILO_AI_BASE || 'https://devproject.vip/ai').replace(/\/+$/, '');
        const data = await new Promise((resolve) => {
            execApiRequest({
                method: 'GET', url: base + '/provider',
                headers: { 'Content-Type': 'application/json' }, timeout: 20000,
                onload: (res) => { try { if (res.status >= 200 && res.status < 300) resolve(JSON.parse(res.responseText)); else resolve(null); } catch (e) { resolve(null); } },
                onerror: () => resolve(null), ontimeout: () => resolve(null)
            });
        });
        const providers = [], free = [], seenFree = new Set();
        if (data && Array.isArray(data.all)) {
            for (const p of data.all) {
                const models = [];
                for (const mid of Object.keys(p.models || {})) {
                    const full = (mid.indexOf(p.id + '/') === 0) ? mid : (p.id + '/' + mid);
                    models.push(full);
                    if (isFreeModel(full) && !seenFree.has(full)) { seenFree.add(full); free.push(full); }
                }
                if (models.length) providers.push({ id: p.id, name: p.name || p.id, models: models });
            }
        }
        const map = { providers, free };
        modelMapCache.data = map;
        return map;
    }

    function generateHeuristicPlan(goal, tree, history) {
        const g = (goal || '').toLowerCase();

        // Check if last step was a type in a search input
        const lastStep = history[history.length - 1];
        if (lastStep && lastStep.action === 'type') {
            const submitBtn = tree.find(e =>
                e.tag === 'button' && /search|submit|find|go|enter/i.test(e.text + ' ' + (e.name || ''))
            );
            if (submitBtn) {
                return {
                    thought: 'Submitting search/form after entering query',
                    action: 'click',
                    elementId: submitBtn.id
                };
            }
        }

        // Search task
        if (g.includes('search') || g.includes('find') || g.includes('look') || g.includes('google')) {
            let query = '';
            const queryMatch = goal.match(/(?:googles*search|searchs*googles*for|searchs*for|search|find|google|query|looks*up)s+(?:fors+)?["']?([^"']+)["']?/i);
            if (queryMatch && queryMatch[1]) {
                query = queryMatch[1].replace(/["']/g, '').trim();
            } else {
                query = goal.replace(/google|search|find|for|look|up|query/gi, '').trim() || goal;
            }

            // Direct navigation if user requested a Google search while not on google.com
            if (g.includes('google') && !window.location.hostname.includes('google.com')) {
                return {
                    thought: `Navigating directly to Google Search for "${query}"`,
                    action: 'navigate',
                    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`
                };
            }

            const isTextishInput = (e) => {
                if (!e) return false;
                const tag = (e.tag || '').toLowerCase();
                const type = (e.type || '').toLowerCase();
                if (tag === 'textarea') return true;
                if (tag === 'input') {
                    return !['file', 'checkbox', 'radio', 'hidden', 'image', 'button', 'submit', 'reset', 'color'].includes(type);
                }
                return e.role === 'searchbox' || e.role === 'textbox';
            };

            const searchInput = tree.find(e =>
                isTextishInput(e) &&
                /search|query|q|find/i.test((e.name || '') + ' ' + (e.text || '') + ' ' + (e.type || ''))
            ) || tree.find(e => isTextishInput(e));

            if (searchInput && (!lastStep || lastStep.elementId !== searchInput.id)) {
                return {
                    thought: `Found search input #${searchInput.id}, entering "${query}"`,
                    action: 'type',
                    elementId: searchInput.id,
                    text: query
                };
            }
        }

        // Click goal
        if (g.includes('click') || g.includes('open') || g.includes('select') || g.includes('press')) {
            const targetWords = g.replace(/click|open|select|press|button|the|on|link/g, '').trim().split(/\s+/).filter(Boolean);
            let bestTarget = null;
            let highestScore = 0;

            for (const el of tree) {
                const combined = ((el.text || '') + ' ' + (el.name || '') + ' ' + (el.role || '')).toLowerCase();
                let score = 0;
                for (const word of targetWords) {
                    if (word && combined.includes(word)) score += 2;
                }
                if (score > highestScore) {
                    highestScore = score;
                    bestTarget = el;
                }
            }

            if (bestTarget && highestScore > 0) {
                return {
                    thought: `Identified target node #${bestTarget.id} matching "${g}"`,
                    action: 'click',
                    elementId: bestTarget.id
                };
            }
        }

        // Default done if steps taken, otherwise click most relevant first button
        if (history.length >= 2) {
            return {
                thought: 'Completed requested autonomous browser actions',
                action: 'done',
                answer: `Task completed successfully for goal: "${goal}"`
            };
        }

        const firstActionable = tree.find(e => e.tag === 'button' || e.tag === 'a' || e.tag === 'input') || tree[0];
        if (firstActionable) {
            return {
                thought: `Interacting with primary element #${firstActionable.id}`,
                action: firstActionable.tag === 'input' ? 'type' : 'click',
                elementId: firstActionable.id,
                text: 'Autonomous test input'
            };
        }

        return {
            thought: 'No further actionable elements detected on page',
            action: 'done',
            answer: 'Finished exploring page.'
        };
    }

    const VALID_ACTIONS = ['click', 'touch', 'drag', 'type', 'navigate', 'scroll', 'wait', 'key', 'tui_sync', 'done', 'press', 'tap', 'dblclick', 'rightclick', 'hover', 'clear', 'select', 'check', 'uncheck'];

    // Map common LLM action phrasings to a valid action so a slightly-off model
    // response still parses into an executable plan instead of failing the run.
    const ACTION_SYNONYMS = {
        submit: 'click', enter: 'type', send: 'type', write: 'type',
        open: 'navigate', goto: 'navigate', go: 'navigate', visit: 'navigate',
        tap: 'touch', doubleclick: 'dblclick', 'double-click': 'dblclick',
        'right-click': 'rightclick', mouseover: 'hover', mouseover_hover: 'hover',
        fill: 'type', typein: 'type', input: 'type', keypress: 'press',
        choose: 'select', tick: 'check', untick: 'uncheck', swipe: 'scroll',
        stop: 'done', finish: 'done', complete: 'done', end: 'done'
    };

    function normalizePlanAction(action) {
        if (action == null) return null;
        const a = String(action).trim().toLowerCase();
        if (!a) return null;
        if (a === 'tui_sync') return 'wait';
        if (VALID_ACTIONS.includes(a)) return a;
        if (ACTION_SYNONYMS[a]) return ACTION_SYNONYMS[a];
        // Last-ditch: if the value contains a known valid action word, use it.
        for (const v of VALID_ACTIONS) if (a.indexOf(v) !== -1) return v;
        return null;
    }

    // Try to JSON.parse, tolerating trailing commas which some models emit.
    function tryParse(jsonStr) {
        try { return JSON.parse(jsonStr); } catch (e) { /* fall through */ }
        try { return JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1')); } catch (e) { return undefined; }
    }

    // Extract every balanced {...} (or [...] ) object from a string by scanning.
    function extractBalancedObjects(text) {
        const out = [];
        let depth = 0, start = -1, inStr = false, esc = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (inStr) {
                if (esc) esc = false;
                else if (c === '\\') esc = true;
                else if (c === '"') inStr = false;
                continue;
            }
            if (c === '"') { inStr = true; continue; }
            if (c === '{' || c === '[') {
                if (depth === 0) start = i;
                depth++;
            } else if (c === '}' || c === ']') {
                depth--;
                if (depth === 0 && start !== -1) {
                    out.push(text.slice(start, i + 1));
                    start = -1;
                }
            }
        }
        return out;
    }

    // Parse <tool_call> XML emitted by TOOL-CALLING models (e.g. poolside/laguna),
    // which do NOT return JSON. Format observed in the wild:
    //   <tool_call>scroll<arg_key>direction</arg_key><arg_value>down</arg_value><arg_key>elementId</arg_key><arg_value>6</arg_value></tool_call>
    //   <tool_call>type<arg_key>elementId</arg_key><arg_value>5</arg_value><arg_key>text</arg_key><arg_value>hello</arg_value></tool_call>
    // The action name is the leading text; each arg_key/arg_value pair becomes a
    // field on the action object. Multiple <tool_call> blocks = an action sequence.
    function extractToolCalls(text) {
        const callRe = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
        const out = [];
        let m;
        while ((m = callRe.exec(text)) !== null) {
            const inner = m[1];
            const firstKey = inner.indexOf('<arg_key>');
            const namePart = (firstKey === -1 ? inner : inner.slice(0, firstKey)).trim();
            // Action name may be "scroll", "click_element", "type_text", etc.
            const action = namePart.replace(/[^\w]/g, '_').split('_')[0] || namePart;
            const argRe = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/gi;
            const args = {};
            let a;
            while ((a = argRe.exec(inner)) !== null) {
                const k = a[1].trim();
                let v = a[2].trim();
                if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
                args[k] = v;
            }
            const obj = {};
            // Map common arg names onto our executor schema.
            for (const k of ['text', 'url', 'target', 'key', 'direction', 'durationMs']) {
                if (args[k] !== undefined) obj[k] = args[k];
            }
            const elemRaw = args.elementId != null ? args.elementId : args.element_id;
            if (elemRaw !== undefined && elemRaw !== null && elemRaw !== '') obj.elementId = Number(elemRaw);
            if (args.toElementId !== undefined) obj.toElementId = Number(args.toElementId);
            // A tool that supplies a "key" arg is a keyboard press -> 'key' action
            // (e.g. press_key/key_press with key="Enter"). Otherwise normalize the
            // tool name to one of our valid actions.
            if (args.key !== undefined) {
                obj.action = 'key';
            } else {
                const norm = normalizePlanAction(action);
                obj.action = norm || action;
            }
            out.push(obj);
        }
        return out;
    }

    // Pull the action value regardless of common key casings the model may emit.
    function getRawAction(obj) {
        if (!obj || typeof obj !== 'object') return undefined;
        return obj.action !== undefined ? obj.action
            : obj.ACTION !== undefined ? obj.ACTION
            : obj.Action !== undefined ? obj.Action
            : obj.action_type !== undefined ? obj.action_type
            : undefined;
    }

    function extractPlanFromText(rawContent) {
        if (!rawContent) return null;
        // Strip markdown code fences (```json / ``` / ~~~) and surrounding whitespace.
        let text = rawContent.replace(/```(?:json)?|~~~/gi, '').trim();
        if (!text) return null;

        // 1) Whole-string parse (with trailing-comma tolerance).
        let plan = tryParse(text);
        if (plan && typeof plan === 'object') {
            // A JSON array of actions = an action SEQUENCE (e.g. focus field then type).
            // Return it as-is so the validator can run each item in order.
            if (Array.isArray(plan)) return plan;
            const norm = normalizePlanAction(getRawAction(plan));
            if (norm) { plan.action = norm; return plan; }
            // An answer with no explicit action is treated as "done".
            if (plan.answer && String(plan.answer).trim()) { plan.action = 'done'; return plan; }
        }

        // 2) Recover balanced JSON object(s)/array(s) from free-form prose.
        // A planner may emit an ACTION SEQUENCE (e.g. press a field, then type into
        // it) as a JSON array, or as several separate JSON objects on their own
        // lines. We collect EVERY valid action across all candidates and return them
        // as a sequence, so "press textbox" + "type text" are executed as two
        // ordered actions instead of being collapsed into a single "best" one.
        const candidates = extractBalancedObjects(text);
        const allActions = [];
        for (const cand of candidates) {
            const obj = tryParse(cand);
            if (!obj || typeof obj !== 'object') continue;
            const arr = Array.isArray(obj) ? obj : [obj];
            for (const item of arr) {
                if (!item || typeof item !== 'object') continue;
                let norm = normalizePlanAction(getRawAction(item));
                if (!norm && item.answer && String(item.answer).trim()) norm = 'done';
                if (!norm) continue;
                item.action = norm;
                // Reconcile executor schema field names.
                if (!item.text && item.url != null) item.text = item.url;
                if (item.toElementId == null && item.target != null && typeof item.target === 'number') item.toElementId = item.target;
                allActions.push(item);
            }
        }
        if (allActions.length >= 1) return allActions.length === 1 ? allActions[0] : allActions;

        // 3) Recover <tool_call> XML actions (tool-calling models like poolside/laguna
        // emit these instead of JSON). Each <tool_call> becomes one action; several in
        // a row form an ordered sequence. This is what lets those faster models work.
        const toolActions = extractToolCalls(text);
        if (toolActions.length) {
            const valid = [];
            for (const t of toolActions) {
                const norm = normalizePlanAction(t.action);
                if (!norm) continue;
                t.action = norm;
                if (!t.text && t.url != null) t.text = t.url;
                if (t.toElementId == null && t.target != null && typeof t.target === 'number') t.toElementId = t.target;
                valid.push(t);
            }
            if (valid.length) return valid.length === 1 ? valid[0] : valid;
        }
        return null;
    }

    // Boundary used by every planner path: take the RAW LLM output, clean it
    // (markdown wrappers, trailing commas, stream artifacts, prose) and validate
    // it into a usable plan BEFORE handing it to the action executor (the
    // "frontend" of this agent). Throws a descriptive error instead of returning
    // garbage, so a bad response fails loudly rather than silently mis-executing.
    // Validate + field-reconcile a SINGLE plan action object. Returns the normalized
    // plan, or null if it is not a usable action.
    function validateSinglePlan(rawObj) {
        if (!rawObj || typeof rawObj !== 'object') return null;
        // Reconcile apex-browser agent schema field names with the in-page executor.
        if (!rawObj.text && rawObj.url != null) rawObj.text = rawObj.url;
        if (rawObj.toElementId == null && rawObj.target != null && typeof rawObj.target === 'number') rawObj.toElementId = rawObj.target;
        const norm = normalizePlanAction(getRawAction(rawObj));
        if (!norm) return null;
        rawObj.action = norm;
        if (!VALID_ACTIONS.includes(rawObj.action)) return null;
        // Element-targeting actions must reference a real element id.
        const needsElement = ['click', 'touch', 'dblclick', 'rightclick', 'hover', 'type', 'clear', 'select', 'check', 'uncheck', 'drag'];
        if (needsElement.includes(rawObj.action) && (rawObj.elementId === undefined || rawObj.elementId === null)) return null;
        // Actions that need a target value must include it.
        if ((rawObj.action === 'type' || rawObj.action === 'select') && (rawObj.text === undefined || rawObj.text === null)) return null;
        if (rawObj.action === 'navigate' && (!rawObj.text || !/^https?:\/\//i.test(rawObj.text))) return null;
        return rawObj;
    }

    // Boundary used by every planner path: take the RAW LLM output, clean it
    // (markdown wrappers, trailing commas, stream artifacts, prose) and validate
    // it into a usable plan BEFORE handing it to the action executor (the
    // "frontend" of this agent). Returns an ARRAY of validated actions (a single
    // action is wrapped in a 1-item array) so a planner can emit an action SEQUENCE
    // (e.g. focus field -> type -> press Enter) in one round-trip. Throws on junk.
    function cleanAndValidatePlan(rawContent) {
        const plan = extractPlanFromText(rawContent);
        if (!plan || typeof plan !== 'object') {
            throw new Error('LLM response was not valid plan JSON after cleaning (markdown/prose stripped).');
        }
        if (Array.isArray(plan)) {
            const actions = [];
            for (const item of plan) {
                const v = validateSinglePlan(item);
                if (v) actions.push(v);
            }
            if (!actions.length) throw new Error('LLM response parsed as an action array but none of the items were valid.');
            return actions;
        }
        const single = validateSinglePlan(plan);
        if (!single) throw new Error('LLM response was not valid plan JSON after cleaning (markdown/prose stripped).');
        return [single];
    }

    // Concatenate the text from a Kilo session message's `parts` array. Parts may be
    // nested (part.parts) and only some carry `text` (e.g. type "text" / "reasoning").
    // The apex-browser agent returns its reasoning prose followed by the plan JSON in
    // a text part; we collect all of it and let extractPlanFromText pull out the JSON.
    function collectPartText(parts) {
        let out = '';
        if (!Array.isArray(parts)) return out;
        for (const p of parts) {
            if (!p) continue;
            if (typeof p.text === 'string' && p.text) out += p.text;
            if (Array.isArray(p.parts) && p.parts.length) out += collectPartText(p.parts);
        }
        return out;
    }

    // =========================================================================
    // 5b. KILO SERVER PLANNER (Kilo Code CLI REST gateway — from Kilocode-Android2)
    // =========================================================================
    function kiloApiRequest(method, path, body, cfg, timeoutMs) {
        const { url, headers } = getEndpointAndHeaders(cfg);
        const endpoint = url.replace(/\/+$/, '') + path;
        const startT = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        addLog('PLAN', `Kilo API ${method} ${endpoint}`, { timeoutMs: timeoutMs || 15000, bodyBytes: body ? JSON.stringify(body).length : 0 }, true);
        return new Promise((resolve, reject) => {
            execApiRequest({
                method: method,
                url: endpoint,
                headers: headers,
                data: body ? JSON.stringify(body) : undefined,
                timeout: (timeoutMs || 15000),
                onload: (res) => {
                    const latency = (typeof performance !== 'undefined') ? Math.round(performance.now() - startT) : 0;
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            const parsed = JSON.parse(res.responseText);
                            addLog('PLAN', `Kilo API ${method} ${endpoint} OK (${latency}ms)`, { latencyMs: latency }, true);
                            resolve(parsed);
                        } catch (e) {
                            addLog('WARN', `Kilo API ${method} ${endpoint} returned non-JSON ${latency}ms but HTTP ${res.status}`, { raw: res.responseText.slice(0, 500) }, true);
                            resolve(null);
                        }
                    } else {
                        addLog('ERR', `Kilo API ${method} ${endpoint} failed HTTP ${res.status} (${latency}ms)`, { status: res.status, body: res.responseText ? res.responseText.slice(0, 800) : undefined });
                        reject(new Error(`Kilo HTTP ${res.status}: ${res.responseText}`));
                    }
                },
                onerror: (err) => reject(new Error('Kilo network error: ' + err)),
                ontimeout: () => reject(new Error('Kilo request timed out'))
            });
        });
    }

    // (kiloStreamSession removed: the apex-browser planner now reads the assistant
    // reply synchronously from POST /session/:id/message `parts` — no SSE scraping.)

    async function ensureKiloSession(cfg) {
        if (kiloSessionId) return kiloSessionId;
        if (kiloSessionPromise) return kiloSessionPromise;
        kiloSessionPromise = (async () => {
            const created = await kiloApiRequest('POST', '/session', { directory: cfg.KILO_DIRECTORY || '/' }, cfg);
            const id = created && (created.id || (created.session && created.session.id));
            if (!id) throw new Error('Kilo server did not return a session id');
            kiloSessionId = id;
            addLog('PLAN', `Kilo session created: ${id}`);
            return id;
        })();
        try {
            return await kiloSessionPromise;
        } finally {
            kiloSessionPromise = null;
        }
    }

    // Create a BRAND-NEW session for a single plan step, and dispose the previous
    // step's session so we never accumulate cross-step context (the old behaviour
    // re-sent & grew the whole page-state every turn, which is what made the
    // planner stall on "Thinking"). Sessions are cheap; a fresh one keeps each
    // request small and fast.
    async function createKiloSession(cfg) {
        if (kiloSessionId) {
            // Fire-and-forget the previous session disposal: awaiting it blocks the
            // next step by ~2.4s. The server GCs orphaned sessions on its own.
            const prev = kiloSessionId;
            kiloSessionId = null;
            kiloApiRequest('DELETE', '/session/' + encodeURIComponent(prev), null, cfg, 5000).catch(() => {});
        }
        const created = await kiloApiRequest('POST', '/session', { directory: cfg.KILO_DIRECTORY || '/' }, cfg, 15000);
        const id = created && (created.id || (created.session && created.session.id));
        if (!id) throw new Error('server did not return a session id');
        kiloSessionId = id;
        addLog('PLAN', `Planner session created: ${id} (fresh per step)`);
        return id;
    }

    // Build the agent's system prompt. The apex-browser agent is used for EVERYTHING:
    // a CRITICAL TOOL LOCK is always injected instructing the model to only reason
    // in-page and return a plan JSON that THIS browser script executes locally. It
    // must never call MCP/CLI/tools, regardless of provider. Tool use is permanently
    // disabled so the planner stays a pure, in-page apex-browser agent.
    // Canonical apex-browser agent prompt (from GET /agent on the Kilo server).
    // Used as the planner system prompt so the model runs the REAL apex-browser
    // planner (it is trained to emit raw actionable JSON) instead of a custom one.
    const AGENT_PROMPT_APEX_BROWSER = `You are an autonomous web automation action planner operating inside a browser.

### CRITICAL RULES & CONSTRAINTS:
1. **NO MCP SERVERS OR CODE EXECUTION**: You have no MCP servers, shell tools, or file system access. Do not attempt tool calls or search for external MCP tools.
2. **OUTPUT FORMAT**: Respond with a single valid JSON object OR a JSON ARRAY of 2-4 action objects. No Markdown code fences (no \`\`\`json), no conversation, no markdown text before or after.
3. **ACTION SCHEMA**:
   Every response must adhere strictly to this schema:
   {
     "thought": "1-sentence reasoning about the current DOM state and specific next action",
      "action": "click" | "touch" | "drag" | "type" | "navigate" | "scroll" | "wait" | "key" | "tui_sync" | "done",
      "elementId": 0,
      "target": "Destination for drag/touch: target element id, or {x,y} coordinates",
      "text": "Exact text to type or prompt to sync",
     "key": "Enter" | "Tab" | "Escape",
     "direction": "up" | "down",
     "durationMs": 1200,
     "url": "https://...",
     "answer": "Final result summary when finished"
   }

4. **ACTION POLICIES**:
   - **Community / Forum Posting (e.g., Reddit)**:
     - If community is not selected: click the community picker dropdown, type the subreddit name, and select it.
     - For video/media posts: click the "Images & Video" tab and click the upload dropzone/button.
     - If the user instructed not to submit until they upload a file, do NOT click Submit/Post. Emit "action": "done" with your final explanation in "answer".
    - **Interactive Elements**: Always target the most accurate elementId from the provided interactive elements list.
    - **Touch & Drag**:
      - touch: tap a point on a touch interface. Target it the same way as click via elementId (use target for an explicit {x,y} coordinate).
          - drag: press on elementId (the source), move to target (a destination elementId or {x,y} coordinates), then release. If elementId is absent, target is treated as the destination from the current pointer position.
       - **ACTION SEQUENCES (BATCHING)**: When one logical operation needs multiple local UI steps on the SAME page, you MUST return them as a JSON ARRAY of action objects executed in order — NOT as separate replies. Examples: click a text field then type into it → [{"action":"click","elementId":N},{"action":"type","elementId":N,"text":"..."}]; or click + type + press Enter; or select a community then click the upload button. Combine "press a field" + "type text" into ONE array. Only the LAST action may be "done", and never put "navigate" before other actions (the page changes).`;

    function buildAgentSystemPrompt() {
        // The apex-browser agent's canonical prompt is the planner. We append a
        // short "executor compatibility" note so its JSON is consumed correctly by
        // the in-page action runner (field aliases + the no-tools rule + retries).
        const additions = `

### EXECUTOR COMPATIBILITY (how this JSON is consumed):
- The action is executed LOCALLY in THIS browser page by the agent script. You must NOT use any tools, MCP, shell, or external services — return ONLY the plan JSON.
- For "navigate", put the URL in "url" (preferred) or "text"; both are accepted.
- For "drag", put the destination in "target" (preferred) or "toElementId"; both are accepted.
- For "key", set "key" to the key name (e.g. "Enter"). "tui_sync" is treated as a brief "wait".
- If the GOAL is a Google search (e.g. "search <query>") and the current page is NOT google.com, use action "navigate" with url "https://www.google.com/search?q=<query>".
- Do NOT fill unrelated forms (post/contact) when the goal is a search or different topic.
- The request may include "lastActionVerification": your previous action did NOT land (e.g. field empty after type). Do NOT report done; retry a DIFFERENT way (click the field first, pick a different elementId, or type character-by-character) until the field visibly contains the text.
- ACTION SEQUENCES (BATCHING): When fulfilling the goal requires multiple local UI steps on the same page, you MUST return them as a SINGLE JSON ARRAY of 2-4 action objects executed in order — e.g. [{"action":"click","elementId":N},{"action":"type","elementId":N,"text":"..."}] or [{"action":"click","elementId":N},{"action":"type","elementId":N,"text":"..."},{"action":"key","key":"Enter"}]. Combine "press a textbox" + "type text" into ONE array instead of separate replies. Do NOT place a "navigate" or "done" action before other actions, because the page changes afterward.
- Return ONLY the JSON: either a single object or an array of objects. No explanation, no markdown, no code fences.`;
        return AGENT_PROMPT_APEX_BROWSER + additions;
    }

    async function requestKiloPlan(goal, tree, history) {
        const config = getConfig();

        const g = (goal || '').trim().toLowerCase();
        // Direct Google Search navigation intent on non-Google pages.
        if ((g.startsWith('google ') || g.includes('google search') || g.includes('search google')) && !window.location.hostname.includes('google.com')) {
            let q = goal.replace(/^\s*(?:google\s+)?(?:search\s+(?:google\s+)?(?:for\s+)?|search\s+for\s+|search\s+|for\s+)?/i, '').trim();
            if (q) {
                addLog('PLAN', `Direct Google Search navigation triggered for "${q}"`);
                return {
                    thought: `Navigating directly to Google Search for "${q}"`,
                    action: 'navigate',
                    url: `https://www.google.com/search?q=${encodeURIComponent(q)}`
                };
            }
        }

        // ---- Create a FRESH, short-lived session for THIS step only. ----
        // Reusing one long-lived session across all steps re-sent & accumulated the
        // entire page-state + system prompt every turn, so input context grew until
        // the planner got slower and slower and looked "stuck on Thinking". A fresh
        // session keeps every request small & fast. (createKiloSession also disposes
        // the previous step's session to avoid leaking them.)
        let sessionId;
        try {
            // Fresh session per step (default): keeps each request's input small, but
            // costs an extra POST /session round-trip every step. When SESSION_PER_STEP
            // is false we reuse ONE session for the whole run to skip that round-trip
            // (faster per step; only a concern on very long runs where context grows).
            sessionId = config.SESSION_PER_STEP
                ? await createKiloSession(config)
                : await ensureKiloSession(config);
        } catch (e) {
            addLog('ERR', `Planner session creation failed: ${e.message}. Is the OpenCode server running at ${config.KILO_AI_BASE}?`);
            throw e;
        }

        const isLocal = (config.SERVER === 'local');
        const km = (config.KILO_MODEL || '').trim();
        // Local OpenCode expects a "provider/model" string (or omitted => server default).
        const modelStr = (km && km !== 'kilo-auto/free' && km.includes('/')) ? km : '';

        const promptSystem = buildAgentSystemPrompt();
        const txtLimit = (typeof config.ELEMENT_TEXT_LIMIT === 'number' && config.ELEMENT_TEXT_LIMIT > 0) ? config.ELEMENT_TEXT_LIMIT : 120;

        const userMessage = {
            goal,
            pageUrl: window.location.href,
            pageTitle: document.title,
            history: history.slice(-5),
            // Truncate verbose text/name so the input payload (and thus prefill time)
            // stays small — element IDs are preserved so the planner can still target them.
            // 'pos' is dropped: the executor re-scans the live DOM, so the planner doesn't
            // need viewport hints, and dropping it cuts tokens on every element.
            elements: tree.map(e => ({
                id: e.id,
                tag: e.tag,
                role: e.role,
                name: e.name ? String(e.name).slice(0, txtLimit) : e.name,
                text: e.text ? String(e.text).slice(0, txtLimit) : e.text
            }))
        };

        // Feed back a prior-action verification failure so the planner RETRIES A
        // DIFFERENT WAY instead of claiming the field was filled when it wasn't.
        let verifyNote = '';
        try { if (STATE.verifyFeedback) verifyNote = STATE.verifyFeedback; } catch (e) {}
        if (verifyNote) {
            userMessage.lastActionVerification = verifyNote;
            STATE.verifyFeedback = '';
        }

        const makeMsgId = () => 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        // Fail fast: keep retries low and the per-request timeout tight so a slow/queued
        // model surfaces a clear error instead of the tab appearing frozen on "Thinking".
        const MAX_RETRIES = (typeof config.LLM_RETRIES === 'number' && config.LLM_RETRIES >= 0) ? config.LLM_RETRIES : 1;
        const reqTimeout = (typeof config.PLAN_TIMEOUT_MS === 'number' && config.PLAN_TIMEOUT_MS > 0) ? config.PLAN_TIMEOUT_MS : 30000;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                // Build the turn body. For a LOCAL OpenCode server we send a strict
                // OpenCode-shaped request: model as "provider/model" string, the system
                // prompt in `system`, and `tools: []` to lock the agent to pure in-page
                // reasoning (it must never spawn coding/MCP tools). For the DevProject
                // OpenCode server we keep the apex-browser agent + object model form.
                let body;
                if (isLocal) {
                    // OpenCode (local `opencode serve`) expects `model` as an OBJECT
                    // { providerID, modelID } — a "provider/model" string is rejected.
                    // It does NOT accept `tools: []` (400), so we omit it and rely on the
                    // system prompt's TOOL LOCK. The server auto-runs the apex-browser
                    // planner for the kilo free model.
                    let pID = 'kilo', mID = 'kilo-auto/free';
                    if (modelStr && modelStr.includes('/')) {
                        const mp = modelStr.split('/');
                        pID = mp[0];
                        mID = mp.slice(1).join('/');
                    }
                    body = {
                        messageID: makeMsgId(),
                        reasoningEffort: config.REASONING_EFFORT || 'low',
                        model: { providerID: pID, modelID: mID },
                        system: promptSystem,
                        parts: [{ type: 'text', text: JSON.stringify(userMessage) }]
                    };
                } else {
                    // DevProject OpenCode server (port 4096). The 'kilo' provider is
                    // CONNECTED here; the default planner model is 'kilo-auto/free'
                    // (free tier, no credits required). IMPORTANT: kilo model IDs
                    // themselves contain a slash (e.g. "kilo-auto/balanced"), so we must
                    // NOT naively split them into provider/model — that would send
                    // providerID="kilo-auto", modelID="balanced" and the server 500s.
                    let providerID = 'kilo', modelID = 'kilo-auto/free';
                    if (km && km !== 'kilo-auto/free' && km !== 'kilo-auto/balanced') {
                        // Only override for an explicit other-provider model in
                        // "provider/model" form (e.g. "hpc-ai/deepseek/deepseek-v4-flash").
                        // A bare kilo model id stays under the kilo provider.
                        if (km.startsWith('hpc-ai/')) {
                            const mp = km.split('/'); providerID = mp[0]; modelID = mp.slice(1).join('/');
                        } else if (km.includes('/') && !km.startsWith('kilo-auto/')) {
                            const mp = km.split('/'); providerID = mp[0]; modelID = mp.slice(1).join('/');
                        } else {
                            modelID = km;
                        }
                    }
                    body = {
                        messageID: makeMsgId(),
                        agent: 'apex-browser',
                        reasoningEffort: config.REASONING_EFFORT || 'low',
                        model: { providerID: providerID, modelID: modelID },
                        parts: [{ type: 'text', text: 'You are the apex-browser planner. Respond with a single JSON plan object OR a JSON ARRAY of 2-4 action objects (no markdown, no code fences, no prose) using this schema: {thought, action, elementId, text, url, target, key, direction, durationMs, answer}. BATCHING RULE: when the goal requires multiple local UI steps on the same page, you MUST return them as ONE JSON ARRAY of action objects executed in order — e.g. [{"action":"click","elementId":N},{"action":"type","elementId":N,"text":"..."}] or [{"action":"click","elementId":N},{"action":"type","elementId":N,"text":"..."},{"action":"key","key":"Enter"}]. Combine "press a field" + "type text" into a single array instead of separate replies. Do NOT put a "navigate" or "done" action before other actions.\n\nUSER REQUEST:\n' + JSON.stringify(userMessage) }]
                    };
                }

                // Run a turn directly via the synchronous /session/{id}/message endpoint.
                // The assistant reply (reasoning prose + the final plan JSON) is returned
                // inline in `parts` — no SSE scraping required.
                const resp = await kiloApiRequest('POST', '/session/' + encodeURIComponent(sessionId) + '/message', body, config, reqTimeout);

                const raw = collectPartText(resp && resp.parts);
                addLog('PLAN', `Planner raw response (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${raw.length} chars`, { snippet: raw.slice(0, 1200) }, true);
                if (!raw || !raw.trim()) throw { type: 'empty' };

                const plan = cleanAndValidatePlan(raw);
                if (!plan) throw { type: 'parse' };
                return plan;
            } catch (e) {
                // cleanAndValidatePlan throws a plain Error on invalid plans — treat as
                // retryable so the model gets a re-prompted second chance.
                const isParse = (e && (e.type === 'parse' || e.type === undefined));
                const retryable = (e && (e.type === 'empty' || e.type === 'net' || e.type === 'timeout' ||
                    (e.type === 'http' && e.httpStatus >= 500) || isParse));
                if (retryable && attempt < MAX_RETRIES) {
                    addLog('WARN', `Planner attempt ${attempt + 1}/${MAX_RETRIES + 1} failed (${describeLLMFailure(e)}). Retrying...`);
                    await new Promise(r => setTimeout(r, 500));
                    continue;
                }
                // Out of retries: do NOT silently guess — stop the run.
                return heuristicFallbackOrThrow(goal, tree, history, describeLLMFailure(e));
            }
        }
        return heuristicFallbackOrThrow(goal, tree, history, 'apex-browser planner exhausted retries');
    }

    // (callLLM removed: the apex-browser planner uses kiloApiRequest against
    // POST /session/:id/message and reads the reply from `parts`.)

    function describeLLMFailure(err) {
        if (!err || typeof err !== 'object') return String(err || 'unknown');
        switch (err.type) {
            case 'empty': return 'LLM returned empty content';
            case 'parse': return 'Failed parsing LLM JSON';
            case 'parseresp': return `Malformed LLM HTTP response (status ${err.httpStatus})`;
            case 'http': return `LLM API returned status ${err.httpStatus}`;
            case 'net': return `Network error reaching LLM (${err.err || 'unknown'})`;
            case 'timeout': return 'LLM request timed out';
            default: return err.message || 'unknown LLM failure';
        }
    }

    // Either fall back to the heuristic engine (if enabled) or throw so the run stops.
    function heuristicFallbackOrThrow(goal, tree, history, reason) {
        if (getConfig().ALLOW_HEURISTIC_FALLBACK) {
            addLog('WARN', `${reason}. Falling back to Heuristic Engine (allowed by config).`);
            return generateHeuristicPlan(goal, tree, history);
        }
        const msg = `${reason}. Heuristic fallback is DISABLED — stopping the run rather than guessing.`;
        addLog('ERR', msg);
        throw new Error(msg);
    }

    // =========================================================================
    // 5c. PLANNER ENTRY POINT — always the apex-browser agent (4096 Kilo server)
    // =========================================================================
    // The apex-browser agent runs directly on the 4096 Kilo server via
    // POST /session/:id/message (see requestKiloPlan). The server tags every reply
    // mode/agent "apex-browser", so this is the real apex-browser agent — there is
    // no fallback to a different mechanism. (The earlier /session/{id}/init + SSE
    // approach is gone: init is only for project AGENTS.md analysis, and the
    // synchronous /message endpoint returns the plan inline in `parts`.)
    async function requestLLMPlan(goal, tree, history) {
        const config = getConfig();

        // Direct Google Search navigation intent on non-Google pages.
        const g = (goal || '').trim().toLowerCase();
        if ((g.startsWith('google ') || g.includes('google search') || g.includes('search google')) && !window.location.hostname.includes('google.com')) {
            let q = goal.replace(/^\s*(?:google\s+)?(?:search\s+(?:google\s+)?(?:for\s+)?|search\s+for\s+|search\s+|for\s+)?/i, '').trim();
            if (q) {
                addLog('PLAN', `Direct Google Search navigation triggered for "${q}"`);
                return {
                    thought: `Navigating directly to Google Search for "${q}"`,
                    action: 'navigate',
                    url: `https://www.google.com/search?q=${encodeURIComponent(q)}`
                };
            }
        }

        // Always use the apex-browser agent on the 4096 Kilo server.
        return await requestKiloPlan(goal, tree, history);
    }

    // =========================================================================
    // 6. MAIN AUTONOMOUS AGENT RUNNER LOOP
    // =========================================================================
    let isStepRunning = false;
    let loopTimer = null;

    async function runAgentStep() {
        if (isStepRunning || !STATE.isRunning) return;

        // Snapshot run state up-front so a navigation triggered by this step's
        // action still resumes on the destination page.
        persistState();

        const config = getConfig();

        addLog('STEP', `── Step ${STATE.stepCount + 1}/${config.MAX_STEPS} begin (goal="${STATE.goal.slice(0, 50)}", url=${window.location.href})`, { step: STATE.stepCount + 1, url: window.location.href }, true);

        // Hard wall-clock deadline: never let a run hang the tab forever. If we've
        // blown past RUN_DEADLINE_MS, stop with a clear message instead of appearing
        // stuck on "Thinking"/"Acting".
        if (config.RUN_DEADLINE_MS && config.RUN_DEADLINE_MS > 0 && STATE.runStartedAt) {
            const elapsed = Date.now() - STATE.runStartedAt;
            if (elapsed > config.RUN_DEADLINE_MS) {
                STATE.isRunning = false;
                STATE.agentMood = 'error';
                STATE.statusText = `Stopped: exceeded run deadline (${Math.round(elapsed / 1000)}s). The planner was too slow — check the server / model.`;
                addLog('ERR', STATE.statusText);
                clearBadges();
                updateHUD();
                persistState();
                return;
            }
        }

        if (STATE.stepCount >= config.MAX_STEPS) {
            STATE.isRunning = false;
            STATE.agentMood = 'idle';
            STATE.statusText = `Completed: Reached max step limit (${config.MAX_STEPS}).`;
            clearBadges();
            updateHUD();
            persistState();
            return;
        }

        isStepRunning = true;

        try {
            STATE.agentMood = 'scanning';
            STATE.statusText = `Step ${STATE.stepCount + 1}: Scanning Shadow DOM & interactive nodes...`;
            updateHUD();

            const elements = scanInteractiveElements(config.MAX_ELEMENTS);
            renderBadges(elements, null);

            addLog('DOM', `Discovered ${elements.length} interactive nodes across document & shadow roots.`);

            STATE.agentMood = 'thinking';
            STATE.statusText = `Step ${STATE.stepCount + 1}: Synthesizing plan for "${STATE.goal.slice(0, 30)}..."`;
            updateHUD();

            // Live elapsed timer: the server returns the plan inline at completion (no
            // streaming), so without this the UI looks frozen and you'd kill it early.
            const planStart = Date.now();
            const planTimer = setInterval(() => {
                const secs = Math.round((Date.now() - planStart) / 1000);
                STATE.statusText = `Step ${STATE.stepCount + 1}: Synthesizing plan… (${secs}s)`;
                updateHUD();
            }, 1000);

            const startTime = performance.now();
            const plan = await requestLLMPlan(STATE.goal, elements, STATE.history);
            const latency = Math.round(performance.now() - startTime);
            clearInterval(planTimer);

            addLog('PLAN', `Plan: [${plan.length} action(s)] ${plan.map(p => (p.action || '').toUpperCase()).join(' -> ')} (${latency}ms)`, plan);

            // Execute the action SEQUENCE (1..N actions) in order within this single
            // planner round-trip. This lets the agent, e.g., focus a field then type
            // into it — or click + type + press Enter — without prompting the LLM
            // again for every micro-step.
            let finished = false;
            let finishedResult = null;
            for (let ai = 0; ai < plan.length; ai++) {
                const p = plan[ai];
                STATE.agentMood = 'acting';
                STATE.statusText = `Acting (${ai + 1}/${plan.length}): ${p.thought || p.action || 'Executing step'}`;
                updateHUD();

                const outcome = await executeAction(p, elements);

                // CONFIRM the action really landed (type/clear/select). If verification
                // failed, remember it so the NEXT plan request tells the model to retry
                // a different way instead of lying that the field was filled.
                if (outcome && outcome.verified === false) {
                    addLog('WARN', `Verification FAILED for '${outcome.verifyAction}': expected text not found in the field. Actual content: "${(outcome.actual || '').slice(0, 60)}" — will ask planner to retry a different way.`);
                    STATE.verifyFeedback = `PREVIOUS ACTION VERIFICATION FAILED: your '${outcome.verifyAction}' action did NOT actually place the text into the field (the field currently contains: "${ (outcome.actual || '').slice(0, 80) }"). The element may be the wrong one, not focused, or it is a framework-controlled input. RETRY A DIFFERENT WAY: try clicking into the field first, choose a different element id from the list, or type character-by-character. Do NOT report the goal as done until the body field visibly contains the text.`;
                } else if (outcome && outcome.verified === true) {
                    STATE.verifyFeedback = '';
                }

                STATE.history.push({
                    step: STATE.stepCount + 1,
                    action: p.action,
                    elementId: p.elementId,
                    thought: p.thought,
                    timestamp: new Date().toLocaleTimeString()
                });
                STATE.stepCount++;

                // Persist after every committed action so a full page navigation
                // (e.g. clicking a link / Google result / pressing Enter) resumes on
                // the next page.
                persistState();

                // A 'done' action ends the run. A navigation changes the page, so any
                // following actions in the sequence would target stale elements — stop
                // the sequence and let the run resume (or finish) on the new page.
                if (outcome && outcome.finished) {
                    finished = true;
                    finishedResult = outcome.result;
                    break;
                }
                if (p.action === 'navigate') break;
                // If a type/select/clear verification failed, stop and let the next
                // planner call retry a different way.
                if (outcome && outcome.verified === false) break;
            }

            if (finished) {
                STATE.isRunning = false;
                STATE.agentMood = 'done';
                STATE.lastResult = finishedResult;
                STATE.statusText = `Goal Reached: ${finishedResult}`;
                addLog('SUCCESS', `Goal Finished: ${finishedResult}`);
                clearBadges();
                updateHUD();
                persistState();
                return;
            }

            updateHUD();

            if (STATE.isRunning) {
                loopTimer = setTimeout(() => {
                    isStepRunning = false;
                    runAgentStep();
                }, config.STEP_DELAY_MS);
            }
        } catch (err) {
            console.error('Agent step error:', err);
            addLog('ERR', `Step failed: ${err && err.message ? err.message : String(err)}`, err && err.stack ? { stack: err.stack } : undefined);
            STATE.isRunning = false;
            STATE.agentMood = 'error';
            STATE.statusText = `Error: ${err.message}`;
            STATE.history.push({
                step: STATE.stepCount + 1,
                action: 'error',
                thought: 'Error: ' + err.message,
                timestamp: new Date().toLocaleTimeString()
            });
            clearBadges();
            updateHUD();
            persistState();
        } finally {
            isStepRunning = false;
        }
    }

    function startAgent() {
        if (!STATE.goal.trim()) {
            alert('Please enter a goal for the Autonomous Agent first.');
            return;
        }
        STATE.isRunning = true;
        STATE.stepCount = 0;
        STATE.history = [];
        STATE.runStartedAt = Date.now();
        kiloSessionId = null;
        kiloSessionPromise = null;
        STATE.agentMood = 'scanning';
        STATE.statusText = 'Starting autonomous agent loop...';
        addLog('INFO', `Started agent with goal: "${STATE.goal}"`);
        updateHUD();
        persistState();
        setTimeout(runAgentStep, 100);
    }

    function stopAgent() {
        if (loopTimer) clearTimeout(loopTimer);
        STATE.isRunning = false;
        STATE.agentMood = 'idle';
        STATE.statusText = 'Agent paused by user.';
        addLog('INFO', 'Agent stopped by user.');
        clearBadges();
        updateHUD();
        persistState();
    }

    function resetAgent() {
        if (loopTimer) clearTimeout(loopTimer);
        STATE.isRunning = false;
        STATE.stepCount = 0;
        STATE.history = [];
        STATE.lastResult = null;
        kiloSessionId = null;
        kiloSessionPromise = null;
        STATE.agentMood = 'idle';
        STATE.statusText = 'Ready for instructions.';
        addLog('INFO', 'Agent reset to initial state.');
        clearBadges();
        updateHUD();
        clearPersistedState();
    }

    // =========================================================================
    // 7. INJECTED SHADOW DOM HUD INTERFACE
    // =========================================================================
    let hostEl = null;
    let shadowRoot = null;

    function buildHUD() {
        if (document.getElementById('auto-agent-host')) return;

        const parent = document.body || document.documentElement;
        if (!parent) return;

        hostEl = document.createElement('div');
        hostEl.id = 'auto-agent-host';
        hostEl.style.cssText = 'position:fixed !important; z-index:2147483647 !important; display:block !important; visibility:visible !important; opacity:1 !important; pointer-events:none !important; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        parent.appendChild(hostEl);

        shadowRoot = hostEl.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = `
            * { box-sizing: border-box; margin: 0; padding: 0; }
            :host { position: fixed; inset: 0; pointer-events: none; transform: translateZ(0); overflow: visible; }
            .panel, .agent-fab, .agent-pill-wrapper { pointer-events: auto; }
            .hud-container { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; animation: hudIn .25s cubic-bezier(.2,.8,.2,1); }
            @keyframes hudIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
            @keyframes orbPulse { 0%,100% { box-shadow: 0 0 10px #00f3ff, 0 0 20px #00f3ff; } 50% { box-shadow: 0 0 18px #00f3ff, 0 0 32px #00f3ff, 0 0 44px #00f3ff; } }

            /* ===== Base theme tokens ===== */
            :host {
                --bg-dark: #0d0f12;
                --card-bg: rgba(26, 29, 36, 0.85);
                --cyan-glow: #00f2fe;
                --violet-glow: #7f00ff;
                --amber-glow: #ffb300;
                --green-glow: #00e676;
            }

            /* Main Floating Action Button (FAB) */
            .agent-fab {
                position: absolute;
                bottom: 20px;
                right: 20px;
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background: var(--bg-dark);
                border: 1px solid var(--cyan-glow);
                color: var(--cyan-glow);
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 14px rgba(0, 242, 254, 0.3);
                cursor: pointer;
                z-index: 9999;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .agent-fab:hover {
                box-shadow: 0 0 22px rgba(0, 242, 254, 0.55);
                transform: scale(1.05);
            }
            .agent-fab:active { transform: scale(0.92); }

            /* Minimized Floating Pill (status indicator, center-bottom) */
            .agent-pill-wrapper {
                position: absolute;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 9999;
                pointer-events: auto;
            }
            .agent-pill {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 16px;
                background: rgba(13, 15, 18, 0.92);
                backdrop-filter: blur(12px);
                border-radius: 30px;
                border: 1px solid rgba(0, 242, 254, 0.4);
                box-shadow: 0 0 16px rgba(0, 242, 254, 0.25);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            /* State Animations */
            .state-thinking .agent-pill {
                animation: breathing-glow 2.5s ease-in-out infinite;
            }
            .state-alert .agent-pill {
                border-color: var(--amber-glow);
                box-shadow: 0 0 18px rgba(255, 179, 0, 0.4);
                animation: pulse-shake 0.3s ease-in-out 2;
            }

            @keyframes breathing-glow {
                0%, 100% {
                    box-shadow: 0 0 12px rgba(0, 242, 254, 0.25), inset 0 0 6px rgba(0, 242, 254, 0.15);
                    border-color: rgba(0, 242, 254, 0.4);
                }
                50% {
                    box-shadow: 0 0 22px rgba(127, 0, 255, 0.45), inset 0 0 10px rgba(127, 0, 255, 0.25);
                    border-color: rgba(127, 0, 255, 0.7);
                }
            }
            @keyframes pulse-shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-4px); }
                75% { transform: translateX(4px); }
            }

            .status-badge {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .status-glow-dot {
                width: 8px;
                height: 8px;
                background-color: var(--cyan-glow);
                border-radius: 50%;
                box-shadow: 0 0 8px var(--cyan-glow);
                flex: none;
            }
            .status-text {
                color: #ffffff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                font-weight: 500;
                letter-spacing: 0.3px;
            }
            .pill-icon-btn {
                background: transparent;
                border: none;
                color: rgba(255, 255, 255, 0.7);
                cursor: pointer;
                display: flex;
                align-items: center;
                padding: 4px;
                transition: color 0.2s;
            }
            .pill-icon-btn:hover { color: #ffffff; }

            /* Pill glow-dot state colors (per agent mood) */
            .agent-pill-wrapper.state-acting .status-glow-dot { background: var(--green-glow); box-shadow: 0 0 8px var(--green-glow); }
            .agent-pill-wrapper.state-done .status-glow-dot { background: #3b82f6; box-shadow: 0 0 8px #3b82f6; }
            .agent-pill-wrapper.state-alert .status-glow-dot { background: var(--amber-glow); box-shadow: 0 0 8px var(--amber-glow); }
            .agent-pill-wrapper.state-idle .status-glow-dot { background: #64748b; box-shadow: none; }

            /* Hide FAB + pill whenever any full overlay is open */
            :host(.panel-open) .agent-fab, :host(.panel-open) .agent-pill-wrapper { display: none; }

            /* ===== Config Sheet (slide-up drawer) ===== */
            .config-sheet-overlay {
                position: fixed; inset: 0; z-index: 10000;
                background: rgba(13, 15, 18, 0.55);
                backdrop-filter: blur(6px);
                display: none; align-items: flex-end; justify-content: center;
                pointer-events: auto;
            }
            .config-sheet-overlay.open { display: flex; }
            .config-sheet-container {
                width: 100%; max-width: 480px; max-height: 92vh;
                background: linear-gradient(160deg, rgba(13,15,18,.98), rgba(8,10,16,.99));
                border: 1px solid rgba(0, 242, 254, 0.25); border-bottom: none;
                border-radius: 22px 22px 0 0;
                display: flex; flex-direction: column; color: #fff;
                box-shadow: 0 -10px 40px rgba(0,0,0,.6);
                animation: sheetUp .28s cubic-bezier(.2,.8,.2,1);
            }
            @keyframes sheetUp { from { transform: translateY(100%); } to { transform: none; } }
            .sheet-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,.08);
            }
            .icon-btn-close { background: transparent; border: none; color: rgba(255,255,255,.7); cursor: pointer; padding: 4px; display: flex; }
            .icon-btn-close:hover { color: #fff; }
            .sheet-title { font-size: 14px; font-weight: 800; letter-spacing: 1px; color: var(--cyan-glow); margin: 0; }
            .text-btn-reset { background: transparent; border: none; color: rgba(255,255,255,.6); cursor: pointer; font-size: 12px; font-weight: 700; }
            .text-btn-reset:hover { color: #fff; }
            .sheet-body { padding: 16px 18px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
            .config-group { display: flex; flex-direction: column; gap: 10px; }
            .group-label { font-size: 11px; font-weight: 700; letter-spacing: .8px; color: rgba(255,255,255,.5); }
            .model-select-pill {
                display: flex; align-items: center; justify-content: space-between;
                background: rgba(26,29,36,.85); border: 1px solid rgba(0,242,254,.3);
                border-radius: 14px; padding: 12px 14px; cursor: pointer; color: #fff;
            }
            .model-info { display: flex; align-items: center; gap: 8px; }
            .icon-bolt { color: var(--cyan-glow); }
            .model-name { font-size: 13px; font-weight: 600; }
            .group-caption { font-size: 11px; color: rgba(255,255,255,.4); margin: 0; }
            .prompt-input-wrapper { position: relative; display: flex; }
            .prompt-textarea {
                flex: 1; width: 100%; background: rgba(2,6,23,.7);
                border: 1px solid rgba(148,163,184,.25); border-radius: 13px; padding: 11px;
                color: #f1f5f9; font-size: 13px; resize: none; line-height: 1.45; font-family: inherit;
            }
            .prompt-textarea:focus { outline: none; border-color: var(--cyan-glow); box-shadow: 0 0 0 3px rgba(0,242,254,.2); }
            .voice-btn { position: absolute; right: 10px; bottom: 10px; background: transparent; border: none; color: rgba(255,255,255,.6); cursor: pointer; padding: 4px; }
            .voice-btn:hover { color: #fff; }
            .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
            .setting-name { font-size: 13px; color: #e2e8f0; }
            .toggle-switch { position: relative; display: inline-block; width: 42px; height: 24px; }
            .toggle-switch input { opacity: 0; width: 0; height: 0; }
            .toggle-slider { position: absolute; cursor: pointer; inset: 0; background: rgba(255,255,255,.15); border-radius: 24px; transition: .2s; }
            .toggle-slider::before { content: ""; position: absolute; height: 18px; width: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
            .toggle-switch input:checked + .toggle-slider { background: var(--cyan-glow); box-shadow: 0 0 10px rgba(0,242,254,.5); }
            .toggle-switch input:checked + .toggle-slider::before { transform: translateX(18px); }
            .number-input { width: 70px; background: rgba(2,6,23,.7); border: 1px solid rgba(148,163,184,.25); border-radius: 10px; padding: 8px; color: #f1f5f9; font-size: 13px; text-align: center; }
            .text-link-btn { background: transparent; border: none; color: var(--cyan-glow); cursor: pointer; font-size: 12px; font-weight: 600; }
            .text-link-btn:hover { text-decoration: underline; }
            .custom-api-section { display: flex; flex-direction: column; gap: 10px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,.12); }
            .sheet-footer { padding: 14px 18px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid rgba(255,255,255,.08); }
            .btn-primary-gradient {
                width: 100%; padding: 14px; border: none; border-radius: 14px; cursor: pointer;
                font-size: 14px; font-weight: 800; letter-spacing: .5px; color: #04121a;
                background: linear-gradient(90deg, var(--cyan-glow), var(--violet-glow));
                box-shadow: 0 0 20px rgba(0,242,254,.4);
                display: flex; align-items: center; justify-content: center; gap: 8px;
            }
            .btn-primary-gradient:active { transform: scale(.98); }
            .sparkle-icon { font-size: 15px; }

            /* ===== Full-Screen Reasoning Panel ===== */
            .agent-panel-overlay {
                position: fixed; inset: 0;
                background: rgba(13, 15, 18, 0.96);
                backdrop-filter: blur(16px);
                z-index: 10000;
                display: none;
                justify-content: center; align-items: flex-end;
                pointer-events: auto;
            }
            .agent-panel-overlay.open { display: flex; }
            .agent-panel-container {
                width: 100%; max-width: 480px; height: 100%;
                display: flex; flex-direction: column; justify-content: space-between;
                color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                box-sizing: border-box;
            }
            .panel-header {
                display: flex; align-items: center; justify-content: space-between;
                padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            .panel-title-group { display: flex; align-items: center; gap: 8px; }
            .panel-title {
                font-size: 15px; font-weight: 700; letter-spacing: 1px;
                color: var(--cyan-glow, #00f2fe);
                text-shadow: 0 0 10px rgba(0, 242, 254, 0.4); margin: 0;
            }
            .version-tag { font-size: 11px; color: rgba(255, 255, 255, 0.4); font-weight: 600; }
            .header-actions { display: flex; align-items: center; gap: 8px; }
            .icon-btn {
                background: transparent; border: none; color: rgba(255, 255, 255, 0.7);
                cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;
            }
            .icon-btn:hover { color: #ffffff; }
            .panel-body { padding: 20px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; }
            .agent-core-visual { display: flex; flex-direction: column; align-items: center; padding: 10px 0; }
            .orb-container {
                position: relative; width: 90px; height: 90px;
                display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
            }
            .glowing-orb {
                width: 60px; height: 60px; border-radius: 50%;
                background: radial-gradient(circle, var(--cyan-glow, #00f2fe) 0%, var(--violet-glow, #7f00ff) 100%);
                box-shadow: 0 0 30px rgba(0, 242, 254, 0.6), inset 0 0 15px rgba(255, 255, 255, 0.8);
                animation: orb-pulse 2.5s ease-in-out infinite;
            }
            .orb-ring {
                position: absolute; inset: 0; border-radius: 50%;
                border: 1px solid rgba(127, 0, 255, 0.5);
                box-shadow: 0 0 15px rgba(127, 0, 255, 0.4);
                animation: spin 6s linear infinite;
            }
            @keyframes orb-pulse {
                0%, 100% { transform: scale(0.92); opacity: 0.85; }
                50% { transform: scale(1.05); opacity: 1; box-shadow: 0 0 40px rgba(0, 242, 254, 0.8); }
            }
            @keyframes spin { 100% { transform: rotate(360deg); } }
            .status-banner { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
            .pulse-indicator {
                width: 8px; height: 8px; background-color: var(--cyan-glow, #00f2fe);
                border-radius: 50%; box-shadow: 0 0 8px var(--cyan-glow, #00f2fe);
            }
            .status-title {
                font-size: 13px; font-weight: 700; letter-spacing: 1px; color: var(--cyan-glow, #00f2fe);
            }
            .progress-bar-track { width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 6px; overflow: hidden; }
            .progress-bar-fill {
                height: 100%; background: linear-gradient(90deg, var(--cyan-glow, #00f2fe), var(--violet-glow, #7f00ff));
                box-shadow: 0 0 10px var(--cyan-glow, #00f2fe); transition: width 0.4s ease;
            }
            .goal-card-glow {
                background: rgba(26, 29, 36, 0.8); border: 1px solid rgba(0, 242, 254, 0.3);
                border-radius: 16px; padding: 16px; box-shadow: 0 0 18px rgba(0, 242, 254, 0.12);
            }
            .card-label {
                font-size: 11px; font-weight: 700; letter-spacing: 0.8px;
                color: rgba(255, 255, 255, 0.4); display: block; margin-bottom: 6px;
            }
            .goal-text { font-size: 15px; font-weight: 500; color: #ffffff; margin: 0; line-height: 1.4; }
            .reasoning-section { display: flex; flex-direction: column; gap: 10px; }
            .section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; color: rgba(255, 255, 255, 0.4); }
            .reasoning-feed { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
            .reasoning-step {
                display: flex; align-items: center; justify-content: space-between;
                background: rgba(18, 20, 26, 0.7); border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 12px; padding: 12px 14px; font-size: 13px;
            }
            .reasoning-step.completed { color: rgba(255, 255, 255, 0.7); }
            .reasoning-step.active { border-color: var(--cyan-glow, #00f2fe); box-shadow: 0 0 12px rgba(0, 242, 254, 0.2); color: #ffffff; }
            .step-icon { margin-right: 10px; font-size: 12px; }
            .step-icon.active-glow { color: var(--cyan-glow, #00f2fe); text-shadow: 0 0 8px var(--cyan-glow, #00f2fe); }
            .step-text { flex: 1; }
            .step-badge { font-size: 11px; color: rgba(255, 255, 255, 0.4); }
            .reasoning-step.active .step-badge { color: var(--cyan-glow, #00f2fe); }
            .panel-controls { display: flex; gap: 12px; padding: 16px 20px 24px; border-top: 1px solid rgba(255, 255, 255, 0.08); }
            .btn-control {
                flex: 1; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 700;
                letter-spacing: 0.5px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s ease;
            }
            .btn-pause { background: transparent; border: 1px solid var(--cyan-glow, #00f2fe); color: var(--cyan-glow, #00f2fe); box-shadow: 0 0 10px rgba(0, 242, 254, 0.15); }
            .btn-pause:active { background: rgba(0, 242, 254, 0.15); }
            .btn-stop { background: transparent; border: 1px solid #ff5252; color: #ff5252; box-shadow: 0 0 10px rgba(255, 82, 82, 0.15); }
            .btn-stop:active { background: rgba(255, 82, 82, 0.15); }

            /* ===== Model Selector Modal ===== */
            .modal-overlay {
                position: fixed; inset: 0; z-index: 10001;
                background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(12px);
                display: none; align-items: flex-end; justify-content: center;
                pointer-events: auto;
            }
            .modal-overlay.open { display: flex; }
            .modal-container {
                width: 100%; max-width: 480px;
                background: rgba(13, 15, 18, 0.98);
                border: 1px solid rgba(0, 242, 254, 0.3); border-bottom: none;
                border-radius: 24px 24px 0 0;
                box-shadow: 0 -10px 40px rgba(0, 242, 254, 0.2);
                padding-bottom: 24px; color: #ffffff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                box-sizing: border-box;
            }
            .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
            .modal-title { font-size: 13px; font-weight: 700; letter-spacing: 1px; color: var(--cyan-glow, #00f2fe); text-shadow: 0 0 8px rgba(0, 242, 254, 0.4); margin: 0; }
            .modal-body { padding: 16px 20px 0; }
            .model-options-list { display: flex; flex-direction: column; gap: 12px; }
            .model-option-card {
                position: relative; display: flex; align-items: center; justify-content: space-between;
                background: rgba(26, 29, 36, 0.7); border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 14px; padding: 14px 16px; cursor: pointer; transition: all 0.2s ease;
            }
            .model-option-card input[type="radio"] { position: absolute; opacity: 0; width: 0; height: 0; }
            .option-content { display: flex; flex-direction: column; gap: 4px; flex: 1; }
            .option-header { display: flex; align-items: center; gap: 8px; }
            .option-name { font-size: 14px; font-weight: 600; color: #ffffff; }
            .option-desc { font-size: 12px; color: rgba(255, 255, 255, 0.5); margin: 0; }
            .active-badge { font-size: 10px; font-weight: 700; color: var(--cyan-glow, #00f2fe); background: rgba(0, 242, 254, 0.12); border: 1px solid rgba(0, 242, 254, 0.3); padding: 2px 6px; border-radius: 6px; letter-spacing: 0.5px; }
            .radio-custom { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.3); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; margin-left: 12px; }
            .radio-custom::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--cyan-glow, #00f2fe); opacity: 0; transform: scale(0); transition: all 0.2s ease; }
            .model-option-card:hover { border-color: rgba(0, 242, 254, 0.4); }
            .model-option-card.active,
            .model-option-card input[type="radio"]:checked ~ .option-content .option-name { color: #ffffff; }
            .model-option-card input[type="radio"]:checked ~ .radio-custom,
            .model-option-card.active .radio-custom { border-color: var(--cyan-glow, #00f2fe); box-shadow: 0 0 8px rgba(0, 242, 254, 0.5); }
            .model-option-card input[type="radio"]:checked ~ .radio-custom::after,
            .model-option-card.active .radio-custom::after { opacity: 1; transform: scale(1); }
            .model-option-card.active { border-color: var(--cyan-glow, #00f2fe); box-shadow: 0 0 16px rgba(0, 242, 254, 0.15); background: rgba(26, 29, 36, 0.95); }

            .panel {
                background: linear-gradient(160deg, rgba(15,23,42,.97), rgba(8,12,24,.98));
                backdrop-filter: blur(18px) saturate(140%);
                border: 1px solid rgba(99,102,241,.35);
                border-radius: 22px; padding: 16px; color: #e2e8f0;
                box-shadow: 0 24px 60px rgba(0,0,0,.65), 0 0 0 1px rgba(56,189,248,.08), inset 0 1px 0 rgba(255,255,255,.06);
                margin-bottom: 12px; max-height: calc(100vh - 88px);
                overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
                animation: hudIn .25s cubic-bezier(.2,.8,.2,1);
            }
            .panel::-webkit-scrollbar, .settings-fragment::-webkit-scrollbar, .console-box::-webkit-scrollbar, .model-select::-webkit-scrollbar { width: 8px; height: 8px; }
            .panel::-webkit-scrollbar-thumb, .settings-fragment::-webkit-scrollbar-thumb, .console-box::-webkit-scrollbar-thumb, .model-select::-webkit-scrollbar-thumb { background: linear-gradient(#38bdf8,#6366f1); border-radius: 8px; }
            .panel::-webkit-scrollbar-track, .settings-fragment::-webkit-scrollbar-track, .console-box::-webkit-scrollbar-track, .model-select::-webkit-scrollbar-track { background: rgba(255,255,255,.05); border-radius: 8px; }

            .header-bar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(148,163,184,.16); padding-bottom: 10px; }
            .title-tag { font-size: 12px; font-weight: 900; letter-spacing: .9px; background: linear-gradient(135deg, #22d3ee, #a78bfa, #f472b6); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; text-transform: uppercase; }
            .icon-btn { background: rgba(30,41,59,.85); border: 1px solid rgba(148,163,184,.25); color: #cbd5e1; border-radius: 10px; padding: 5px 9px; font-size: 12px; cursor: pointer; transition: all .15s ease; }
            .icon-btn:hover { background: linear-gradient(135deg, #0ea5e9, #6366f1); color: #fff; border-color: transparent; transform: translateY(-1px); }
            .icon-btn:active { transform: translateY(0) scale(.97); }

            .goal-textarea { width: 100%; background: rgba(2,6,23,.7); border: 1px solid rgba(148,163,184,.25); border-radius: 13px; padding: 11px; color: #f1f5f9; font-size: 13px; resize: none; line-height: 1.45; transition: border-color .15s, box-shadow .15s; }
            .goal-textarea:focus { outline: none; border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,.2); }
            .status-box { font-size: 11px; color: #7dd3fc; background: rgba(2,6,23,.6); border: 1px solid rgba(56,189,248,.22); border-radius: 13px; padding: 9px 11px; min-height: 32px; word-break: break-word; line-height: 1.4; }
            .actions-row { display: flex; gap: 10px; margin-bottom: 12px; }
            button { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; font-weight: 500; padding: 8px 16px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; transition: all 0.2s ease; }
            .btn-start, .btn-stop { flex: 1; border: none; color: #ffffff; cursor: pointer; font-size: 13px; font-weight: 700; letter-spacing: .3px; transition: all .15s ease; }
            .btn-start { background-color: #10b981; }
            .btn-start:hover { background-color: #059669; }
            .btn-stop { background-color: #ef4444; }
            .btn-stop:hover { background-color: #dc2626; }
            .btn-reset { padding: 11px 14px; border-radius: 6px; border: 1px solid #d1d5db; background-color: #f3f4f6; color: #374151; font-size: 13px; cursor: pointer; transition: all .15s; }
            .btn-reset:hover { background-color: #e5e7eb; }

            .console-box { background-color: #1e1e1e; color: #00ff66; border-radius: 6px; padding: 12px; max-height: 150px; overflow-y: auto; font-family: "Courier New", Courier, monospace; font-size: 13px; display: flex; flex-direction: column; gap: 5px; box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.5); }
            .log-line { display: flex; gap: 5px; line-height: 1.4; word-break: break-all; align-items: flex-start; margin: 4px 0; }
            .console-entry { margin: 4px 0; line-height: 1.4; }
            .log-badge { font-weight: 800; padding: 1px 5px; border-radius: 5px; font-size: 9px; white-space: nowrap; }
            .badge-DOM { color: #38bdf8; background: rgba(56,189,248,.16); }
            .badge-PLAN { color: #c084fc; background: rgba(192,132,252,.16); }
            .badge-ACT { color: #34d399; background: rgba(52,211,153,.16); }
            .badge-SUCCESS { color: #4ade80; background: rgba(74,222,128,.2); }
            .badge-ERR { color: #f87171; background: rgba(248,113,113,.2); }
            .badge-INFO { color: #94a3b8; background: rgba(148,163,184,.18); }
            .badge-NET { color: #38bdf8; background: rgba(56,189,248,.16); }
            .badge-STEP { color: #fbbf24; background: rgba(251,191,36,.16); }
            .badge-ACT { color: #34d399; background: rgba(52,211,153,.16); }
            .badge-VERIFY { color: #f472b6; background: rgba(244,114,182,.16); }

            /* ===== Debug console + log controls ===== */
            .console-section { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
            .console-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
            .console-actions { display: flex; gap: 6px; flex-wrap: wrap; }
            .console-btn {
                background: rgba(30,41,59,.85); border: 1px solid rgba(148,163,184,.25); color: #cbd5e1;
                border-radius: 10px; padding: 5px 9px; font-size: 11px; font-weight: 700; cursor: pointer;
                transition: all .15s ease; display: inline-flex; align-items: center; gap: 4px;
            }
            .console-btn:hover { background: linear-gradient(135deg, #0ea5e9, #6366f1); color: #fff; border-color: transparent; transform: translateY(-1px); }
            .console-btn:active { transform: translateY(0) scale(.97); }
            .console-btn.active { background: linear-gradient(135deg, #22d3ee, #6366f1); color: #04121a; border-color: transparent; }
            .console-meta { font-size: 10px; color: rgba(148,163,184,.7); font-weight: 600; }
            .console-box.log-verbose-hidden .log-verbose { display: none; }
            .log-verbose { opacity: .7; font-style: italic; }

            .settings-drawer { background: linear-gradient(160deg, rgba(15,23,42,.92), rgba(11,15,28,.96)); border: 1px solid rgba(99,102,241,.28); border-radius: 18px; padding: 13px; font-size: 11px; display: flex; flex-direction: column; gap: 11px; box-shadow: inset 0 1px 0 rgba(255,255,255,.04); }
            .main-view { display: flex; flex-direction: column; gap: 12px; }
            .settings-fragment { display: flex; flex-direction: column; gap: 11px; max-height: calc(100vh - 150px); overflow-y: auto; }
            .tab-bar { display: flex; gap: 6px; background: rgba(2,6,23,.55); padding: 4px; border-radius: 13px; border: 1px solid rgba(148,163,184,.16); }
            .tab-btn { flex: 1; background: transparent; border: none; color: #94a3b8; border-radius: 10px; padding: 9px 4px; font-size: 11px; font-weight: 700; cursor: pointer; transition: all .18s ease; display: flex; align-items: center; justify-content: center; gap: 4px; }
            .tab-btn:hover { color: #e2e8f0; }
            .tab-btn.active { background: linear-gradient(135deg, #0ea5e9, #6366f1); color: #fff; box-shadow: 0 4px 14px rgba(99,102,241,.5); }
            .tab-panel { display: flex; flex-direction: column; gap: 11px; border: 1px solid rgba(148,163,184,.16); border-radius: 15px; padding: 13px; background: rgba(2,6,23,.4); animation: fadeIn .2s ease; }
            .model-select { max-height: 240px; }

            .model-picker-note { color: #94a3b8; font-size: 10px; line-height: 1.4; margin: 0 0 4px; }
            .model-picker-note b { color: #e2e8f0; font-weight: 600; }
            .modal-actions { display: flex; justify-content: flex-end; margin-top: 10px; }

            .field-row { display: flex; flex-direction: column; gap: 5px; }
            .field-row.row { flex-direction: row; flex-wrap: wrap; align-items: center; }
            .field-label { color: #94a3b8; font-size: 10px; letter-spacing: .3px; font-weight: 600; }
            .field-input, .field-select { background: rgba(2,6,23,.75); border: 1px solid rgba(0,243,255,.28); border-radius: 11px; padding: 9px 11px; color: #f1f5f9; font-size: 12px; max-width: 100%; width: 100%; transition: border-color .18s, box-shadow .18s; }
            .field-input:focus, .field-select:focus { outline: none; border-color: #00f3ff; box-shadow: 0 0 0 3px rgba(0,243,255,.22); }
            .field-select { cursor: pointer; }

            @media (max-width: 380px) {
                .panel { width: calc(100vw - 18px); padding: 12px; }
                .field-input, .field-select { font-size: 13px; }
            }

            /* Mobile: full-width bottom sheet, larger touch targets, safe-area aware. */
            @media (max-width: 520px) {
                :host {
                    top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
                }
                .hud-container { align-items: stretch; justify-content: flex-end; height: 100%; gap: 10px; }
                .agent-fab {
                    position: absolute; right: 14px; bottom: calc(16px + env(safe-area-inset-bottom));
                    width: 54px; height: 54px;
                }
                :host(.panel-open) .agent-fab, :host(.panel-open) .agent-pill-wrapper { display: none; }
                .panel {
                    width: 100% !important; max-width: 100% !important;
                    border-radius: 26px 26px 0 0; margin: 0 !important;
                    max-height: 94dvh; max-height: 94vh;
                    padding: 18px 16px calc(18px + env(safe-area-inset-bottom));
                    gap: 14px;
                }
                .title-tag { font-size: 13px; }
                .goal-textarea { font-size: 15px; padding: 13px; }
                .status-box { font-size: 12px; padding: 11px 12px; }
                .btn-start, .btn-stop { padding: 14px; font-size: 15px; min-height: 50px; }
                .btn-reset { padding: 14px; font-size: 15px; min-height: 50px; }
                .icon-btn { padding: 8px 11px; font-size: 13px; min-height: 42px; }
                .tab-bar { padding: 5px; }
                .tab-btn { padding: 12px 4px; font-size: 12px; }
                .tab-panel { padding: 14px; gap: 13px; border-radius: 16px; }
                .field-label { font-size: 11px; }
                .field-input, .field-select { padding: 13px 14px; font-size: 15px; border-radius: 13px; min-height: 46px; }
                .console-box { font-size: 11px; max-height: 160px; }
            }
        `;
        shadowRoot.appendChild(style);

        const container = document.createElement('div');
        container.className = 'hud-container';
        container.innerHTML = `
            <!-- ===== Config Sheet (slide-up drawer) ===== -->
            <div id="agent-config-sheet" class="config-sheet-overlay">
                <div class="config-sheet-container">
                    <header class="sheet-header">
                        <button id="close-config-btn" class="icon-btn-close" aria-label="Close Settings">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                        <h2 class="sheet-title">AGENT CONFIGURATION</h2>
                        <button id="reset-config-btn" class="text-btn-reset">Reset</button>
                    </header>
                    <div class="sheet-body">
                        <section class="config-group">
                            <label class="group-label">MODEL SELECTION</label>
                            <button id="model-selector-trigger" class="model-select-pill">
                                <span class="model-info"><span class="icon-bolt">⚡</span>                                <span id="model-name-label" class="model-name">⚡ apex-browser (4096)</span></span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                            <p class="group-caption">↳ Fast reasoning • Web browser optimized</p>
                        </section>
                        <section class="config-group">
                            <label for="agent-prompt-input" class="group-label">AGENT PROMPT / GOAL</label>
                            <div class="prompt-input-wrapper">
                                <textarea id="agent-prompt-input" class="prompt-textarea" placeholder="Enter prompt/goal..." rows="3"></textarea>
                                <button id="voice-input-btn" class="voice-btn" aria-label="Voice Input">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                                </button>
                            </div>
                        </section>
                        <section class="config-group">
                            <label class="group-label">ADVANCED SETTINGS</label>
                            <div class="setting-row"><span class="setting-name">Auto-Execute Actions</span><label class="toggle-switch"><input type="checkbox" id="toggle-auto-execute" checked><span class="toggle-slider"></span></label></div>
                            <div class="setting-row"><span class="setting-name">Max Steps Limit</span><input type="number" id="input-max-steps" class="number-input" value="20" min="1" max="100"></div>
                            <div class="setting-row"><span class="setting-name">Visual Inspection (DOM Glow)</span><label class="toggle-switch"><input type="checkbox" id="toggle-dom-glow" checked><span class="toggle-slider"></span></label></div>
                            <div class="setting-row"><span class="setting-name">API Key / Provider</span><button id="btn-custom-api" class="text-link-btn">[ Custom... ]</button></div>
                        </section>
                        <div id="custom-api-section" class="custom-api-section" style="display:none;">
                            <div id="settings-fragment" class="settings-drawer">
                                <div class="tab-bar">
                                    <button class="tab-btn active" data-tab="server">🖧 Server</button>
                                    <button class="tab-btn" data-tab="models">🧠 Models</button>
                                    <button class="tab-btn" data-tab="behavior">⚙️ Behavior</button>
                                </div>
                                <div id="tab-server" class="tab-panel">
                                    <div class="field-row"><label class="field-label">Server:</label><select id="cfg-server" class="field-select"><option value="devproject">DevProject — 4096 (/ai) · DEFAULT</option><option value="local">Local OpenCode — 127.0.0.1:4096</option><option value="kilo4097">Kilo Server — 4097 (/v1)</option><option value="custom">Custom Server…</option></select></div>
                                    <div id="custom-server-row" class="field-row" style="display:none;"><label class="field-label">Session API base (/ai):</label><input id="cfg-ai-base" type="text" class="field-input" placeholder="https://your-host/ai" /><label class="field-label">Chat API base (/v1):</label><input id="cfg-base-url" type="text" class="field-input" placeholder="https://your-host/v1" /></div>
                                    <div class="field-row"><label class="field-label">AI Provider (planner):</label><select id="cfg-provider" class="field-select"><option value="devproject">⚡ Kilo Session API (4096 /ai)</option><option value="kilo">⚡ Kilo Server (4097 /v1)</option><option value="heuristic">⚡ Built-in Engine (Free)</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="groq">Groq</option><option value="ollama">Ollama</option><option value="custom">Custom API</option></select></div>
                                    <div id="api-key-row" class="field-row"><label class="field-label">API Key / Token:</label><input id="cfg-apikey" type="password" class="field-input" placeholder="sk-... (or gateway token)" /></div>
                                    <div id="kilo-auth-row" class="field-row"><label class="field-label">Kilo Shared Secret (X-Kilo-Auth):</label><input id="cfg-kiloauth" type="password" class="field-input" placeholder="shared secret for /ai" /></div>
                                    <div id="kilo-dir-row" class="field-row"><label class="field-label">Working Directory:</label><input id="cfg-kilodir" type="text" class="field-input" placeholder="/" /></div>
                                    <div class="field-label" style="color:#7dd3fc; font-size:10px; line-height:1.3;">Default planner runs on 4096 (/ai) as the apex-browser agent — a tool-locked, in-page planner. It returns a plan JSON this script executes locally.</div>
                                </div>
                                <div id="tab-models" class="tab-panel" style="display:none;">
                                    <div class="field-row"><label class="field-label">Provider (4096 /ai):</label><select id="cfg-provpicker" class="field-select"></select></div>
                                    <div class="field-row"><label class="field-label">Session Model:</label><select id="cfg-kilomodel" class="field-select model-select"></select><input id="cfg-kilomodel-custom" type="text" class="field-input" placeholder="provider/model" style="display:none; margin-top:4px;" /></div>
                                    <div class="field-label" style="color:#94a3b8; font-size:10px; line-height:1.3;">Pick a provider, then a model. 🆓 Free Models aggregates free tiers across providers.</div>
                                </div>
                                <div id="tab-behavior" class="tab-panel" style="display:none;">
                                    <div class="field-row" style="flex-direction:row; align-items:center; justify-content:space-between; gap:8px;"><label class="field-label" style="display:flex; align-items:center; gap:4px; cursor:pointer; color:#fca5a5;"><input id="cfg-heuristic-toggle" type="checkbox" /> Allow heuristic fallback</label><label class="field-label" style="display:flex; align-items:center; gap:4px; cursor:pointer;">LLM retries <input id="cfg-llm-retries" type="number" min="0" max="10" class="field-input" style="width:48px;" /></label></div>
                                    <div class="field-row" style="flex-direction:row; align-items:center; gap:8px;"><label class="field-label" style="display:flex; align-items:center; gap:4px; cursor:pointer;"><input id="cfg-verify-toggle" type="checkbox" /> Verify fields</label><label class="field-label" style="display:flex; align-items:center; gap:4px; cursor:pointer; margin-left:auto;"><input id="cfg-badges-toggle" type="checkbox" /> Show Badges</label></div>
                                    <div class="field-row" style="margin-top:2px;"><span class="field-label" style="color:#fca5a5; font-size:10px; line-height:1.3;">🔒 apex-browser agent is used for EVERYTHING: the planner is permanently tool-locked to in-page reasoning only. It never invokes MCP/CLI/tools.</span></div>
                                    <div style="display:flex; justify-content:flex-end; margin-top:8px;"><button id="btn-save-cfg" class="icon-btn" style="color:#38bdf8; font-weight:700;">Save</button></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <footer class="sheet-footer">
                        <button id="start-agent-btn" class="btn-primary-gradient"><span class="sparkle-icon">✨</span> RUN AUTONOMOUS AGENT</button>
                    </footer>
                </div>
            </div>

            <!-- ===== Full-Screen Reasoning Panel ===== -->
            <div id="agent-fullscreen-panel" class="agent-panel-overlay">
                <div class="agent-panel-container">
                    <header class="panel-header">
                        <button id="minimize-panel-btn" class="icon-btn" aria-label="Minimize Panel"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
                        <div class="panel-title-group"><h1 class="panel-title">AUTONOMOUS AGENT</h1><span class="version-tag">v8.10</span></div>
                        <div class="header-actions">
                            <button id="open-config-btn" class="icon-btn" aria-label="Settings"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
                            <button id="close-panel-btn" class="icon-btn" aria-label="Close Agent"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                        </div>
                    </header>
                    <div class="panel-body">
                        <div class="agent-core-visual">
                            <div class="orb-container"><div class="glowing-orb"></div><div class="orb-ring"></div></div>
                            <div class="status-banner"><span class="pulse-indicator"></span><span id="fs-status-title" class="status-title">AGENT THINKING</span></div>
                            <div class="progress-bar-track"><div id="fs-progress-fill" class="progress-bar-fill" style="width:0%;"></div></div>
                        </div>
                        <div class="goal-card-glow"><span class="card-label">CURRENT GOAL</span><p id="fs-goal-text" class="goal-text"></p></div>
                        <div class="reasoning-section"><span class="section-label">AGENT REASONING</span><ul id="fs-reasoning-feed" class="reasoning-feed"></ul></div>
                        <div class="console-section">
                            <div class="console-toolbar">
                                <span class="section-label">DEBUG CONSOLE <span id="console-count" class="console-meta"></span></span>
                                <div class="console-actions">
                                    <button id="btn-save-logs" class="console-btn" title="Download full logs as JSON">💾 Save</button>
                                    <button id="btn-copy-logs" class="console-btn" title="Copy logs to clipboard">📋 Copy</button>
                                    <button id="btn-clear-logs" class="console-btn" title="Clear in-memory logs">🗑 Clear</button>
                                    <button id="btn-toggle-verbose" class="console-btn" title="Toggle verbose (network/step/verify) logging">🔍 Verbose: OFF</button>
                                </div>
                            </div>
                            <div id="agent-console" class="console-box"></div>
                        </div>
                    </div>
                    <footer class="panel-controls">
                        <button id="pause-agent-btn" class="btn-control btn-pause"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg><span id="pause-agent-label">PAUSE</span></button>
                        <button id="stop-agent-btn" class="btn-control btn-stop"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg> STOP</button>
                    </footer>
                </div>
            </div>

            <!-- ===== Model Selector Modal ===== -->
            <div id="model-selector-modal" class="modal-overlay">
                <div class="modal-container">
                    <header class="modal-header">
                        <h3 class="modal-title">SELECT AI MODEL</h3>
                        <button id="close-model-modal-btn" class="icon-btn-close" aria-label="Close Model Selection">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </header>
                    <div class="modal-body">
                        <div class="model-options-list">
                            <p class="model-picker-note">Models are fetched live from the <b>4096</b> Kilo server. Pick a <b>Provider</b>, then a <b>Model</b>. The <b>🆓 Free Models</b> group aggregates free tiers across providers.</p>
                            <div class="field-row"><label class="field-label">Provider</label><select id="ms-provider" class="field-select"></select></div>
                            <div class="field-row"><label class="field-label">Model (4096 /ai)</label><select id="ms-model" class="field-select model-select"></select><input id="ms-model-custom" type="text" class="field-input" placeholder="provider/model (custom)" style="display:none; margin-top:4px;" /></div>
                            <div class="modal-actions">
                                <button id="ms-apply" class="btn-primary-gradient">Apply</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Minimized status pill (center-bottom) -->
            <div id="agent-pill-wrapper" class="agent-pill-wrapper state-idle">
                <div class="agent-pill">
                    <div class="status-badge">
                        <span class="status-glow-dot"></span>
                        <span class="status-text">Idle</span>
                    </div>
                    <button id="pill-pause-btn" class="pill-icon-btn" aria-label="Pause">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Main Floating Action Button (bottom-right) -->
            <button id="agent-fab" class="agent-fab" data-mood="idle" aria-label="Open Agent Menu" title="Toggle Autonomous Browser Agent">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <circle cx="12" cy="5" r="2" />
                    <path d="M12 7v4" />
                    <circle cx="8" cy="16" r="1" fill="currentColor" />
                    <circle cx="16" cy="16" r="1" fill="currentColor" />
                </svg>
            </button>
        `;

        shadowRoot.appendChild(container);

        // Bind HUD events
        const agentFab = shadowRoot.getElementById('agent-fab');
        const pillWrapper = shadowRoot.getElementById('agent-pill-wrapper');
        const pillPauseBtn = shadowRoot.getElementById('pill-pause-btn');
        const configSheet = shadowRoot.getElementById('agent-config-sheet');
        const fullscreenPanel = shadowRoot.getElementById('agent-fullscreen-panel');
        const promptInput = shadowRoot.getElementById('agent-prompt-input');
        const startBtn = shadowRoot.getElementById('start-agent-btn');
        const closeConfigBtn = shadowRoot.getElementById('close-config-btn');
        const resetConfigBtn = shadowRoot.getElementById('reset-config-btn');
        const modelTrigger = shadowRoot.getElementById('model-selector-trigger');
        const modelNameLabel = shadowRoot.getElementById('model-name-label');
        const voiceBtn = shadowRoot.getElementById('voice-input-btn');
        const autoExecToggle = shadowRoot.getElementById('toggle-auto-execute');
        const maxStepsInput = shadowRoot.getElementById('input-max-steps');
        const domGlowToggle = shadowRoot.getElementById('toggle-dom-glow');
        const customApiBtn = shadowRoot.getElementById('btn-custom-api');
        const customApiSection = shadowRoot.getElementById('custom-api-section');
        const settingsFragment = shadowRoot.getElementById('settings-fragment');
        const fsStatusTitle = shadowRoot.getElementById('fs-status-title');
        const fsProgressFill = shadowRoot.getElementById('fs-progress-fill');
        const fsGoalText = shadowRoot.getElementById('fs-goal-text');
        const fsReasoningFeed = shadowRoot.getElementById('fs-reasoning-feed');
        const minimizeBtn = shadowRoot.getElementById('minimize-panel-btn');
        const openConfigBtn = shadowRoot.getElementById('open-config-btn');
        const closePanelBtn = shadowRoot.getElementById('close-panel-btn');
        const pauseBtn = shadowRoot.getElementById('pause-agent-btn');
        const pauseLabel = shadowRoot.getElementById('pause-agent-label');
        const stopBtn = shadowRoot.getElementById('stop-agent-btn');

        // Settings tabs (Server / Models / Behavior) so the modal never overflows.
        const tabServer = shadowRoot.getElementById('tab-server');
        const tabModels = shadowRoot.getElementById('tab-models');
        const tabBehavior = shadowRoot.getElementById('tab-behavior');
        const tabBtns = Array.from(shadowRoot.querySelectorAll('.tab-btn'));
        function showSettingsTab(name) {
            STATE.settingsTab = name;
            const map = { server: tabServer, models: tabModels, behavior: tabBehavior };
            Object.keys(map).forEach(k => { if (map[k]) map[k].style.display = (k === name) ? 'flex' : 'none'; });
            tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
            if (settingsFragment) settingsFragment.scrollTop = 0;
        }
        tabBtns.forEach(b => { b.onclick = () => showSettingsTab(b.dataset.tab); });

        // Server preset handling (DevProject 4096 / Kilo 4097 / Custom).
        const serverSel = shadowRoot.getElementById('cfg-server');
        const customServerRow = shadowRoot.getElementById('custom-server-row');
        const aiBaseInp = shadowRoot.getElementById('cfg-ai-base');
        const baseUrlInp = shadowRoot.getElementById('cfg-base-url');
        const SERVER_PRESETS = {
            local:      { ai: 'http://127.0.0.1:4096', v1: 'http://127.0.0.1:4097' },
            devproject: { ai: 'https://devproject.vip/ai', v1: 'https://devproject.vip/v1' },
            kilo4097:   { ai: 'https://devproject.vip/ai', v1: 'https://devproject.vip/v1' }
        };
        function applyServerPreset() {
            const s = serverSel ? serverSel.value : 'local';
            if (s === 'custom') {
                if (customServerRow) customServerRow.style.display = 'flex';
                return;
            }
            if (customServerRow) customServerRow.style.display = 'none';
            const p = SERVER_PRESETS[s] || SERVER_PRESETS.devproject;
            if (aiBaseInp) aiBaseInp.value = p.ai;
            if (baseUrlInp) baseUrlInp.value = p.v1;
        }
        if (serverSel) serverSel.onchange = applyServerPreset;

        // Swap between the main agent view and the settings fragment so the modal
        // only ever shows ONE view at a time (fits mobile without overflowing).
        function showSettingsFragment(show) {
            // Persist the current settings whenever the modal is dismissed so the
            // selected provider, models, and toggles are never lost.
            if (!show && typeof saveConfigFromUI === 'function') {
                try { saveConfigFromUI(); } catch (e) {}
            }
            STATE.showSettings = show;
            if (customApiSection) customApiSection.style.display = show ? 'flex' : 'none';
            if (show) showSettingsTab(STATE.settingsTab || 'server');
            persistState();
        }

        agentFab.onclick = () => {
            STATE.isExpanded = !STATE.isExpanded;
            updateHUD();
        };

        if (pillPauseBtn) pillPauseBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            if (STATE.isRunning) stopAgent();
            else startAgent();
        };
        // Tap the pill to open the live session / logs panel with verbose auto-enabled (debug view).
        if (pillWrapper) pillWrapper.onclick = () => {
            STATE.verbose = true;
            STATE.panelOpen = true;
            updateHUD();
        };

        if (closeConfigBtn) closeConfigBtn.onclick = () => {
            STATE.isExpanded = false;
            updateHUD();
        };

        if (resetConfigBtn) resetConfigBtn.onclick = () => {
            resetAgent();
            STATE.isExpanded = false;
            updateHUD();
        };

        const modelModal = shadowRoot.getElementById('model-selector-modal');
        const closeModelModalBtn = shadowRoot.getElementById('close-model-modal-btn');
        const msProvider = shadowRoot.getElementById('ms-provider');
        const msModel = shadowRoot.getElementById('ms-model');
        const msModelCustom = shadowRoot.getElementById('ms-model-custom');
        const msApply = shadowRoot.getElementById('ms-apply');

        // Resolve which provider (or "free") a saved model id belongs to.
        function msFindProviderForModel(map, modelId) {
            for (const p of map.providers) if (p.models.includes(modelId)) return p.id;
            if (map.free.includes(modelId)) return 'free';
            const seg = (modelId || '').split('/')[0];
            const p = map.providers.find(x => x.id === seg);
            return p ? p.id : 'free';
        }
        async function msPopulateProviders() {
            const map = await fetchProviderModelMap();
            if (!msProvider) return;
            msProvider.innerHTML = '';
            const fo = document.createElement('option'); fo.value = 'free'; fo.textContent = '🆓 Free Models'; msProvider.appendChild(fo);
            map.providers.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name || p.id; msProvider.appendChild(o); });
        }
        async function msPopulateModels(provId, currentValue) {
            const map = await fetchProviderModelMap();
            if (!msModel) return;
            const ids = (provId === 'free') ? map.free : ((map.providers.find(p => p.id === provId) || { models: [] }).models);
            msModel.innerHTML = '';
            ids.slice().sort().forEach(id => { const o = document.createElement('option'); o.value = id; o.textContent = id; o.dataset.model = id.toLowerCase(); msModel.appendChild(o); });
            const co = document.createElement('option'); co.value = '__custom__'; co.textContent = '✏️ Custom…'; msModel.appendChild(co);
            if (currentValue && ids.includes(currentValue)) { msModel.value = currentValue; if (msModelCustom) msModelCustom.style.display = 'none'; }
            else if (currentValue) { msModel.value = '__custom__'; if (msModelCustom) { msModelCustom.style.display = ''; msModelCustom.value = currentValue; } }
            else { msModel.value = '__custom__'; if (msModelCustom) msModelCustom.style.display = ''; }
        }
        function msReadValue() {
            if (msModel && msModel.value === '__custom__') return (msModelCustom && msModelCustom.value.trim()) || '';
            return msModel ? msModel.value : '';
        }
        function msApplySelection() {
            const v = msReadValue();
            if (!v) return;
            // 4096 is the main system: lock the planner to the 4096 session API.
            setConfig(Object.assign({}, getConfig(), { PROVIDER: 'devproject', KILO_MODEL: v }));
            if (modelNameLabel) modelNameLabel.innerText = v;
        }
        function openModelModal() {
            fetchProviderModelMap().then(map => {
                msPopulateProviders().then(() => {
                    const cur = getConfig().KILO_MODEL || 'kilo-auto/free';
                    msProvider.value = msFindProviderForModel(map, cur) || 'free';
                    msPopulateModels(msProvider.value, cur);
                });
            });
            if (modelModal) modelModal.classList.add('open');
        }
        function closeModelModal() { if (modelModal) modelModal.classList.remove('open'); }
        if (modelTrigger) modelTrigger.onclick = openModelModal;
        if (closeModelModalBtn) closeModelModalBtn.onclick = closeModelModal;
        if (modelModal) modelModal.addEventListener('click', (e) => { if (e.target === modelModal) closeModelModal(); });
        if (msProvider) msProvider.onchange = () => msPopulateModels(msProvider.value, msReadValue());
        if (msModel) msModel.onchange = () => {
            if (msModel.value === '__custom__') { if (msModelCustom) msModelCustom.style.display = ''; }
            else { if (msModelCustom) msModelCustom.style.display = 'none'; msApplySelection(); }
        };
        if (msModelCustom) msModelCustom.oninput = () => msApplySelection();
        if (msApply) msApply.onclick = () => { msApplySelection(); closeModelModal(); };

        if (customApiBtn) customApiBtn.onclick = () => {
            showSettingsFragment(!STATE.showSettings);
        };

        if (promptInput) promptInput.oninput = (e) => {
            STATE.goal = e.target.value;
        };

        if (startBtn) startBtn.onclick = () => {
            if (!STATE.goal.trim()) {
                alert('Please enter a goal for the Autonomous Agent first.');
                return;
            }
            STATE.isExpanded = false;
            startAgent();
            STATE.panelOpen = true;
            updateHUD();
        };

        if (minimizeBtn) minimizeBtn.onclick = () => {
            STATE.panelOpen = false;
            updateHUD();
        };

        if (openConfigBtn) openConfigBtn.onclick = () => {
            STATE.panelOpen = false;
            STATE.isExpanded = true;
            updateHUD();
        };

        if (closePanelBtn) closePanelBtn.onclick = () => {
            stopAgent();
            STATE.panelOpen = false;
            updateHUD();
        };

        if (pauseBtn) pauseBtn.onclick = () => {
            if (STATE.isRunning) stopAgent();
            else startAgent();
        };

        if (stopBtn) stopBtn.onclick = () => {
            stopAgent();
            STATE.panelOpen = false;
            updateHUD();
        };

        // ===== Debug console log controls (Save / Copy / Clear / Verbose) =====
        const btnSaveLogs = shadowRoot.getElementById('btn-save-logs');
        const btnCopyLogs = shadowRoot.getElementById('btn-copy-logs');
        const btnClearLogs = shadowRoot.getElementById('btn-clear-logs');
        const btnToggleVerbose = shadowRoot.getElementById('btn-toggle-verbose');
        const consoleCount = shadowRoot.getElementById('console-count');

        function buildLogExport() {
            const cfg = getConfig();
            return {
                script: 'Autonomous Web Browser Agent (Kilo Server Edition)',
                exportedAt: new Date().toISOString(),
                pageUrl: window.location.href,
                pageTitle: document.title,
                goal: STATE.goal,
                steps: STATE.stepCount,
                mood: STATE.agentMood,
                status: STATE.statusText,
                provider: cfg.PROVIDER,
                model: cfg.KILO_MODEL,
                verbose: !!STATE.verbose,
                totalLogged: STATE.logCount || 0,
                savedEntries: STATE.debugLogs.length,
                logs: STATE.debugLogs.map(e => {
                    const o = { time: e.time, level: e.level, message: e.message, verbose: !!e.verbose };
                    if (e.details != null) o.details = e.details;
                    if (e.stack) o.stack = e.stack;
                    return o;
                })
            };
        }

        function saveLogs() {
            try {
                const payload = buildLogExport();
                const text = JSON.stringify(payload, null, 2);
                const blob = new Blob([text], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const stamp = payload.exportedAt.replace(/[:.]/g, '-');
                a.href = url;
                a.download = `apex-agent-logs-${stamp}.json`;
                (document.body || document.documentElement).appendChild(a);
                a.click();
                if (a.parentNode) a.parentNode.removeChild(a);
                setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) {} }, 2000);
                addLog('INFO', `Saved ${payload.savedEntries} log entries (${text.length} bytes) to JSON file.`);
            } catch (e) {
                addLog('ERR', `Failed to save logs: ${e && e.message ? e.message : e}`);
            }
        }

        function copyLogs() {
            try {
                const text = STATE.debugLogs.map(l => {
                    const d = l.details ? (typeof l.details === 'string' ? l.details : safeStringify(l.details, 2000)) : '';
                    return `[${l.time}] [${l.level}] ${l.message}${d ? ' :: ' + d : ''}`;
                }).join('\n');
                if (typeof GM_setClipboard !== 'undefined') {
                    GM_setClipboard(text);
                } else if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = text; (document.body || document.documentElement).appendChild(ta);
                    ta.select(); document.execCommand('copy'); if (ta.parentNode) ta.parentNode.removeChild(ta);
                }
                addLog('INFO', `Copied ${STATE.debugLogs.length} log entries to clipboard.`);
            } catch (e) {
                addLog('ERR', `Failed to copy logs: ${e && e.message ? e.message : e}`);
            }
        }

        function clearLogs() {
            try {
                STATE.debugLogs = [];
                renderConsole();
                addLog('INFO', 'In-memory logs cleared.');
            } catch (e) {
                addLog('ERR', `Failed to clear logs: ${e && e.message ? e.message : e}`);
            }
        }

        if (btnSaveLogs) btnSaveLogs.onclick = saveLogs;
        if (btnCopyLogs) btnCopyLogs.onclick = copyLogs;
        if (btnClearLogs) btnClearLogs.onclick = clearLogs;
        if (btnToggleVerbose) {
            btnToggleVerbose.onclick = () => {
                STATE.verbose = !STATE.verbose;
                btnToggleVerbose.innerText = '🔍 Verbose: ' + (STATE.verbose ? 'ON' : 'OFF');
                btnToggleVerbose.classList.toggle('active', STATE.verbose);
                const consoleEl = shadowRoot.getElementById('agent-console');
                if (consoleEl) consoleEl.classList.toggle('log-verbose-hidden', !STATE.verbose);
                renderConsole();
                addLog('INFO', `Verbose logging ${STATE.verbose ? 'ENABLED' : 'DISABLED'}.`);
                persistState();
            };
        }
        if (consoleCount) consoleCount.innerText = `(0)`;

        if (voiceBtn) voiceBtn.onclick = () => {
            try {
                if (window.SpeechRecognition || window.webkitSpeechRecognition) {
                    alert('Voice input is not yet wired to a recognition engine.');
                }
            } catch (e) {}
        };

        // Populate and save config
        const currentCfg = getConfig();
        const providerSel = shadowRoot.getElementById('cfg-provider');
        const apikeyInp = shadowRoot.getElementById('cfg-apikey');
        const kiloAuthInp = shadowRoot.getElementById('cfg-kiloauth');
        const kiloDirInp = shadowRoot.getElementById('cfg-kilodir');
        const kiloModelSel = shadowRoot.getElementById('cfg-kilomodel');
        const kiloModelCustom = shadowRoot.getElementById('cfg-kilomodel-custom');
        const kiloModelFilter = shadowRoot.getElementById('cfg-kilomodel-filter');
        const modelSel = shadowRoot.getElementById('cfg-model');
        const modelCustom = shadowRoot.getElementById('cfg-model-custom');
        const modelFilter = shadowRoot.getElementById('cfg-model-filter');
        const badgesToggle = shadowRoot.getElementById('cfg-badges-toggle');
        const heuristicToggle = shadowRoot.getElementById('cfg-heuristic-toggle');
        const llmRetriesInp = shadowRoot.getElementById('cfg-llm-retries');
        const verifyToggle = shadowRoot.getElementById('cfg-verify-toggle');

        providerSel.value = currentCfg.PROVIDER || 'devproject';
        apikeyInp.value = currentCfg.API_KEY || '';
        kiloAuthInp.value = currentCfg.KILO_AUTH || '';
        kiloDirInp.value = currentCfg.KILO_DIRECTORY || '/';
        badgesToggle.checked = !!currentCfg.ENABLE_BADGES;
        heuristicToggle.checked = !!currentCfg.ALLOW_HEURISTIC_FALLBACK;
        verifyToggle.checked = !!currentCfg.VERIFY_FIELDS;
        llmRetriesInp.value = (typeof currentCfg.LLM_RETRIES === 'number') ? currentCfg.LLM_RETRIES : 2;
        if (maxStepsInput) maxStepsInput.value = (typeof currentCfg.MAX_STEPS === 'number') ? currentCfg.MAX_STEPS : 35;
        if (domGlowToggle) domGlowToggle.checked = !!currentCfg.ENABLE_BADGES;
        if (autoExecToggle) autoExecToggle.checked = currentCfg.AUTO_EXECUTE !== false;
        if (modelNameLabel) {
            modelNameLabel.innerText = currentCfg.KILO_MODEL || 'kilo-auto/free';
        }

        // Server selection (DevProject 4096 / Kilo 4097 / Custom).
        if (serverSel) serverSel.value = currentCfg.SERVER || 'devproject';
        if (aiBaseInp) aiBaseInp.value = currentCfg.KILO_AI_BASE || 'https://devproject.vip/ai';
        if (baseUrlInp) baseUrlInp.value = currentCfg.BASE_URL || 'https://devproject.vip/v1';
        if (typeof applyServerPreset === 'function') applyServerPreset();

        // Persist ALL settings (server, provider, models, toggles, etc.) live so the
        // state is never lost even if the user closes the modal without pressing Save.
        function saveConfigFromUI() {
            let retries = parseInt(llmRetriesInp.value, 10);
            if (isNaN(retries) || retries < 0) retries = 0;
            let maxSteps = parseInt(maxStepsInput ? maxStepsInput.value : '', 10);
            if (isNaN(maxSteps) || maxSteps < 1) maxSteps = 35;
            const server = serverSel ? serverSel.value : 'devproject';
            setConfig({
                SERVER: server,
                KILO_AI_BASE: (aiBaseInp && aiBaseInp.value.trim()) || 'https://devproject.vip/ai',
                BASE_URL: (baseUrlInp && baseUrlInp.value.trim()) || 'https://devproject.vip/v1',
                PROVIDER: providerSel.value,
                API_KEY: apikeyInp.value.trim(),
                KILO_AUTH: kiloAuthInp.value.trim(),
                KILO_DIRECTORY: kiloDirInp.value.trim() || '/',
                KILO_MODEL: readModelValue(kiloModelSel, kiloModelCustom) || 'kilo-auto/free',
                MODEL: getConfig().MODEL || 'kilo-auto/free',
                ENABLE_BADGES: badgesToggle.checked,
                ALLOW_HEURISTIC_FALLBACK: heuristicToggle.checked,
                ALLOW_TOOLS: false,
                VERIFY_FIELDS: verifyToggle.checked,
                AUTO_EXECUTE: !!(autoExecToggle && autoExecToggle.checked),
                MAX_STEPS: maxSteps,
                LLM_RETRIES: retries
            });
            if (domGlowToggle && badgesToggle) domGlowToggle.checked = badgesToggle.checked;
            if (modelNameLabel && typeof readModelValue === 'function') {
                const m = readModelValue(kiloModelSel, kiloModelCustom) || 'kilo-auto/free';
                modelNameLabel.innerText = m;
            }
        }

        // Auto-save whenever any field changes so models and settings always persist.
        [serverSel, aiBaseInp, baseUrlInp, providerSel, apikeyInp, kiloAuthInp, kiloDirInp,
         kiloModelSel, kiloModelCustom, badgesToggle,
         heuristicToggle, verifyToggle, llmRetriesInp, maxStepsInput, domGlowToggle, autoExecToggle
        ].forEach(el => {
            if (!el) return;
            el.addEventListener('change', saveConfigFromUI);
            if (el.type === 'text' || el.type === 'password' || el.type === 'number') {
                el.addEventListener('input', saveConfigFromUI);
            }
        });

        // --- 4096 model picker (Provider + Model, with 🆓 Free Models group) ---
        const provPicker = shadowRoot.getElementById('cfg-provpicker');
        fetchProviderModelMap().then((map0) => {
            if (provPicker) {
                provPicker.innerHTML = '';
                const fo = document.createElement('option'); fo.value = 'free'; fo.textContent = '🆓 Free Models'; provPicker.appendChild(fo);
                map0.providers.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name || p.id; provPicker.appendChild(o); });
            }
            const populateKilo = (provId, currentValue) => {
                const ids = (provId === 'free') ? map0.free : ((map0.providers.find(p => p.id === provId) || { models: [] }).models);
                kiloModelSel.innerHTML = '';
                ids.slice().sort().forEach(id => { const o = document.createElement('option'); o.value = id; o.textContent = id; o.dataset.model = id.toLowerCase(); kiloModelSel.appendChild(o); });
                const co = document.createElement('option'); co.value = '__custom__'; co.textContent = '✏️ Custom…'; kiloModelSel.appendChild(co);
                if (currentValue && ids.includes(currentValue)) { kiloModelSel.value = currentValue; if (kiloModelCustom) kiloModelCustom.style.display = 'none'; }
                else if (currentValue) { kiloModelSel.value = '__custom__'; if (kiloModelCustom) { kiloModelCustom.style.display = ''; kiloModelCustom.value = currentValue; } }
                else { kiloModelSel.value = '__custom__'; if (kiloModelCustom) kiloModelCustom.style.display = ''; }
            };
            const curKilo = currentCfg.KILO_MODEL || 'kilo-auto/free';
            let curProv = 'free';
            for (const p of map0.providers) { if (p.models.includes(curKilo)) { curProv = p.id; break; } }
            if (map0.free.includes(curKilo)) curProv = 'free';
            if (provPicker) provPicker.value = curProv;
            populateKilo(curProv, curKilo);
            if (provPicker) provPicker.onchange = () => populateKilo(provPicker.value, readModelValue(kiloModelSel, kiloModelCustom));
        });
        if (kiloModelSel) kiloModelSel.onchange = () => { if (kiloModelSel.value === '__custom__') { if (kiloModelCustom) kiloModelCustom.style.display = ''; } else { if (kiloModelCustom) kiloModelCustom.style.display = 'none'; } };

        saveCfgBtn.onclick = () => {
            saveConfigFromUI();
            STATE.showSettings = false;
            showSettingsFragment(false);
            addLog('INFO', 'Saved updated configuration.');
        };
    }

    function renderConsole() {
        if (!shadowRoot) return;
        const consoleEl = shadowRoot.getElementById('agent-console');
        if (!consoleEl) return;

        const countEl = shadowRoot.getElementById('console-count');
        if (countEl) countEl.innerText = `(${STATE.debugLogs.length}${STATE.logCount && STATE.logCount !== STATE.debugLogs.length ? ' of ' + STATE.logCount : ''})`;

        if (STATE.debugLogs.length === 0) {
            consoleEl.innerHTML = '<div class="log-line" style="color:#64748b; font-style:italic;">Listening for DOM events & autonomous steps...</div>';
            return;
        }

        // Hide verbose entries unless verbose mode is on.
        const showVerbose = !!STATE.verbose;
        const visible = STATE.debugLogs.filter(l => showVerbose || !l.verbose);
        const shown = visible.slice(-75);

        consoleEl.innerHTML = shown.map(l => `
            <div class="log-line${l.verbose ? ' log-verbose' : ''}">
                <span style="color:#64748b;">[${String(l.time).split('.')[0]}]</span>
                <span class="log-badge badge-${l.level}">${l.level}</span>
                <span style="color:#e2e8f0;">${l.message.replace(/</g, '&lt;')}</span>
                ${l.details ? `<span style="color:#94a3b8;">${String(l.details).replace(/</g, '&lt;').slice(0, 240)}</span>` : ''}
            </div>
        `).join('');
        consoleEl.classList.toggle('log-verbose-hidden', !showVerbose);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    function updateHUD() {
        if (!shadowRoot) return;

        const agentFab = shadowRoot.getElementById('agent-fab');
        if (agentFab) agentFab.setAttribute('data-mood', STATE.agentMood);

        // Overlay visibility (config sheet + full-screen reasoning panel).
        const sheetVisible = STATE.isExpanded && !STATE.panelOpen;
        const panelVisible = STATE.panelOpen;
        const configSheet = shadowRoot.getElementById('agent-config-sheet');
        const fullscreenPanel = shadowRoot.getElementById('agent-fullscreen-panel');
        if (configSheet) configSheet.classList.toggle('open', sheetVisible);
        if (fullscreenPanel) fullscreenPanel.classList.toggle('open', panelVisible);
        if (hostEl) hostEl.classList.toggle('panel-open', STATE.isExpanded || STATE.panelOpen);

        // Drive the minimized status pill from the agent's current state.
        const pillWrapper = shadowRoot.getElementById('agent-pill-wrapper');
        if (pillWrapper) {
            const mood = STATE.agentMood || 'idle';
            const stateName = mood === 'scanning' ? 'thinking' : (mood === 'error' ? 'alert' : mood);
            pillWrapper.classList.remove('state-thinking', 'state-acting', 'state-done', 'state-error', 'state-alert', 'state-idle', 'state-scanning');
            pillWrapper.classList.add('state-' + stateName);
            const pillText = pillWrapper.querySelector('.status-text');
            if (pillText) {
                const labels = { scanning: 'Scanning…', thinking: 'Thinking…', acting: 'Acting…', done: 'Done', error: 'Error', idle: 'Idle' };
                // While a run is in progress, show the LIVE status (e.g. "Synthesizing plan… (12s)")
                // so the pill never reads "Idle" while the agent is actually still working.
                if (STATE.isRunning && STATE.statusText) {
                    const live = STATE.statusText;
                    pillText.innerText = live.length > 34 ? live.slice(0, 33) + '…' : live;
                } else {
                    pillText.innerText = (mood === 'error') ? 'Error' : (STATE.isRunning ? (labels[mood] || 'Working…') : 'Idle');
                }
            }
        }
        const pillPauseBtn = shadowRoot.getElementById('pill-pause-btn');
        if (pillPauseBtn) {
            pillPauseBtn.innerHTML = STATE.isRunning
                ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
                : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            pillPauseBtn.setAttribute('aria-label', STATE.isRunning ? 'Pause' : 'Start');
        }

        // Keep the Custom API (detailed settings) section in sync.
        const customApiSection = shadowRoot.getElementById('custom-api-section');
        if (customApiSection) customApiSection.style.display = STATE.showSettings ? 'flex' : 'none';

        // Config sheet fields.
        const promptInput = shadowRoot.getElementById('agent-prompt-input');
        if (promptInput && !STATE.isRunning && document.activeElement !== promptInput && promptInput.value !== STATE.goal) {
            promptInput.value = STATE.goal;
        }
        const maxStepsInput = shadowRoot.getElementById('input-max-steps');
        if (maxStepsInput && document.activeElement !== maxStepsInput) {
            const cfg = getConfig();
            maxStepsInput.value = (typeof cfg.MAX_STEPS === 'number') ? cfg.MAX_STEPS : 35;
        }

        // Full-screen reasoning panel.
        const fsStatusTitle = shadowRoot.getElementById('fs-status-title');
        if (fsStatusTitle) {
            const titles = { scanning: 'AGENT SCANNING', thinking: 'AGENT THINKING', acting: 'AGENT ACTING', done: 'AGENT DONE', error: 'AGENT ERROR', idle: 'AGENT IDLE' };
            let title = titles[STATE.agentMood] || 'AGENT WORKING';
            if (STATE.agentMood === 'error' && STATE.statusText) {
                title = (STATE.statusText.length > 48 ? STATE.statusText.slice(0, 47) + '…' : STATE.statusText);
            }
            fsStatusTitle.innerText = title;
            const ind = shadowRoot.querySelector('.pulse-indicator');
            if (ind) ind.style.background = STATE.agentMood === 'error' ? 'var(--amber-glow,#ffb300)' : 'var(--cyan-glow,#00f2fe)';
        }
        const fsProgressFill = shadowRoot.getElementById('fs-progress-fill');
        if (fsProgressFill) {
            const cfg = getConfig();
            const pct = cfg.MAX_STEPS ? Math.min(100, Math.round((STATE.stepCount / cfg.MAX_STEPS) * 100)) : 0;
            fsProgressFill.style.width = pct + '%';
        }
        const fsGoalText = shadowRoot.getElementById('fs-goal-text');
        if (fsGoalText) fsGoalText.innerText = STATE.goal || '';
        const fsReasoningFeed = shadowRoot.getElementById('fs-reasoning-feed');
        if (fsReasoningFeed) {
            const escapeHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
            if (!STATE.history.length) {
                fsReasoningFeed.innerHTML = '<li class="reasoning-step"><span class="step-text" style="color:rgba(255,255,255,.4)">No steps yet…</span></li>';
            } else {
                fsReasoningFeed.innerHTML = STATE.history.map(h => {
                    const isLast = h.step === STATE.stepCount;
                    const cls = isLast ? 'reasoning-step active' : 'reasoning-step completed';
                    const badge = isLast ? 'In Progress' : 'Completed';
                    const icon = isLast ? '<span class="step-icon active-glow">▶</span>' : '<span class="step-icon">✓</span>';
                    const text = escapeHtml(h.thought || h.action || ('Step ' + h.step));
                    return '<li class="' + cls + '">' + icon + '<span class="step-text">' + text + '</span><span class="step-badge">' + badge + '</span></li>';
                }).join('');
            }
        }
        const pauseLabel = shadowRoot.getElementById('pause-agent-label');
        if (pauseLabel) pauseLabel.innerText = STATE.isRunning ? 'PAUSE' : 'RESUME';

        // Keep the verbose toggle + console count in sync with state.
        const btnToggleVerbose = shadowRoot.getElementById('btn-toggle-verbose');
        if (btnToggleVerbose) {
            btnToggleVerbose.innerText = '🔍 Verbose: ' + (STATE.verbose ? 'ON' : 'OFF');
            btnToggleVerbose.classList.toggle('active', !!STATE.verbose);
        }
        const consoleEl2 = shadowRoot.getElementById('agent-console');
        if (consoleEl2) consoleEl2.classList.toggle('log-verbose-hidden', !STATE.verbose);
        renderConsole();
    }

    function ensureHUD() {
        const bodyOrDoc = document.body || document.documentElement;
        if (!bodyOrDoc) return;

        const host = document.getElementById('auto-agent-host');
        if (!host || !host.isConnected) {
            if (host && host.parentNode) {
                try { host.parentNode.removeChild(host); } catch (e) {}
            }
            hostEl = null;
            shadowRoot = null;
            buildHUD();
            updateHUD();
        }
    }

    // =========================================================================
    // 8. BOOTSTRAP USERSCRIPT
    // =========================================================================
    function init() {
        ensureHUD();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                ensureHUD();
                addLog('INFO', 'Autonomous Browser Agent v8.10 ready.');
                maybeResumeRun();
            });
        } else {
            ensureHUD();
            addLog('INFO', 'Autonomous Browser Agent v8.10 ready.');
            maybeResumeRun();
        }

        // Periodically monitor DOM to ensure SPA route transitions never detach the HUD floating FAB/pill
        setInterval(ensureHUD, 1000);
    }

    // Resume a run that was in-progress when the previous page navigated away.
    function maybeResumeRun() {
        if (typeof GM_getValue === 'undefined' && typeof localStorage === 'undefined') return;
        const wasRunning = loadPersistedState();
        if (!wasRunning) {
            updateHUD();
            return;
        }
        // Repopulate the goal box and HUD, then continue the loop on this new page.
        const goalInput = shadowRoot && shadowRoot.getElementById('agent-prompt-input');
        if (goalInput) goalInput.value = STATE.goal;
        // If a run was in progress, reopen the full-screen reasoning panel.
        if (STATE.isRunning) STATE.panelOpen = true;
        STATE.agentMood = STATE.agentMood === 'error' ? 'idle' : STATE.agentMood;
        addLog('INFO', `Resuming agent run on new page (step ${STATE.stepCount}) — goal: "${STATE.goal}"`);
        updateHUD();
        setTimeout(() => {
            if (STATE.isRunning) runAgentStep();
        }, 700);
    }

    init();

    // Test/debug hook: expose the planner + helpers so they can be driven from a
    // headless harness (e.g. a mock OpenCode server) without a browser. Only used
    // for automated testing — harmless in production.
    try {
        const hookTarget = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : (typeof window !== 'undefined' ? window : null);
        if (hookTarget) {
            hookTarget.__apexAgent = {
                getConfig, setConfig, requestKiloPlan, createKiloSession,
                cleanAndValidatePlan, collectPartText, buildAgentSystemPrompt,
                kiloApiRequest, getEndpointAndHeaders, DEFAULT_CONFIG
            };
        }
    } catch (e) {}
})();
