export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  fatal: (message: string, meta?: Record<string, unknown>) => never;
};

const MAX_FIELD_LENGTH = 400;
const MAX_MESSAGE_LENGTH = 1200;

function truncate(value: unknown, limit = MAX_FIELD_LENGTH): unknown {
  if (typeof value === "string") {
    return value.length > limit ? `${value.slice(0, limit)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => truncate(item, limit));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = truncate(item, limit);
    }
    return out;
  }
  return value;
}

function encode(level: LogLevel, component: string, message: string, meta?: Record<string, unknown>): string {
  const payload = {
    ts: new Date().toISOString(),
    level,
    component,
    message: message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message,
    ...(meta ? { meta: truncate(meta) } : {}),
  };
  return JSON.stringify(payload);
}

export function errorMeta(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }
  return { errorValue: String(error) };
}

export function createLogger(component: string, level: LogLevel): Logger {
  const enabled = {
    debug: level === "debug",
    info: level === "debug" || level === "info",
    warn: true,
    error: true,
  };

  const write = (lvl: LogLevel, message: string, meta?: Record<string, unknown>) => {
    if (!enabled[lvl]) return;
    const line = encode(lvl, component, message, meta);
    if (lvl === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    fatal: (message, meta): never => {
      write("error", message, meta);
      throw new Error(message);
    },
  };
}

export function parseLogLevel(raw: string): LogLevel {
  const level = raw.trim().toLowerCase();
  if (level === "debug" || level === "info" || level === "warn" || level === "error") return level;
  throw new Error(`Invalid log level: ${raw}`);
}
