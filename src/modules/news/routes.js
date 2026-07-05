import NewsList from "./NewsList.vue";
import NewsReader from "./NewsReader.vue";

// `meta.parent` is consumed by window.__amigaGoBack() in androidBridge.js — the
// Android back button (and any future in-app back UI) walks the parent
// chain instead of doing history.back(), which can loop or land on the
// wrong screen. A top-level route leaves parent undefined, which
// causes the OS-level back press to finish() the activity.
export default [
  {
    path: "/news",
    name: "news",
    component: NewsList,
    meta: { parent: "learn" },
  },
  {
    path: "/news/:id",
    name: "reader",
    component: NewsReader,
    props: true,
    meta: { parent: "news" },
  },
];
