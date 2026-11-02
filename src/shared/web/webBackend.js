import { applyRuntimeDefaults, clone, store } from "./backend/shared.js";
import { invokeRead } from "./backend/read.js";
import { invokeRemote } from "./backend/remote.js";
import { invokeWrite } from "./backend/write.js";

export async function invokeWebCommand(command, args = undefined) {
  let state = await store.get();
  if (applyRuntimeDefaults(state)) {
    state = await store.update((next) => {
      applyRuntimeDefaults(next);
      return clone(next);
    });
  }
  const readResult = await invokeRead(command, args || {}, state);
  if (readResult !== undefined) return readResult;
  const writeResult = await invokeWrite(command, args || {});
  if (writeResult !== undefined) return writeResult;
  const remoteResult = await invokeRemote(command, args || {}, state);
  if (remoteResult !== undefined) return remoteResult;
  throw new Error(`WebBackend does not implement command: ${command}`);
}

export function createWebInvoke(overrides = {}) {
  if (!Object.keys(overrides).length) return invokeWebCommand;
  const customStore = overrides.store;
  return async (command, args) => {
    if (customStore) throw new Error("Custom WebBackend stores are not supported by this factory");
    return invokeWebCommand(command, args);
  };
}

export { store as webStateStore };
