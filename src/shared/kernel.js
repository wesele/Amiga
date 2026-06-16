class Kernel {
  constructor() {
    this._router = null;
    this._pinia = null;
    this._modules = new Map();
    this._plugins = [];
  }

  init(router, pinia) {
    this._router = router;
    this._pinia = pinia;
  }

  get router() {
    return this._router;
  }

  get pinia() {
    return this._pinia;
  }

  use(plugin) {
    if (typeof plugin.install === "function") {
      plugin.install(this);
    }
    this._plugins.push(plugin);
  }

  async loadModule(name, { parent } = {}) {
    if (this._modules.has(name)) {
      return this._modules.get(name);
    }
    try {
      const module = await import(`../modules/${name}/index.js`);
      const definition = module.default;
      this._modules.set(name, definition);
      if (definition.routes) {
        definition.routes.forEach((route) => {
          if (parent) {
            this._router.addRoute(parent, route);
          } else {
            this._router.addRoute(route);
          }
        });
      }
      if (definition.init) {
        definition.init(this);
      }
      return definition;
    } catch (err) {
      console.error(`Failed to load module "${name}":`, err);
      throw err;
    }
  }

  getModule(name) {
    return this._modules.get(name) || null;
  }
}

export const kernel = new Kernel();
