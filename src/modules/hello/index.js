import routes from "./routes.js";

export default {
  name: "hello",
  displayName: "Hello",
  version: "0.3.1",
  routes,
  init(kernel) {
    console.log("[hello] module initialized");
  },
};
