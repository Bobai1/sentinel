// CSS Modules resolve to `undefined` under this project's Turbopack + Tailwind
// loader setup. The sentinel stylesheet is plain global CSS with `sn-` prefixed
// classes, so this shim keeps the `styles.foo` call sites readable.
export const styles: Record<string, string> = new Proxy(
  {},
  { get: (_target, key) => `sn-${String(key)}` },
);
