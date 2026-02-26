export interface CircuitBreakerState {
  failures: number;
  openedAt: number | null;
  openUntil: number | null;
  lastError: string | null;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  coolDownMs: number;
  halfOpenMaxCalls: number;
}

export interface CircuitBreakerEvent {
  name: string;
  kind: 'success' | 'failure' | 'opened' | 'rejected' | 'half-open';
  message: string;
  timestamp: number;
}

export class CircuitBreaker {
  readonly name: string;
  readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState;
  private halfOpenCalls: number;

  constructor(name: string, config?: Partial<CircuitBreakerConfig>) {
    this.name = name;
    this.config = {
      failureThreshold: Math.max(1, config?.failureThreshold ?? 3),
      coolDownMs: Math.max(1000, config?.coolDownMs ?? 30_000),
      halfOpenMaxCalls: Math.max(1, config?.halfOpenMaxCalls ?? 1),
    };
    this.state = { failures: 0, openedAt: null, openUntil: null, lastError: null };
    this.halfOpenCalls = 0;
  }

  get snapshot(): CircuitBreakerState {
    return { ...this.state };
  }

  private isOpen(now: number): boolean {
    return typeof this.state.openUntil === 'number' && this.state.openUntil > now;
  }

  async execute<T>(
    operation: () => Promise<T>,
    onEvent?: (event: CircuitBreakerEvent) => void,
  ): Promise<T> {
    const now = Date.now();
    if (this.isOpen(now)) {
      onEvent?.({
        name: this.name,
        kind: 'rejected',
        message: `Circuit open for ${this.name}`,
        timestamp: now,
      });
      throw new Error(`Circuit open: ${this.name}`);
    }

    if (this.state.openUntil && this.state.openUntil <= now) {
      this.halfOpenCalls += 1;
      onEvent?.({
        name: this.name,
        kind: 'half-open',
        message: `Circuit half-open for ${this.name}`,
        timestamp: now,
      });
      if (this.halfOpenCalls > this.config.halfOpenMaxCalls) {
        throw new Error(`Circuit probe limit reached: ${this.name}`);
      }
    }

    try {
      const result = await operation();
      this.state = { failures: 0, openedAt: null, openUntil: null, lastError: null };
      this.halfOpenCalls = 0;
      onEvent?.({
        name: this.name,
        kind: 'success',
        message: `${this.name} call succeeded`,
        timestamp: Date.now(),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      const failures = this.state.failures + 1;
      this.state = {
        failures,
        openedAt: this.state.openedAt,
        openUntil: this.state.openUntil,
        lastError: message,
      };
      onEvent?.({
        name: this.name,
        kind: 'failure',
        message,
        timestamp: Date.now(),
      });
      if (failures >= this.config.failureThreshold) {
        const openedAt = Date.now();
        this.state.openedAt = openedAt;
        this.state.openUntil = openedAt + this.config.coolDownMs;
        onEvent?.({
          name: this.name,
          kind: 'opened',
          message: `${this.name} circuit opened`,
          timestamp: openedAt,
        });
      }
      throw error;
    }
  }
}

export async function withRetryBudget<T>(
  operation: () => Promise<T>,
  options?: { maxAttempts?: number; initialDelayMs?: number; factor?: number },
): Promise<T> {
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 2);
  const factor = Math.max(1, options?.factor ?? 2);
  let delay = Math.max(50, options?.initialDelayMs ?? 200);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= factor;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('Retry budget exhausted'));
}
