const isProd = process.env.NODE_ENV === "production";

const sensitive = [
  "email",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "set-cookie",
];

function maskString(value: string) {
  if (!value) return value;
  if (value.includes("@")) return "***";
  if (value.length > 8) return `***${value.slice(-4)}`;
  return "***";
}

function sanitizeValue(value: any): any {
  if (value == null) return value;
  if (typeof value === "string") return maskString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      const lower = key.toLowerCase();
      if (sensitive.includes(lower)) {
        out[key] = "***";
      } else {
        out[key] = sanitizeValue(value[key]);
      }
    }
    return out;
  }
  return value;
}

function sanitizeArgs(args: any[]) {
  return args.map(sanitizeValue);
}

export const logger = {
  log: (...args: any[]) => {
    if (!isProd) console.log(...args);
  },
  warn: (...args: any[]) => {
    const out = isProd ? sanitizeArgs(args) : args;
    console.warn(...out);
  },
  error: (...args: any[]) => {
    const out = isProd ? sanitizeArgs(args) : args;
    console.error(...out);
  },
};