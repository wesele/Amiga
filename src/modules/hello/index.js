import routes from "./routes.js";

export default {
  name: "hello",
  displayName: "Hello",
  version: "0.3.5",
  routes,
  init(kernel) {
    console.log("[hello] module initialized");
  },
};
