import { isTvMode } from "@/shared/appMode.js";

export const DEFAULT_APP_MODULES = [
  { name: "wizard" },
  { name: "learn", parent: "shell" },
  { name: "achievements", parent: "shell" },
  { name: "path", parent: "shell" },
  { name: "news", parent: "shell" },
  { name: "reading", parent: "shell" },
  { name: "speaking", parent: "shell" },
  { name: "soulmate", parent: "shell" },
  { name: "vocab", parent: "shell" },
  { name: "profile", parent: "shell" },
  { name: "ai-chat" },
  { name: "chat", parent: "shell" },
  { name: "prompts", parent: "shell" },
];

const TV_MODULE_NAMES = new Set([
  "wizard",
  "learn",
  "achievements",
  "path",
  "news",
  "reading",
  "vocab",
  "profile",
  // Living-room Soul Mate (chat uses remote-friendly reply options, no free typing).
  "soulmate",
  // Settings → AI config → Prompt manager/editor (TV needs full model setup).
  "prompts",
]);

export const TV_APP_MODULES = DEFAULT_APP_MODULES.filter((mod) => TV_MODULE_NAMES.has(mod.name));
export const APP_MODULES = isTvMode ? TV_APP_MODULES : DEFAULT_APP_MODULES;

export async function loadShellModule(kernel) {
  await kernel.loadModule("shell");
}

export async function loadFeatureModules(kernel, modules = APP_MODULES) {
  for (const mod of modules) {
    await kernel.loadModule(mod.name, mod.parent ? { parent: mod.parent } : undefined);
  }
}
