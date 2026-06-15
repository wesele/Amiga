import NewsList from "./NewsList.vue";
import NewsReader from "./NewsReader.vue";

export default [
  {
    path: "/news",
    name: "news",
    component: NewsList,
  },
  {
    path: "/news/:id",
    name: "reader",
    component: NewsReader,
    props: true,
  },
];
