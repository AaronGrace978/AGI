export type RuntimeSeverity = 'info' | 'warn' | 'error' | 'critical';

export interface RuntimeSignal {
  id: string;
  source: 'renderer' | 'main' | 'kernel' | 'voice' | 'memory' | 'neural';
  code: string;
  severity: RuntimeSeverity;
  message: string;
  correlationId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface RuntimeHealthIssue {
  key: string;
  severity: RuntimeSeverity;
  count: number;
  lastSeenAt: number | null;
  samples: string[];
}

export interface RuntimeHealthSummary {
  generatedAt: number;
  dataDir: string;
  auditLogPath: string;
  orchestratorEventsPath: string;
  totalAuditEntries: number;
  totalOrchestratorEvents: number;
  issues: RuntimeHealthIssue[];
  services: {
    neuralBridgeReady: boolean;
    rendererResponsive: boolean;
  };
}

let runtimeSignalCounter = 0;

export function createCorrelationId(prefix: string = 'sig'): string {
  runtimeSignalCounter += 1;
  return `${prefix}_${Date.now()}_${runtimeSignalCounter}`;
}

export function createRuntimeSignal(input: Omit<RuntimeSignal, 'id' | 'timestamp'> & { timestamp?: number }): RuntimeSignal {
  return {
    id: createCorrelationId('rt'),
    timestamp: input.timestamp ?? Date.now(),
    source: input.source,
    code: input.code,
    severity: input.severity,
    message: input.message,
    correlationId: input.correlationId,
    metadata: input.metadata,
  };
}

export function appendRuntimeSignal(
  signals: RuntimeSignal[],
  signal: RuntimeSignal,
  maxEntries: number = 400,
): RuntimeSignal[] {
  const next = [...signals, signal];
  if (next.length <= maxEntries) return next;
  return next.slice(next.length - maxEntries);
}
