type LeakCheckOptions = {
  forbiddenKeys?: readonly string[];
  forbiddenValues?: readonly string[];
};

const secretNames = /\b(?:password_?hash|JWT_SECRET|GEMINI_API_KEY)\b/i;
const stackFrame = /(?:^|\r?\n)[ \t]+at\s+[^\r\n]+/;
const windowsPath = /\b[a-z]:[\\/][^\s]|(?:^|[\s"'(=])\\\\[^\\\s]+\\[^\\\s]+/i;
const serverPath = /(?:^|[\s"'(=])(?:file:\/\/\/|\/(?:app|deploy|etc|home|mnt|opt|private|root|run|srv|tmp|users|usr|var|volumes|workspace|workspaces)\/)/i;

export function expectNoLeaks(input: unknown, options: LeakCheckOptions = {}): void {
  const forbiddenKeys = new Set(
    ["passwordHash", "password_hash", "JWT_SECRET", "GEMINI_API_KEY", "stack",
      ...(options.forbiddenKeys ?? [])].map((key) => key.toLowerCase())
  );
  const forbiddenValues = (options.forbiddenValues ?? []).filter((value) => value.length > 0);
  const visited = new WeakSet<object>();

  function checkText(text: string, location: string): void {
    if (secretNames.test(text) || forbiddenValues.some((value) => text.includes(value))) {
      throw new Error(`Private value at ${location}`);
    }
    if (stackFrame.test(text) || windowsPath.test(text) || serverPath.test(text)) {
      throw new Error(`Stack trace or server path at ${location}`);
    }
  }

  function visit(value: unknown, location: string): void {
    if (typeof value === "string") {
      checkText(value, location);
      return;
    }
    if (value === null || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    // Error.message and Error.stack are often non-enumerable in console arguments.
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (forbiddenKeys.has(key.toLowerCase())) {
        throw new Error(`Forbidden field under ${location}`);
      }
      checkText(key, location);
      if ("value" in descriptor) {
        visit(descriptor.value, `${location}[${JSON.stringify(key)}]`);
      }
    }
  }

  visit(input, "$");
}