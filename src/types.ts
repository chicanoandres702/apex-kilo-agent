export type AgentMood = 'idle' | 'scanning' | 'reasoning' | 'acting' | 'verifying' | 'success' | 'error' | 'paused';

export type ActionType =
  | 'click'
  | 'type'
  | 'clear'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'scroll'
  | 'wait'
  | 'navigate'
  | 'done';

export interface InteractiveElementNode {
  id: number;
  tag: string;
  role?: string;
  type?: string;
  name?: string;
  text: string;
  value?: string;
  pos: 'in-view' | 'scroll-up' | 'scroll-down';
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  elementRef?: HTMLElement;
}

export interface AgentPlan {
  thought: string;
  action: ActionType;
  target?: number;
  elementId?: number;
  value?: string;
  text?: string;
  url?: string;
  answer?: string;
  reasoning?: string;
}

export interface StepRecord {
  step: number;
  timestamp: string;
  thought: string;
  action: ActionType;
  targetId?: number;
  targetElementText?: string;
  value?: string;
  result?: string;
  verified?: boolean;
}

export interface LogEntry {
  id: string;
  time: string;
  level: 'INFO' | 'DOM' | 'PLAN' | 'ACT' | 'NET' | 'ERR' | 'WARN';
  message: string;
  details?: any;
  raw?: any;
}

export interface AgentConfig {
  provider: 'gemini' | 'devproject' | 'kilo' | 'openai' | 'heuristic';
  model: string;
  apiKey: string;
  customEndpoint: string;
  maxSteps: number;
  stepDelayMs: number;
  maxElements: number;
  enableBadges: boolean;
  verifyFields: boolean;
  allowHeuristicFallback: boolean;
  verbose: boolean;
}

export interface TestScenario {
  id: string;
  title: string;
  description: string;
  category: string;
  suggestedGoal: string;
}
