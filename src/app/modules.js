import { isTvMode } from "@/shared/appMode.js";

// Single registry: `tv: true` marks a module that is also available on the
// living-room (TV) build. Keep the flag on the entry itself — a second
// name list drifts silently when a module is added.
const MODULE_DEFS = [
  { name: "wizard", tv: true },
  { name: "learn", parent: "shell", tv: true },
  { name: "achievements", parent: "shell", tv: true },
  { name: "path", parent: "shell", tv: true },
  { name: "news", parent: "shell", tv: true },
  { name: "reading", parent: "shell", tv: true },
  // Phone-only: speaking needs a mic, chat needs free typing.
  { name: "speaking", parent: "shell" },
  // Living-room Soul Mate (chat uses remote-friendly reply options, no free typing).
  { name: "soulmate", parent: "shell", tv: true },
  { name: "vocab", parent: "shell", tv: true },
  { name: "profile", parent: "shell", tv: true },
  { name: "ai-chat" },
  { name: "chat", parent: "shell" },
  // Settings → AI config → Prompt manager/editor (TV needs full model setup).
  { name: "prompts", parent: "shell", tv: true },
];

const stripTvFlag = ({ tv, ...mod }) => mod;

export const DEFAULT_APP_MODULES = MODULE_DEFS.map(stripTvFlag);

export const TV_APP_MODULES = MODULE_DEFS.filter((mod) => mod.tv).map(stripTvFlag);
export const APP_MODULES = isTvMode ? TV_APP_MODULES : DEFAULT_APP_MODULES;

export async function loadShellModule(kernel) {
  await kernel.loadModule("shell");
}

export async function loadFeatureModules(kernel, modules = APP_MODULES) {
  for (const mod of modules) {
    await kernel.loadModule(mod.name, mod.parent ? { parent: mod.parent } : undefined);
  }
}
