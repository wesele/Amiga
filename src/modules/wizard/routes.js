import WizardFlow from "./WizardFlow.vue";

// See src/modules/news/routes.js for the meta.parent convention. The
// wizard is the entry point for first-launch users; back from /wizard
// finishes the activity (handled by the lack of meta.parent).
export default [
  {
    path: "/wizard",
    name: "wizard",
    component: WizardFlow,
  },
];
