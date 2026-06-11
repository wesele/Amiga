import { invoke } from "@tauri-apps/api/core";

export async function greet(name) {
  return invoke("greet", { name });
}
