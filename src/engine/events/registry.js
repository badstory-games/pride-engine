class RegistryMap {
  constructor() { this.map = new Map(); }

  register(id, def) {
    if (this.map.has(id)) console.warn(`[events] re-register: ${id}`);
    this.map.set(id, def);
  }

  get(id) { return this.map.get(id); }
  has(id) { return this.map.has(id); }

  all() {
    return [...this.map.entries()].map(([id, def]) => ({ id, ...def }));
  }
}

export const registry = {
  conditions: new RegistryMap(),
  actions:    new RegistryMap(),
};