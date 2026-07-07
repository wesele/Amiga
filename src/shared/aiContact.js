import { createChatSession, getChatSessions } from "@/shared/backend/chat.js";
import { getCurrentUser } from "@/shared/backend/user.js";

/**
 * Open an AI contact chat (amiga / translator). Finds an existing session
 * for the contact type or creates one, then navigates to the chat page.
 */
export async function openAiContact(
  router,
  contact,
  { routeName = "chat-session", targetLang, initialMessage } = {},
) {
  let sessions = [];
  try {
    sessions = await getChatSessions(targetLang);
  } catch {
    sessions = [];
  }

  let session = sessions.find((item) => item.contact_type === contact.contactType);
  if (!session) {
    try {
      const user = await getCurrentUser();
      const uid = user?.id || "default";
      const sid = await createChatSession(uid, contact.name, contact.contactType, targetLang);
      session = { id: sid, contact_type: contact.contactType };
    } catch {
      return false;
    }
  }

  const query = initialMessage ? { message: initialMessage } : {};
  await router.push({ name: routeName, params: { sessionId: session.id }, query });
  return true;
}
