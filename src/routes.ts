export const MAIN_PATH = "/main";
export const ABOUT_PATH = "/about_us";
const MODULES_PATH = "/module";

export function modulePath(moduleId: string): string {
  return `${MODULES_PATH}/${moduleId}`;
}

export const EQUIPMENT_ADMIN_PATH = `${modulePath("equipment")}/admin`;
