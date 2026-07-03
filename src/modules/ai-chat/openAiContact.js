import { createChatSession, getChatSessions, getCurrentUser } from "@/shared/api.js";

/**
 * Open an AI contact chat (amiga / translator). Finds an existing session
 * for the contact type or creates one, then navigates to the chat page.
 */
export async function openAiContact(
  router,
  contact,
  { routeName = "chat-session", targetLang, starterId, starterParams } = {},
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

  const query = {};
  if (starterId) query.starterId = starterId;
  if (starterParams?.words) query.words = starterParams.words;

  await router.push({
    name: routeName,
    params: { sessionId: session.id },
    ...(Object.keys(query).length ? { query } : {}),
  });
  return true;
}