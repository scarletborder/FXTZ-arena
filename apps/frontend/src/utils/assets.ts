import { resourceAssetUrl } from "./resource-pack";

export function assetUrl(path: string): string {
  const resourceUrl = resourceAssetUrl(path);
  if (resourceUrl) {
    return resourceUrl;
  }

  const base = (import.meta as ImportMeta & {
    readonly env: { readonly BASE_URL: string };
  }).env.BASE_URL;
  const normalizedPath = path.replace(/^\/+/, "");

  if (base === "" || base.endsWith("/")) {
    return `${base}${normalizedPath}`;
  }

  return `${base}/${normalizedPath}`;
}
