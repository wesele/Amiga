import PromptManager from "./PromptManager.vue";
import PromptEditor from "./PromptEditor.vue";

// See src/modules/news/routes.js for the meta.parent convention.
// /prompts is reached from /profile/settings in practice, so we model
// its parent as /profile/settings.
export default [
  {
    path: "/prompts",
    name: "prompts",
    component: PromptManager,
    meta: { parent: "settings" },
  },
  {
    path: "/prompts/:key",
    name: "prompt-editor",
    component: PromptEditor,
    meta: { parent: "prompts" },
  },
];
