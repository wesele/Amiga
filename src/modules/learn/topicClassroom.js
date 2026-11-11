const KEY = "amiga.topicClassroom";

export function getTopicClassroom() {
  try {
    const course = JSON.parse(sessionStorage.getItem(KEY));
    return course?.plan?.kind === "topic" ? course : null;
  } catch {
    return null;
  }
}

export function storeTopicClassroom(course) {
  sessionStorage.setItem(KEY, JSON.stringify(course));
}

export function saveTopicClassroomSession(topicId, session) {
  const course = getTopicClassroom();
  if (course?.plan.version !== topicId || course.plan.version !== session.plan_version)
    throw new Error("Classroom version changed");
  const saved = { ...session, revision: session.revision + 1 };
  storeTopicClassroom({ ...course, session: saved });
  return saved;
}
