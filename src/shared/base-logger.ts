export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogPayload {
  level: LogLevel;
  message: string;
  context?: string;
  error?: string;
  timestamp: number;
  file?: string;
  line?: number;
}

export interface NormalizedArgs {
  message: string;
  context?: string;
  error?: string;
  errorArg?: Error;
}

export function normalizeArgs(...args: unknown[]): NormalizedArgs {
  const message = args[0] instanceof Error ? args[0].message : String(args[0] ?? '');
  const errorArg = args.find((a) => a instanceof Error) as Error | undefined;
  const contextArg = args.slice(1).find((a) => typeof a === 'string') as string | undefined;
  const rest = args.slice(1).filter((a) => !(a instanceof Error) && typeof a !== 'string');
  const restText = rest.length > 0 ? ' ' + rest.map((a) => {
    try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); }
  }).join(' ') : '';
  return {
    message: `${message}${restText}`,
    context: contextArg,
    error: errorArg?.stack ?? errorArg?.message,
    errorArg,
  };
}

export function formatLine(entry: LogPayload): string {
  const ts = new Date(entry.timestamp).toISOString();
  const lvl = entry.level.toUpperCase();
  const ctx = entry.context ? ` [${entry.context}]` : '';
  const loc = entry.file ? `  ${entry.file}:${entry.line ?? 0}` : '';
  return `${ts} [${lvl}]${ctx} ${entry.message}${loc}`;
}

export function getCallerInfo(skipSuffixes: string[] = ['base-logger.ts', 'logger.ts']): { file: string; line: number } | null {
  const stack = new Error().stack;
  if (!stack) return null;
  const lines = stack.split('\n').slice(2);
  for (const line of lines) {
    const match = line.match(/\(([^)]+):(\d+):\d+\)/);
    if (!match) continue;
    const fullPath = match[1];
    if (skipSuffixes.some((s) => fullPath.endsWith(s))) continue;
    const file = fullPath.split(/[\\/]/).pop() ?? fullPath;
    return { file, line: parseInt(match[2], 10) };
  }
  return null;
}

export abstract class BaseLogger {
  protected context: string;
  protected minLevel: LogLevel;

  constructor(context: string, minLevel: LogLevel = 'info') {
    this.context = context;
    this.minLevel = minLevel;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getMinLevel(): LogLevel {
    return this.minLevel;
  }

  setContext(context: string): void {
    this.context = context;
  }

  protected shouldLog(level: LogLevel): boolean {
    const order: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
    return order[level] >= order[this.minLevel];
  }

  protected abstract write(entry: LogPayload, line: string, errorArg?: Error): void;

  private emit(level: LogLevel, ...args: unknown[]): void {
    if (!this.shouldLog(level)) return;
    const n = normalizeArgs(...args);
    const caller = getCallerInfo();
    const entry: LogPayload = {
      level,
      message: n.message,
      context: n.context ?? this.context,
      error: n.error,
      timestamp: Date.now(),
      file: caller?.file,
      line: caller?.line,
    };
    this.write(entry, formatLine(entry), n.errorArg);
  }

  log(...args: unknown[]): void { this.emit('info', ...args); }
  info(...args: unknown[]): void { this.emit('info', ...args); }
  warn(...args: unknown[]): void { this.emit('warn', ...args); }
  error(...args: unknown[]): void { this.emit('error', ...args); }
  debug(...args: unknown[]): void { this.emit('debug', ...args); }
}
