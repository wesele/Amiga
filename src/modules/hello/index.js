import routes from "./routes.js";

export default {
  name: "hello",
  displayName: "Hello",
  version: "0.2.0",
  routes,
  init(kernel) {
    console.log("[hello] module initialized");
  },
};
