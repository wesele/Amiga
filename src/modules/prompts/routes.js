import PromptManager from "./PromptManager.vue";
import PromptEditor from "./PromptEditor.vue";

export default [
  {
    path: "/prompts",
    name: "prompts",
    component: PromptManager,
  },
  {
    path: "/prompts/:key",
    name: "prompt-editor",
    component: PromptEditor,
  },
];
