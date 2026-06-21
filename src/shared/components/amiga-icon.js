// Resolved URL of the Amiga app icon, served from Vite's `public/`
// directory. The PNG itself is a copy of the Android launcher icon at
// src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png — i.e. the
// "system icon" that ships with the Android app and shows up on the
// home screen / app drawer.
//
// We keep the icon under public/ (not src/assets/) so it is served as
// a plain <img src=…> asset without going through Vite's asset
// pipeline. That way the file in the deployed bundle is byte-identical
// to the launcher icon the Android app uses, and re-syncing the
// source is just `cp src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png public/amiga-icon.png`.
export const amigaIconUrl = "/amiga-icon.png";
