import i18next from "i18next";
import zhCn from "./locales/zh_cn.json";
import enUs from "./locales/en_us.json";

export const supportedLanguages = ["zh_cn", "en_us"] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const languageDisplayNames: Record<SupportedLanguage, string> = {
  zh_cn: zhCn.language.display,
  en_us: enUs.language.display,
};

const STORAGE_KEY = "fxtz_language";

const resources = {
  zh_cn: { translation: zhCn },
  en_us: { translation: enUs },
} as const;

function browserGlobal(): {
  readonly localStorage?: Pick<Storage, "getItem" | "setItem">;
  readonly navigator?: { readonly language: string };
  readonly location?: { reload(): void };
} {
  return globalThis as typeof globalThis & {
    readonly localStorage?: Pick<Storage, "getItem" | "setItem">;
    readonly navigator?: { readonly language: string };
    readonly location?: { reload(): void };
  };
}

function canUseLocalStorage(): boolean {
  return browserGlobal().localStorage !== undefined;
}

function readInitialLanguage(): SupportedLanguage {
  const globalRef = browserGlobal();
  if (canUseLocalStorage()) {
    const stored = globalRef.localStorage?.getItem(STORAGE_KEY);
    if (stored === "zh_cn" || stored === "en_us") {
      return stored;
    }
  }
  const navigatorRef = globalRef.navigator;
  if (navigatorRef) {
    const locale = navigatorRef.language.toLowerCase();
    if (locale.startsWith("zh")) {
      return "zh_cn";
    }
  }
  return "zh_cn";
}

void i18next.init({
  resources,
  lng: readInitialLanguage(),
  fallbackLng: "zh_cn",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function getLanguage(): SupportedLanguage {
  return (i18next.language === "en_us" ? "en_us" : "zh_cn") as SupportedLanguage;
}

export function setLanguage(language: SupportedLanguage): void {
  const globalRef = browserGlobal();
  if (canUseLocalStorage()) {
    globalRef.localStorage?.setItem(STORAGE_KEY, language);
  }
  void i18next.changeLanguage(language);
  globalRef.location?.reload();
}

export function t(key: string, options?: Record<string, unknown> | string): string {
  if (typeof options === "string") {
    return i18next.t(key, options) as string;
  }
  return i18next.t(key, { defaultValue: key, ...options }) as string;
}

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return value === "zh_cn" || value === "en_us";
}
