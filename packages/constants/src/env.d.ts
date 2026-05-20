interface ImportMetaEnv {
  /** Application semantic version, populated from the git tag at build time. */
  readonly VITE_APP_VERSION?: string;
  /** Commit serial number, produced by `git rev-list --count HEAD`. */
  readonly VITE_APP_COMMIT?: string;
  /** Public path the app is served from, for example "/fxtz-arena/". */
  readonly VITE_APP_BASE?: string;
  /** Optional override for the docs site origin. */
  readonly VITE_DOCS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
