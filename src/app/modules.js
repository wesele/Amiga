export const APP_MODULES = [
  { name: "wizard" },
  { name: "learn", parent: "shell" },
  { name: "path", parent: "shell" },
  { name: "assessment", parent: "shell" },
  { name: "expression", parent: "shell" },
  { name: "news", parent: "shell" },
  { name: "vocab", parent: "shell" },
  { name: "profile", parent: "shell" },
  { name: "ai-chat" },
  { name: "chat", parent: "shell" },
  { name: "prompts", parent: "shell" },
];

export async function loadShellModule(kernel) {
  await kernel.loadModule("shell");
}

export async function loadFeatureModules(kernel, modules = APP_MODULES) {
  for (const mod of modules) {
    await kernel.loadModule(mod.name, mod.parent ? { parent: mod.parent } : undefined);
  }
}
