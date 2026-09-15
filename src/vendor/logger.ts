import { BaseLogger, type LogPayload } from '../shared/base-logger';

export class ExtensionLogger extends BaseLogger {
  constructor(context: string) {
    super(context, 'info');
  }

  protected write(entry: LogPayload, line: string, errorArg?: Error): void {
    if (entry.level === 'error') console.error(line, errorArg ?? '');
    else if (entry.level === 'warn') console.warn(line, errorArg ?? '');
    else console.log(line, errorArg ?? '');
    try {
      const g = globalThis as unknown as { process?: { parentPort?: { postMessage(m: unknown): void } } };
      g.process?.parentPort?.postMessage({ jsonrpc: '2.0', method: 'host.log', params: entry });
    } catch {
      // logging must never break extension code
    }
  }
}
