import routes from "./routes.js";

export default {
  name: "hello",
  displayName: "Hello",
  version: "0.3.2",
  routes,
  init(kernel) {
    console.log("[hello] module initialized");
  },
};
