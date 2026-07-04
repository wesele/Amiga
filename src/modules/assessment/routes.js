import AssessmentPage from "./AssessmentPage.vue";
import AssessmentResultPage from "./AssessmentResultPage.vue";

export default [
  {
    path: "/learn/assessment",
    name: "assessment",
    component: AssessmentPage,
    meta: { parent: "learn" },
  },
  {
    path: "/learn/assessment/result",
    name: "assessment-result",
    component: AssessmentResultPage,
    meta: { parent: "assessment" },
  },
];
