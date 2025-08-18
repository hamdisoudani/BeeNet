import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import { bold, cyan, green, magenta, red, yellow, gray } from 'colorette';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  contextName?: string;

  setContextName(name: string) {
    this.contextName = name;
  }

  private fmt(level: string, message: unknown): string {
    const ctx = this.contextName ? gray(`[${this.contextName}]`) : '';
    const ts = gray(new Date().toISOString());
    const msg = typeof message === 'string' ? message : JSON.stringify(message);
    return `${ts} ${level} ${ctx} ${msg}`.trim();
  }

  log(message: unknown, context?: string) {
    super.log(green(this.fmt(bold('INFO'), message)), context ?? this.contextName);
  }
  warn(message: unknown, context?: string) {
    super.warn(yellow(this.fmt(bold('WARN'), message)), context ?? this.contextName);
  }
  error(message: unknown, trace?: string, context?: string) {
    super.error(red(this.fmt(bold('ERROR'), message)), trace, context ?? this.contextName);
  }
  debug(message: unknown, context?: string) {
    super.debug(cyan(this.fmt(bold('DEBUG'), message)), context ?? this.contextName);
  }
  verbose(message: unknown, context?: string) {
    super.verbose(magenta(this.fmt(bold('VERBOSE'), message)), context ?? this.contextName);
  }
}


