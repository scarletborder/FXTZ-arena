type BuildEnv = Partial<Record<
  | "APP_VERSION"
  | "APP_COMMIT"
  | "APP_BASE"
  | "DOCS_URL"
  | "VITE_APP_VERSION"
  | "VITE_APP_COMMIT"
  | "VITE_APP_BASE"
  | "VITE_DOCS_URL",
  string
>>;

const importMetaEnv = ((import.meta as ImportMeta & { readonly env?: BuildEnv }).env ?? {}) satisfies BuildEnv;
const processEnv = (typeof process === "undefined" ? {} : process.env) as Readonly<BuildEnv>;

function readBuildEnv(primary: keyof BuildEnv, fallback: keyof BuildEnv, defaultValue: string): string {
  const value = importMetaEnv[primary] ?? importMetaEnv[fallback] ?? processEnv[primary] ?? processEnv[fallback];
  return value && value.length > 0 ? value : defaultValue;
}

function normalizeVersion(version: string): string {
  if (version === "dev") {
    return version;
  }
  return version.startsWith("v") ? version : `v${version}`;
}

export const APP_VERSION = normalizeVersion(readBuildEnv("VITE_APP_VERSION", "APP_VERSION", "0.0.0"));
export const APP_COMMIT = readBuildEnv("VITE_APP_COMMIT", "APP_COMMIT", "local");
export const APP_BUILD_LABEL = `${APP_VERSION}+${APP_COMMIT}`;
export const APP_BASE = readBuildEnv("VITE_APP_BASE", "APP_BASE", "/");
export const DOCS_URL = readBuildEnv("VITE_DOCS_URL", "DOCS_URL", "https://mvz443-team.github.io/docs/");
