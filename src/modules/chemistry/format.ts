export function formatReagentName(value: string | undefined, fallback = "") {
  const name = value?.trim() || fallback;
  return name ? name.charAt(0).toLocaleUpperCase("ru-RU") + name.slice(1) : name;
}
