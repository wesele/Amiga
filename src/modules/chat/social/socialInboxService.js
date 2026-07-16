import { getCurrentUser } from "@/shared/backend/user.js";
import { eventBus } from "@/shared/eventBus.js";
import { rememberSocialAvatars } from "./socialAvatars.js";
import { startSocialInboxListener } from "./socialInbox.js";
import {
  getSocialConfig,
  getSocialFriendships,
  getSocialUserId,
  registerSocialUser,
  shouldDisconnectSocialSocketOnHidden,
} from "./socialService.js";

export const SOCIAL_FRIENDS_UPDATED = "social-friends-updated";
export const SOCIAL_INBOX_BOOTED = "social-inbox-booted";
export const SOCIAL_INBOX_STOPPED = "social-inbox-stopped";

const state = {
  userId: "",
  config: null,
  friends: [],
  listenerStopFn: null,
  bootPromise: null,
  booted: false,
  visibilityHandler: null,
  boundUserAgent: "",
};

function emitFriends() {
  eventBus.emit(SOCIAL_FRIENDS_UPDATED, state.friends);
}

async function refreshFriendsInternal() {
  if (!state.config || !state.userId) {
    state.friends = [];
    rememberSocialAvatars({});
    emitFriends();
    return state.friends;
  }
  let friends = [];
  try {
    const friendships = await getSocialFriendships(state.config, state.userId);
    friends = friendships?.items || [];
  } catch {
    friends = [];
  }
  state.friends = friends;
  const avatarMap = Object.fromEntries(
    friends
      .filter((friend) => friend.friendUserId && friend.friendAvatar)
      .map((friend) => [friend.friendUserId, friend.friendAvatar]),
  );
  rememberSocialAvatars(avatarMap);
  emitFriends();
  return friends;
}

async function startListener() {
  if (state.listenerStopFn) {
    try {
      state.listenerStopFn();
    } catch {
      /* ignore teardown errors */
    }
    state.listenerStopFn = null;
  }
  state.listenerStopFn = startSocialInboxListener({
    userId: state.userId,
    friends: state.friends,
  });
}

function detachVisibilityHandler() {
  if (state.visibilityHandler && typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", state.visibilityHandler);
  }
  state.visibilityHandler = null;
}

function handleVisibility() {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "hidden" && shouldDisconnectSocialSocketOnHidden(state.boundUserAgent)) {
    stopSocialInbox({ keepBootable: true });
  } else if (document.visibilityState === "visible" && !state.booted && !state.bootPromise) {
    bootSocialInbox().catch((e) => {
      console.debug("Social inbox re-boot on visibility failed", e);
    });
  }
}

function attachVisibilityHandler() {
  if (typeof document === "undefined") return;
  if (state.visibilityHandler) return;
  state.boundUserAgent = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  state.visibilityHandler = handleVisibility;
  document.addEventListener("visibilitychange", state.visibilityHandler);
}

async function doBoot() {
  try {
    state.config = await getSocialConfig();
    state.userId = await getSocialUserId();
    if (!state.userId || !state.config) {
      state.friends = [];
      emitFriends();
      return;
    }
    try {
      const user = await getCurrentUser();
      await registerSocialUser(state.config, {
        id: state.userId,
        avatar: user?.avatar,
        native_language: user?.native_language,
      });
    } catch {
      /* registration is best-effort */
    }
    await refreshFriendsInternal();
    await startListener();
    attachVisibilityHandler();
    state.booted = true;
    eventBus.emit(SOCIAL_INBOX_BOOTED, {
      userId: state.userId,
      friendCount: state.friends.length,
    });
  } catch {
    state.booted = false;
  }
}

export async function bootSocialInbox() {
  if (state.booted) return;
  if (state.bootPromise) return state.bootPromise;
  state.bootPromise = doBoot().finally(() => {
    state.bootPromise = null;
  });
  return state.bootPromise;
}

export async function refreshSocialInboxFriends() {
  if (!state.userId || !state.booted) {
    return state.friends;
  }
  const friends = await refreshFriendsInternal();
  await startListener();
  return friends;
}

export function stopSocialInbox({ keepBootable = false } = {}) {
  if (state.listenerStopFn) {
    try {
      state.listenerStopFn();
    } catch {
      /* ignore teardown errors */
    }
    state.listenerStopFn = null;
  }
  // The listener is no longer running; a subsequent bootSocialInbox()
  // call (e.g. triggered by visibilitychange:visible on mobile) should
  // re-establish it. Keep the userId / config / friends so the re-boot
  // can skip the bootstrap round-trips.
  state.booted = false;
  if (!keepBootable) {
    detachVisibilityHandler();
    state.friends = [];
    state.userId = "";
    state.config = null;
    state.bootPromise = null;
  }
  eventBus.emit(SOCIAL_INBOX_STOPPED, { keepBootable });
}

export function getInboxUserId() {
  return state.userId;
}

export function getInboxFriends() {
  return state.friends;
}

export function isSocialInboxBooted() {
  return state.booted;
}

export function _resetSocialInboxServiceForTests() {
  if (state.listenerStopFn) {
    try {
      state.listenerStopFn();
    } catch {
      /* ignore */
    }
  }
  detachVisibilityHandler();
  state.userId = "";
  state.config = null;
  state.friends = [];
  state.listenerStopFn = null;
  state.bootPromise = null;
  state.booted = false;
  state.boundUserAgent = "";
}
