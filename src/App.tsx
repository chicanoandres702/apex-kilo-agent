import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  InteractiveElementNode,
  AgentMood,
  StepRecord,
  LogEntry,
  AgentConfig,
  TestScenario,
  AgentPlan,
} from './types';
import {
  DEFAULT_CONFIG,
  scanInteractiveElements,
  generateHeuristicPlan,
  executePlanAction,
} from './lib/agentEngine';
import { Header } from './components/Header';
import { BrowserExtensionFrame } from './components/BrowserExtensionFrame';
import { TestArena } from './components/TestArena';
import { AgentHud } from './components/AgentHud';
import { BadgesOverlay } from './components/BadgesOverlay';
import { ElementInspectorCard } from './components/ElementInspectorCard';
import { LiveConsole } from './components/LiveConsole';
import { SettingsModal } from './components/SettingsModal';
import { ScriptExportModal } from './components/ScriptExportModal';

const SCENARIOS: TestScenario[] = [
  {
    id: 'flight',
    title: 'Flight Booking',
    category: 'Travel',
    description: 'Autonomous flight query, selection and ticket confirmation',
    suggestedGoal: 'Search flights to Tokyo and select the first available flight',
  },
  {
    id: 'ecommerce',
    title: 'E-Commerce Store',
    category: 'Shopping',
    description: 'Product browsing, adding to cart, discount code and checkout',
    suggestedGoal: 'Add headphones to cart, enter shipping address, and complete checkout',
  },
  {
    id: 'job',
    title: 'Talent Application',
    category: 'Forms',
    description: 'Multi-input candidate application form with terms agreement',
    suggestedGoal: 'Apply for the Full Stack AI Engineer position, agree to terms, and submit',
  },
  {
    id: 'search',
    title: 'Search Engine',
    category: 'Traversal',
    description: 'Search input, filter selection, and result link traversal',
    suggestedGoal: 'Search for Apex Kilo and click the userscript result link',
  },
  {
    id: 'custom',
    title: 'HTML Sandbox',
    category: 'Custom',
    description: 'Custom DOM testing environment for user-defined forms',
    suggestedGoal: 'Fill in username and submit request',
  },
];

export function App() {
  const arenaRef = useRef<HTMLDivElement>(null);

  // Configuration
  const [config, setConfig] = useState<AgentConfig>(() => {
    try {
      const saved = localStorage.getItem('apex_kilo_config');
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  // Current Scenario
  const [currentScenario, setCurrentScenario] = useState<string>('flight');
  const [goal, setGoal] = useState<string>(SCENARIOS[0].suggestedGoal);

  // Agent State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [mood, setMood] = useState<AgentMood>('idle');
  const [statusText, setStatusText] = useState<string>('Ready for instructions.');
  const [stepCount, setStepCount] = useState<number>(0);
  const [history, setHistory] = useState<StepRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Interactive Elements & Badges
  const [elements, setElements] = useState<InteractiveElementNode[]>([]);
  const [activeElementId, setActiveElementId] = useState<number | null>(null);

  // Inspect Mode State
  const [inspectMode, setInspectMode] = useState<boolean>(false);
  const [inspectedElement, setInspectedElement] = useState<InteractiveElementNode | null>(null);

  // Modals
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScriptExportOpen, setIsScriptExportOpen] = useState(false);

  // Persist config changes
  const handleConfigChange = (newCfg: AgentConfig) => {
    setConfig(newCfg);
    try {
      localStorage.setItem('apex_kilo_config', JSON.stringify(newCfg));
    } catch {}
  };

  // Logger helper
  const addLog = useCallback(
    (level: LogEntry['level'], message: string, details?: any) => {
      const entry: LogEntry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        time: new Date().toLocaleTimeString(),
        level,
        message,
        details,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 1000));
    },
    []
  );

  // DOM Scanning function
  const scanArenaDOM = useCallback(() => {
    if (!arenaRef.current) return [];
    const scanned = scanInteractiveElements(arenaRef.current, config.maxElements);
    setElements(scanned);
    return scanned;
  }, [config.maxElements]);

  // Initial scan & scan on scenario change
  useEffect(() => {
    const timer = setTimeout(() => {
      const nodes = scanArenaDOM();
      addLog('DOM', `Target container scanned: ${nodes.length} actionable nodes detected.`, {
        scenario: currentScenario,
        nodesCount: nodes.length,
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [currentScenario, scanArenaDOM, addLog]);

  // ResizeObserver to update badge positions on window or container resize
  useEffect(() => {
    if (!arenaRef.current) return;
    const observer = new ResizeObserver(() => {
      scanArenaDOM();
    });
    observer.observe(arenaRef.current);
    return () => observer.disconnect();
  }, [scanArenaDOM]);

  // Select Scenario
  const handleSelectScenario = (sc: TestScenario) => {
    if (isRunning) {
      handleStop();
    }
    setCurrentScenario(sc.id);
    setGoal(sc.suggestedGoal);
    setStepCount(0);
    setHistory([]);
    setActiveElementId(null);
    setInspectedElement(null);
    setMood('idle');
    setStatusText(`Scenario switched to "${sc.title}". Ready.`);
  };

  // Autonomous Execution Step
  const executeAutonomousStep = async (
    currentStepNum: number,
    currentHistory: StepRecord[]
  ): Promise<{ shouldContinue: boolean; newHistory: StepRecord[] }> => {
    if (!arenaRef.current) {
      return { shouldContinue: false, newHistory: currentHistory };
    }

    // Step 1: Rescan DOM
    setMood('scanning');
    setStatusText('Analyzing live DOM tree & interactive nodes...');
    const currentNodes = scanArenaDOM();

    if (currentNodes.length === 0) {
      setMood('error');
      setStatusText('No actionable elements found on target stage.');
      addLog('ERR', 'DOM scan returned 0 actionable elements');
      return { shouldContinue: false, newHistory: currentHistory };
    }

    // Step 2: Plan Generation
    setMood('reasoning');
    setStatusText(`Planner reasoning on Step #${currentStepNum + 1}...`);
    addLog(
      'PLAN',
      `Requesting plan for goal: "${goal}" (${config.provider} / ${config.model})`,
      { nodesCount: currentNodes.length }
    );

    let plan: AgentPlan | null = null;

    // Call server plan endpoint if Gemini/devproject/kilo is selected
    if (config.provider !== 'heuristic') {
      try {
        const response = await fetch('/api/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            goal,
            tree: currentNodes,
            history: currentHistory,
            provider: config.provider,
            model: config.model,
            customApiKey: config.apiKey || undefined,
            customEndpoint: config.customEndpoint || undefined,
          }),
        });

        const data = await response.json();
        if (data.ok && data.plan) {
          plan = data.plan;
          addLog('PLAN', `Planner response: ${plan?.thought || ''}`, plan);
        } else if (data.fallbackToHeuristic && config.allowHeuristicFallback) {
          addLog(
            'WARN',
            'Remote planner unavailable — falling back to client Heuristic Engine'
          );
        }
      } catch (err: any) {
        addLog('ERR', `Network error during plan request: ${err.message}`);
      }
    }

    // Client-side Heuristic Engine Fallback
    if (!plan) {
      plan = generateHeuristicPlan(goal, currentNodes, currentHistory);
      addLog('PLAN', `[Heuristic Engine] Plan generated: ${plan.thought}`, plan);
    }

    // Check for goal completion
    if (plan.action === 'done') {
      setMood('success');
      const finalMsg = plan.answer || 'Goal successfully accomplished!';
      setStatusText(`Complete: ${finalMsg}`);
      addLog('ACT', `Autonomous run finished: ${finalMsg}`, plan);
      setActiveElementId(null);
      return { shouldContinue: false, newHistory: currentHistory };
    }

    // Step 3: Execute Action
    const targetId = plan.target !== undefined ? plan.target : plan.elementId;
    setActiveElementId(targetId !== undefined ? targetId : null);
    setMood('acting');

    const targetNode = currentNodes.find((n) => n.id === targetId);
    setStatusText(
      `Executing ${plan.action.toUpperCase()} on Node #${targetId ?? '?'}: ${
        targetNode ? `<${targetNode.tag}> "${targetNode.text || targetNode.name || ''}"` : ''
      }`
    );

    const execResult = await executePlanAction(plan, currentNodes, config);
    addLog(
      execResult.ok ? 'ACT' : 'ERR',
      `Action ${plan.action.toUpperCase()} ${execResult.ok ? 'succeeded' : 'failed'}: ${
        execResult.message
      }`,
      { plan, execResult }
    );

    // Record in history
    const record: StepRecord = {
      step: currentStepNum + 1,
      timestamp: new Date().toLocaleTimeString(),
      action: plan.action,
      targetId,
      thought: plan.thought,
      result: execResult.message,
      verified: execResult.verified,
      targetElementText: targetNode
        ? `<${targetNode.tag}> "${targetNode.text || targetNode.name || ''}"`
        : undefined,
    };
    const updatedHistory = [...currentHistory, record];
    setHistory(updatedHistory);
    setStepCount(currentStepNum + 1);

    // Step 4: Verification wait
    setMood('verifying');
    await new Promise((r) => setTimeout(r, config.stepDelayMs));

    const shouldContinue = currentStepNum + 1 < config.maxSteps;
    return { shouldContinue, newHistory: updatedHistory };
  };

  // Loop runner reference
  const loopActiveRef = useRef(false);

  const runAutonomousLoop = async (initialStep: number, currentHist: StepRecord[]) => {
    loopActiveRef.current = true;
    let step = initialStep;
    let hist = currentHist;

    while (loopActiveRef.current && step < config.maxSteps) {
      if (isPaused) {
        setMood('paused');
        setStatusText('Agent execution paused.');
        break;
      }

      const result = await executeAutonomousStep(step, hist);
      hist = result.newHistory;
      step++;

      if (!result.shouldContinue) {
        break;
      }
    }

    if (loopActiveRef.current && step >= config.maxSteps) {
      setMood('error');
      setStatusText(`Max steps limit reached (${config.maxSteps}). Agent halted.`);
      addLog('WARN', `Execution stopped: reached maximum step count (${config.maxSteps}).`);
    }

    loopActiveRef.current = false;
    setIsRunning(false);
  };

  // Handler buttons
  const handleStart = () => {
    if (!goal.trim()) return;
    setIsRunning(true);
    setIsPaused(false);
    addLog('INFO', `Starting autonomous mission: "${goal}"`);
    runAutonomousLoop(0, []);
  };

  const handlePause = () => {
    setIsPaused(true);
    setMood('paused');
    setStatusText('Agent paused.');
    addLog('INFO', 'Agent execution paused.');
  };

  const handleResume = () => {
    setIsPaused(false);
    handleStart();
  };

  const handleStop = () => {
    loopActiveRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setActiveElementId(null);
    setMood('idle');
    setStatusText('Agent stopped.');
    addLog('INFO', 'Agent stopped by user.');
  };

  const handleStepOnce = async () => {
    if (isRunning && !isPaused) return;
    setIsPaused(true);
    await executeAutonomousStep(stepCount, history);
  };

  // Inspector actions
  const handleTestClick = async (elementId: number) => {
    if (!arenaRef.current) return;
    const plan: AgentPlan = { thought: 'Inspector test click', action: 'click', target: elementId };
    const res = await executePlanAction(plan, elements, config);
    addLog('ACT', `Inspector manual click on Node #${elementId}: ${res.message}`);
    scanArenaDOM();
  };

  const handleTestType = async (elementId: number, text: string) => {
    if (!arenaRef.current) return;
    const plan: AgentPlan = { thought: 'Inspector test type', action: 'type', target: elementId, value: text };
    const res = await executePlanAction(plan, elements, config);
    addLog('ACT', `Inspector manual type on Node #${elementId}: ${res.message}`);
    scanArenaDOM();
  };

  const activeNode = elements.find((e) => e.id === activeElementId);
  const activeScenarioObj = SCENARIOS.find((s) => s.id === currentScenario) || SCENARIOS[0];

  return (
    <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <Header
        elementCount={elements.length}
        onOpenConsole={() => setIsConsoleOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenExtensionHub={() => setIsScriptExportOpen(true)}
        logCount={logs.length}
        provider={config.provider}
      />

      {/* Main Work Area: Authentically framed in Browser Window Frame */}
      <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Visual Badges Overlay Layer */}
        <BadgesOverlay
          elements={elements}
          activeElementId={activeElementId}
          enabled={config.enableBadges}
          onBadgeClick={(id) => {
            setActiveElementId(id);
            const el = elements.find((e) => e.id === id);
            if (el) {
              setInspectedElement(el);
              addLog('DOM', `Inspected badge #${id}: <${el.tag}> "${el.text || el.name || ''}"`, el);
            }
          }}
        />

        {/* DOM Element Inspector Card Floating in Top-Right */}
        <ElementInspectorCard
          element={inspectedElement}
          onClose={() => setInspectedElement(null)}
          onTestClick={handleTestClick}
          onTestType={handleTestType}
        />

        {/* Browser Window Frame & Live Testing Arena */}
        <BrowserExtensionFrame
          elementCount={elements.length}
          onRescan={scanArenaDOM}
          inspectMode={inspectMode}
          onToggleInspectMode={() => setInspectMode(!inspectMode)}
          onOpenExtensionHub={() => setIsScriptExportOpen(true)}
          activeScenarioTitle={activeScenarioObj.title}
          onSelectScenario={(id) => {
            const sc = SCENARIOS.find((s) => s.id === id);
            if (sc) handleSelectScenario(sc);
          }}
          currentScenarioId={currentScenario}
          scenarios={SCENARIOS}
        >
          <TestArena
            arenaRef={arenaRef}
            currentScenario={currentScenario}
            onSelectScenario={handleSelectScenario}
            scenarios={SCENARIOS}
          />
        </BrowserExtensionFrame>
      </div>

      {/* Floating In-Page HUD Bar */}
      <AgentHud
        isRunning={isRunning}
        isPaused={isPaused}
        mood={mood}
        statusText={statusText}
        stepCount={stepCount}
        maxSteps={config.maxSteps}
        activeElementId={activeElementId}
        activeElementText={activeNode?.text}
        goal={goal}
        onGoalChange={setGoal}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onStepOnce={handleStepOnce}
        onRescan={scanArenaDOM}
        badgesEnabled={config.enableBadges}
        onToggleBadges={() =>
          handleConfigChange({ ...config, enableBadges: !config.enableBadges })
        }
        onOpenConsole={() => setIsConsoleOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenScriptExport={() => setIsScriptExportOpen(true)}
        inspectMode={inspectMode}
        onToggleInspectMode={() => setInspectMode(!inspectMode)}
        provider={config.provider}
        model={config.model}
      />

      {/* Live Console Drawer */}
      <LiveConsole
        logs={logs}
        isOpen={isConsoleOpen}
        onClose={() => setIsConsoleOpen(false)}
        onClear={() => setLogs([])}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onChangeConfig={handleConfigChange}
      />

      {/* Extension & Userscript Distribution Hub */}
      <ScriptExportModal
        isOpen={isScriptExportOpen}
        onClose={() => setIsScriptExportOpen(false)}
      />
    </div>
  );
}

export default App;
