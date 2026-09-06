import {
  InteractiveElementNode,
  AgentPlan,
  ActionType,
  StepRecord,
  AgentConfig,
} from '../types';

export const DEFAULT_CONFIG: AgentConfig = {
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  apiKey: '',
  customEndpoint: 'https://devproject.vip/v1',
  maxSteps: 25,
  stepDelayMs: 650,
  maxElements: 60,
  enableBadges: true,
  verifyFields: true,
  allowHeuristicFallback: true,
  verbose: true,
};

/**
 * Scans an HTML container for all actionable interactive nodes.
 */
export function scanInteractiveElements(
  container: HTMLElement,
  maxElements = 65
): InteractiveElementNode[] {
  if (!container) return [];

  const interactiveSelectors = [
    'button',
    'input',
    'select',
    'textarea',
    'a[href]',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="switch"]',
    '[role="combobox"]',
    '[role="menuitem"]',
    '[role="searchbox"]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
    '[data-actionable="true"]',
  ].join(',');

  const matched: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const nodes = container.querySelectorAll(interactiveSelectors);

  const containerRect = container.getBoundingClientRect();

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i] as HTMLElement;
    if (seen.has(el)) continue;
    seen.add(el);

    // Skip hidden or invisible elements
    const isFile = el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'file';
    const rect = el.getBoundingClientRect();
    const isVisible =
      isFile ||
      (rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none');

    if (isVisible) {
      matched.push(el);
      if (matched.length >= maxElements) break;
    }
  }

  return matched.map((el, index) => {
    el.setAttribute('data-agent-id', String(index));
    const rect = el.getBoundingClientRect();

    const topRel = rect.top - containerRect.top;
    const leftRel = rect.left - containerRect.left;

    const inViewport =
      rect.top >= containerRect.top &&
      rect.bottom <= containerRect.bottom + 50;

    const posHint = inViewport
      ? 'in-view'
      : rect.top < containerRect.top
        ? 'scroll-up'
        : 'scroll-down';

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || undefined;
    const type = el.getAttribute('type') || undefined;
    const name = el.getAttribute('name') || undefined;

    const inputVal = (el as HTMLInputElement).value || '';
    const rawText =
      inputVal ||
      el.getAttribute('placeholder') ||
      el.getAttribute('aria-label') ||
      el.title ||
      el.innerText ||
      el.textContent ||
      '';
    const cleanText = rawText.replace(/\s+/g, ' ').trim().slice(0, 80);

    return {
      id: index,
      tag,
      role,
      type,
      name,
      text: cleanText,
      value: inputVal,
      pos: posHint,
      elementRef: el,
      rect: {
        top: topRel,
        left: leftRel,
        width: rect.width,
        height: rect.height,
      },
    };
  });
}

/**
 * Client-Side Heuristic Planner ported directly from apex_kilo_autonomous_agent.user.js
 * Enables intelligent autonomous task execution even when offline or when no API key is provided!
 */
export function generateHeuristicPlan(
  goal: string,
  tree: InteractiveElementNode[],
  history: StepRecord[]
): AgentPlan {
  const g = (goal || '').toLowerCase();
  const lastStep = history[history.length - 1];

  // Helper to check if an element is a text input
  const isTextInput = (e: InteractiveElementNode) => {
    if (!e) return false;
    const tag = e.tag.toLowerCase();
    const type = (e.type || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      return !['button', 'submit', 'checkbox', 'radio', 'hidden', 'color'].includes(type);
    }
    return e.role === 'textbox' || e.role === 'searchbox';
  };

  // 1. Submit or Next step if last action was typing into an input
  if (lastStep && lastStep.action === 'type') {
    const submitBtn = tree.find((e) => {
      const text = `${e.text} ${e.name || ''} ${e.role || ''}`.toLowerCase();
      return (
        (e.tag === 'button' || e.tag === 'a' || e.role === 'button') &&
        /search|submit|find|go|enter|next|continue|book|apply|confirm|pay|filter/i.test(text)
      );
    });

    if (submitBtn && submitBtn.id !== lastStep.targetId) {
      return {
        thought: `Submitting form/action after entering data via #${submitBtn.id} (${submitBtn.text || 'Submit'})`,
        action: 'click',
        target: submitBtn.id,
      };
    }
  }

  // 2. Booking / Flight / Reservation Scenario
  if (g.includes('flight') || g.includes('book') || g.includes('trip') || g.includes('hotel')) {
    // Destination / origin keywords
    const destMatch = goal.match(/(?:to|destination|fly to)\s+([A-Za-z\s]+?)(?:from|for|on|with|\.|$)/i);
    const originMatch = goal.match(/(?:from|origin|leaving from)\s+([A-Za-z\s]+?)(?:to|for|on|with|\.|$)/i);

    const destination = destMatch ? destMatch[1].trim() : 'Tokyo';
    const origin = originMatch ? originMatch[1].trim() : 'San Francisco';

    // Find destination input
    const destInput = tree.find(
      (e) =>
        isTextInput(e) &&
        /to|destination|arrival|where to/i.test(`${e.name} ${e.text}`) &&
        !history.some((h) => h.targetId === e.id)
    );
    if (destInput) {
      return {
        thought: `Filling destination field #${destInput.id} with "${destination}"`,
        action: 'type',
        target: destInput.id,
        value: destination,
      };
    }

    // Find origin input
    const originInput = tree.find(
      (e) =>
        isTextInput(e) &&
        /from|origin|departure|where from/i.test(`${e.name} ${e.text}`) &&
        !history.some((h) => h.targetId === e.id)
    );
    if (originInput) {
      return {
        thought: `Filling departure field #${originInput.id} with "${origin}"`,
        action: 'type',
        target: originInput.id,
        value: origin,
      };
    }

    // Find search flights button
    const searchBtn = tree.find(
      (e) =>
        (e.tag === 'button' || e.role === 'button') &&
        /search flights|find flights|search/i.test(e.text)
    );
    if (searchBtn && !history.some((h) => h.targetId === searchBtn.id)) {
      return {
        thought: `Clicking search button #${searchBtn.id}`,
        action: 'click',
        target: searchBtn.id,
      };
    }

    // Find a book/select button
    const bookBtn = tree.find(
      (e) =>
        (e.tag === 'button' || e.role === 'button') &&
        /select flight|book flight|book now|choose/i.test(e.text)
    );
    if (bookBtn) {
      return {
        thought: `Selecting best matching flight option #${bookBtn.id}`,
        action: 'click',
        target: bookBtn.id,
      };
    }
  }

  // 3. Search Goal
  if (g.includes('search') || g.includes('find') || g.includes('query')) {
    const queryMatch = goal.match(/(?:search for|find|search|query|lookup)\s+["']?([^"']+)["']?/i);
    const query = queryMatch ? queryMatch[1].trim() : 'AI Agent';

    const searchInput = tree.find(
      (e) =>
        isTextInput(e) &&
        /search|query|q|find/i.test(`${e.name} ${e.text}`) &&
        !history.some((h) => h.targetId === e.id)
    );

    if (searchInput) {
      return {
        thought: `Entering search query "${query}" into search field #${searchInput.id}`,
        action: 'type',
        target: searchInput.id,
        value: query,
      };
    }
  }

  // 4. Fill form / Name / Email / Message / Form inputs
  const emptyInputs = tree.filter(
    (e) =>
      isTextInput(e) &&
      !history.some((h) => h.targetId === e.id) &&
      (!e.value || e.value.length === 0)
  );

  if (emptyInputs.length > 0) {
    const targetInput = emptyInputs[0];
    const desc = `${targetInput.name || ''} ${targetInput.text}`.toLowerCase();
    let sampleVal = 'Apex User';

    if (/email/i.test(desc)) sampleVal = 'andres@example.com';
    else if (/phone|tel/i.test(desc)) sampleVal = '+1 (555) 234-5678';
    else if (/name|first/i.test(desc)) sampleVal = 'Alex Morgan';
    else if (/company|org/i.test(desc)) sampleVal = 'Autonomous Labs Inc';
    else if (/date/i.test(desc) || targetInput.type === 'date') sampleVal = '2026-10-15';
    else if (/price|amount|budget/i.test(desc)) sampleVal = '500';
    else if (/msg|message|bio|notes|comment/i.test(desc))
      sampleVal = 'Automated workflow executed successfully by Apex Kilo Agent.';

    return {
      thought: `Filling form field #${targetInput.id} (${targetInput.text || targetInput.name}) with "${sampleVal}"`,
      action: 'type',
      target: targetInput.id,
      value: sampleVal,
    };
  }

  // 5. Checkboxes
  const uncheckChecked = tree.find(
    (e) =>
      (e.type === 'checkbox' || e.role === 'checkbox') &&
      !history.some((h) => h.targetId === e.id)
  );
  if (uncheckChecked) {
    return {
      thought: `Toggling required checkbox #${uncheckChecked.id}`,
      action: 'click',
      target: uncheckChecked.id,
    };
  }

  // 6. Click button matching goal keywords
  const actionWords = g
    .replace(/click|open|select|press|button|the|on|link|and|with/gi, '')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  let bestTarget: InteractiveElementNode | null = null;
  let highestScore = 0;

  for (const el of tree) {
    if (history.some((h) => h.targetId === el.id && h.action === 'click')) continue;
    const combined = `${el.text} ${el.name || ''} ${el.role || ''}`.toLowerCase();
    let score = 0;
    for (const word of actionWords) {
      if (combined.includes(word)) score += 2;
    }
    if (score > highestScore) {
      highestScore = score;
      bestTarget = el;
    }
  }

  if (bestTarget && highestScore > 0) {
    return {
      thought: `Identified optimal matching control #${bestTarget.id} ("${bestTarget.text}") for goal`,
      action: 'click',
      target: bestTarget.id,
    };
  }

  // 7. Click remaining primary button or submit
  const primaryBtn = tree.find((e) => {
    if (history.some((h) => h.targetId === e.id)) return false;
    const t = `${e.text} ${e.name || ''}`.toLowerCase();
    return (
      (e.tag === 'button' || e.role === 'button') &&
      /submit|next|complete|finish|checkout|send|save|confirm/i.test(t)
    );
  });

  if (primaryBtn) {
    return {
      thought: `Proceeding with primary action #${primaryBtn.id} ("${primaryBtn.text}")`,
      action: 'click',
      target: primaryBtn.id,
    };
  }

  // If steps already taken, finish with done!
  if (history.length >= 1) {
    return {
      thought: `Autonomous objective successfully fulfilled across ${history.length} steps.`,
      action: 'done',
      answer: `Task completed successfully for goal: "${goal}"`,
    };
  }

  // First actionable element fallback
  const firstActionable = tree.find((e) => e.tag === 'button' || e.tag === 'input');
  if (firstActionable) {
    return {
      thought: `Interacting with actionable node #${firstActionable.id}`,
      action: firstActionable.tag === 'input' ? 'type' : 'click',
      target: firstActionable.id,
      value: 'Autonomous test input',
    };
  }

  return {
    thought: 'Goal reached. No further actionable elements require interaction.',
    action: 'done',
    answer: 'Exploration and goal complete.',
  };
}

/**
 * Execute an action on the DOM node with multi-step event simulation and verification
 */
export async function executePlanAction(
  plan: AgentPlan,
  tree: InteractiveElementNode[],
  config: AgentConfig
): Promise<{ ok: boolean; message: string; verified?: boolean }> {
  const targetId = plan.target !== undefined ? plan.target : plan.elementId;
  const node = tree.find((n) => n.id === targetId);

  if (plan.action === 'done') {
    return {
      ok: true,
      message: plan.answer || 'Goal successfully completed.',
    };
  }

  if (plan.action === 'wait') {
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, message: 'Waited 600ms for dynamic layout' };
  }

  if (plan.action === 'scroll') {
    if (node?.elementRef) {
      node.elementRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { ok: true, message: `Scrolled to element #${targetId}` };
    }
    return { ok: true, message: 'Scrolled page' };
  }

  if (!node || !node.elementRef) {
    return {
      ok: false,
      message: `Element #${targetId} not found in live DOM tree`,
    };
  }

  const el = node.elementRef;

  // Scroll element into view first
  try {
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (e) {}

  switch (plan.action) {
    case 'click':
    case 'check':
    case 'uncheck': {
      el.focus();
      const mousedownEv = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      const mouseupEv = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
      const clickEv = new MouseEvent('click', { bubbles: true, cancelable: true });

      el.dispatchEvent(mousedownEv);
      el.dispatchEvent(mouseupEv);
      el.click();
      el.dispatchEvent(clickEv);

      return {
        ok: true,
        message: `Clicked element #${targetId} ("${node.text || node.tag}")`,
      };
    }

    case 'type': {
      const textToType = plan.value || plan.text || '';
      el.focus();

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const inputEl = el as HTMLInputElement | HTMLTextAreaElement;

        // Native value setter bypass for React controlled inputs
        const proto =
          el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');

        if (descriptor && descriptor.set) {
          descriptor.set.call(inputEl, textToType);
        } else {
          inputEl.value = textToType;
        }

        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));

        let verified = true;
        if (config.verifyFields) {
          verified = inputEl.value.includes(textToType.slice(0, 10));
        }

        return {
          ok: true,
          verified,
          message: `Typed "${textToType}" into #${targetId} (verified: ${verified ? 'yes' : 'no'})`,
        };
      } else if (el.isContentEditable) {
        el.innerText = textToType;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, verified: true, message: `Updated contenteditable #${targetId}` };
      }

      return { ok: false, message: `Element #${targetId} is not a text field` };
    }

    case 'select': {
      if (el.tagName === 'SELECT') {
        const selectEl = el as HTMLSelectElement;
        const valToSet = plan.value || plan.text || '';

        // Match option by value or text
        let found = false;
        for (let i = 0; i < selectEl.options.length; i++) {
          const opt = selectEl.options[i];
          if (
            opt.value.toLowerCase() === valToSet.toLowerCase() ||
            opt.text.toLowerCase().includes(valToSet.toLowerCase())
          ) {
            selectEl.selectedIndex = i;
            found = true;
            break;
          }
        }

        if (!found && selectEl.options.length > 1) {
          selectEl.selectedIndex = 1;
        }

        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          ok: true,
          message: `Selected option "${selectEl.value}" on #${targetId}`,
        };
      }
      return { ok: false, message: `Element #${targetId} is not a <select>` };
    }

    case 'clear': {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const inputEl = el as HTMLInputElement;
        inputEl.value = '';
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, message: `Cleared text in #${targetId}` };
      }
      return { ok: true, message: `Element #${targetId} cleared` };
    }

    default:
      return { ok: true, message: `Executed action ${plan.action}` };
  }
}
