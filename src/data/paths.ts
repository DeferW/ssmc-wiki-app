export function dataRoot(moduleId: string, configuredRoot?: string): string {
  const appRoot = new URL(import.meta.env.BASE_URL, document.baseURI);
  const root = new URL(configuredRoot ?? `data/${moduleId}/`, appRoot).toString();
  return root.endsWith("/") ? root : `${root}/`;
}
