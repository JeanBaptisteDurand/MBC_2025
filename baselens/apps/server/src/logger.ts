// ============================================
// Logger - Simple logging utility
// ============================================

type LogLevel = "debug" | "info" | "warn" | "error";

const colors = {
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  reset: "\x1b[0m",
};

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: LogLevel, message: string, meta?: unknown): void {
  const color = colors[level];
  const timestamp = formatTimestamp();
  const prefix = `${color}[${level.toUpperCase()}]${colors.reset}`;

  if (meta !== undefined) {
    console.log(`${timestamp} ${prefix} ${message}`, meta);
  } else {
    console.log(`${timestamp} ${prefix} ${message}`);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => log("debug", message, meta),
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};

