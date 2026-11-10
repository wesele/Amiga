import { ref, computed } from "vue";
import {
  freshSession,
  teacherInstruction,
  teachingLanguageInstruction,
  classroomId,
} from "./teachingPlan.js";
import { emptyBoard, boardEntry, writeBoard, restoreBoard } from "./classroomBoard.js";
import { useClassroomLive } from "./useClassroomLive.js";

export function useClassroom({
  plan,
  savedSession,
  saveSession,
  getConfig,
  liveFactory = useClassroomLive,
}) {
  const session = ref({
    ...freshSession(plan),
    ...savedSession,
    teaching_language: savedSession?.teaching_language === "target" ? "target" : "native",
  });
  session.value.board = restoreBoard(
    session.value.board,
    plan.nodes[session.value.node_index],
    session.value.teaching_language,
  );
  const phase = ref(session.value.phase === "completed" ? "completed" : "ready");
  const saveError = ref("");
  const notice = ref("");
  const connecting = ref(false);
  const changingLanguage = ref(false);
  const node = computed(() => plan.nodes[session.value.node_index]);
  const beat = computed(() => node.value.beats[session.value.beat_index]);
  const progress = computed(() =>
    Math.round(
      (session.value.completed_beats.length / plan.nodes.reduce((n, p) => n + p.beats.length, 0)) *
        100,
    ),
  );
  const transcript = computed(() => session.value.turns);
  const board = computed(() => session.value.board);
  let pendingBoard = new Map(),
    audibleEpoch = -1;
  let epoch = 0,
    outcome = null,
    turnDone = false,
    task = null,
    studentStarted = false;
  let saveChain = Promise.resolve(),
    saveTimer,
    pauseTimer,
    responseTimer,
    stopped = false;
  let restorePractice = false;
  const live = liveFactory({
    onEvent,
    onTool,
    acceptOutput: () => !["paused", "ready", "completed", "playing_source"].includes(phase.value),
  });
  const key = () => `${node.value.id}/${beat.value.id}`;
  const practice = () => session.value.interactions[node.value.id];

  function record(role, text) {
    if (!text) return;
    const turns = session.value.turns;
    const last = turns[turns.length - 1];
    if (last?.role === role && last.epoch === epoch) last.text = (last.text + text).slice(-4000);
    else turns.push({ role, text: String(text).slice(0, 4000), epoch });
    if (turns.length > 40) turns.splice(0, turns.length - 40);
    if (role === "teacher") {
      const current = turns[turns.length - 1];
      current.text = current.text.replace(/<no speech>|\{pause\}/gi, "");
    }
    while (
      new TextEncoder().encode(JSON.stringify(session.value)).length > 220000 &&
      turns.length > 2
    )
      turns.shift();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 800);
  }
  function persist() {
    clearTimeout(saveTimer);
    const snapshot = JSON.parse(JSON.stringify(session.value));
    snapshot.phase = phase.value === "completed" ? "completed" : "paused";
    // Serialize saves; older network responses cannot overwrite a newer cursor.
    saveChain = saveChain.then(async () => {
      snapshot.revision = session.value.revision;
      try {
        const result = await saveSession(snapshot);
        session.value.revision = result.revision;
        saveError.value = "";
      } catch (error) {
        saveError.value = String(error?.message || error);
      }
    });
    return saveChain;
  }
  function request(kind, instruction) {
    epoch += 1;
    pendingBoard.clear();
    audibleEpoch = -1;
    if (board.value.node_id !== node.value.id)
      session.value.board = emptyBoard(node.value, session.value.teaching_language);
    outcome = null;
    turnDone = false;
    studentStarted = false;
    task = kind;
    phase.value = kind === "interaction" ? "inviting" : "teaching";
    const state = {
      control_epoch: epoch,
      node_id: node.value.id,
      beat_id: beat.value.id,
      interaction_id: practice()?.id || null,
      interaction_mode: session.value.interaction_mode,
      interactions: Object.fromEntries(
        Object.entries(session.value.interactions).map(([id, value]) => [
          id,
          { id: value.id, status: value.status },
        ]),
      ),
      objective: kind === "interaction" ? node.value.practice?.objective : beat.value.objective,
      recent_turns: session.value.turns.slice(-6),
      source: node.value.source,
      teaching_language: session.value.teaching_language,
      teaching_language_code:
        session.value.teaching_language === "target" ? plan.target_language : plan.native_language,
      cefr_level: plan.cefr_level,
      board: board.value.items,
    };
    live.send(
      `${instruction}\n${teachingLanguageInstruction(plan, session.value.teaching_language)}\nCurrent classroom state: ${JSON.stringify(state)}`,
    );
    clearTimeout(responseTimer);
    const requestedEpoch = epoch;
    responseTimer = setTimeout(() => {
      if (stopped || epoch !== requestedEpoch) return;
      pause();
      notice.value = "老师暂未回应，请点击继续上课重试";
      void live.disconnect();
    }, 20000);
  }
  function teach() {
    request(
      "lecture",
      "Explain only this beat naturally, adapting to the recent conversation. Write short board notes with write_classroom_board AS you explain each idea. Do not repeat already clear material. Then call complete_teaching_beat and end your turn. Do not start a practice yet.",
    );
  }
  function invite() {
    const old = practice();
    if (!old || ["answered", "skipped"].includes(old.status))
      session.value.interactions[node.value.id] = { id: classroomId(), status: "pending" };
    restorePractice = false;
    request(
      "interaction",
      "Invite the current optional speaking practice naturally: call begin_interaction, ask ONE short question, END YOUR TURN and wait for the student. Do not answer the question yourself.",
    );
  }
  function advanceNode() {
    if (session.value.node_index + 1 >= plan.nodes.length) {
      clearTimeout(responseTimer);
      phase.value = "completed";
      session.value.summary = plan.goals.join(" · ");
      live.silence();
      void live.stopMic();
      void live.disconnect();
      void persist();
    } else {
      session.value.node_index += 1;
      session.value.beat_index = 0;
      void persist();
      teach();
    }
  }
  function afterTeaching() {
    if (session.value.beat_index + 1 < node.value.beats.length) {
      session.value.beat_index += 1;
      void persist();
      teach();
      return;
    }
    if (
      node.value.practice &&
      session.value.interaction_mode === "guided" &&
      !["answered", "skipped"].includes(practice()?.status)
    )
      invite();
    else advanceNode();
  }
  function settle() {
    if (
      !turnDone ||
      live.speaking.value ||
      ["ready", "paused", "completed", "playing_source"].includes(phase.value)
    )
      return;
    turnDone = false;
    clearTimeout(responseTimer);
    const result = outcome;
    outcome = null;
    if (result === "question") {
      phase.value = "awaiting_continue";
      void persist();
      return;
    }
    if (result === "invite") {
      phase.value = "awaiting_answer";
      practice().status = "awaiting_answer";
      void persist();
      return;
    }
    if (result === "feedback") {
      restorePractice = false;
      if (practice()?.status !== "skipped") practice().status = "answered";
      void persist();
      advanceNode();
      return;
    }
    if (result === "beat") {
      if (!session.value.completed_beats.includes(key())) session.value.completed_beats.push(key());
      void persist();
      afterTeaching();
      return;
    }
    // Missing/invalid tools cannot silently advance a lesson.
    phase.value = "awaiting_continue";
    notice.value = "老师已停下，准备好后可以继续";
    void persist();
  }
  function onTool(name, args) {
    if (
      stopped ||
      args.control_epoch !== epoch ||
      (["paused", "completed", "ready", "playing_source"].includes(phase.value) &&
        name !== "request_classroom_control")
    )
      return { ok: false, reason: "Stale turn or paused lesson" };
    if (name === "write_classroom_board") {
      if (
        args.node_id !== node.value.id ||
        args.beat_id !== beat.value.id ||
        phase.value === "listening"
      )
        return { ok: false, reason: "Board does not match current teaching step" };
      const entry = boardEntry(node.value, args.kind, args.text);
      if (!entry) return { ok: false, reason: "Invalid board note" };
      pendingBoard.set(entry.kind, entry);
      if (audibleEpoch === epoch) flushBoard();
      return { ok: true };
    }
    if (
      name === "complete_teaching_beat" &&
      task === "lecture" &&
      !studentStarted &&
      args.node_id === node.value.id &&
      args.beat_id === beat.value.id
    )
      outcome = "beat";
    else if (
      name === "begin_interaction" &&
      task === "interaction" &&
      args.interaction_id === practice()?.id &&
      session.value.interaction_mode === "guided" &&
      practice()?.status !== "skipped"
    )
      outcome = "invite";
    else if (
      name === "finish_interaction" &&
      studentStarted &&
      args.interaction_id === practice()?.id &&
      practice()?.status !== "skipped"
    ) {
      outcome = "feedback";
      phase.value = "feedback";
      practice().feedback = String(args.feedback || "").slice(0, 1000);
    } else if (name === "report_student_question") {
      outcome = "question";
      phase.value = "answering";
      restorePractice = task === "interaction";
    } else if (name === "request_classroom_control") {
      const handlers = {
        pause,
        continue: resume,
        skip: skipInteraction,
        listen_only: () => setInteractionMode("listen_only"),
        guided: () => setInteractionMode("guided"),
      };
      if (!handlers[args.action]) return { ok: false };
      queueMicrotask(() => {
        if (args.control_epoch === epoch && !stopped) handlers[args.action]();
      });
    } else return { ok: false, reason: "Tool does not match the current lesson step" };
    return { ok: true };
  }
  function onEvent(event) {
    if (stopped) return;
    if (event.type === "ready") {
      connecting.value = false;
      // Capture is opt-in: background speech must not interrupt the first
      // explanation before the learner has chosen to turn on the microphone.
      if (
        restorePractice ||
        (session.value.completed_beats.includes(key()) &&
          node.value.practice &&
          !["answered", "skipped"].includes(practice()?.status) &&
          session.value.interaction_mode === "guided")
      )
        invite();
      else if (session.value.completed_beats.includes(key())) afterTeaching();
      else teach();
    }
    if (event.type === "interrupted") {
      clearTimeout(responseTimer);
      pendingBoard.clear();
      audibleEpoch = -1;
      outcome = null;
      turnDone = false;
      studentStarted = true;
      phase.value = "listening";
    }
    if (event.type === "student_text") {
      clearTimeout(responseTimer);
      if (phase.value === "paused") phase.value = "listening";
      if (!studentStarted) {
        outcome = null;
        turnDone = false;
        studentStarted = true;
      }
      record("user", event.text);
    }
    if (event.type === "teacher_text") {
      clearTimeout(responseTimer);
      record("teacher", event.text);
    }
    if (
      event.type === "audio_started" &&
      !["ready", "paused", "completed", "playing_source"].includes(phase.value)
    ) {
      clearTimeout(responseTimer);
      audibleEpoch = epoch;
      // A trustworthy starting quote still appears if the model omits a board call.
      if (!board.value.items.length && task === "lecture") {
        for (const kind of ["source", "expression"]) {
          const entry = boardEntry(node.value, kind);
          if (entry) session.value.board = writeBoard(board.value, entry);
        }
        void persist();
      }
      flushBoard();
    }
    if (
      event.type === "turn_ended" &&
      !["awaiting_answer", "awaiting_continue"].includes(phase.value)
    ) {
      if (!event.cancelled) {
        turnDone = true;
        settle();
      }
    }
    if (event.type === "audio_drained") settle();
    if (event.type === "connection_lost" || event.type === "go_away") {
      pause();
      connecting.value = false;
      notice.value = "连接已暂停，点击继续上课重新连接";
      void live.disconnect();
    }
  }
  function flushBoard() {
    if (!pendingBoard.size) return;
    for (const entry of pendingBoard.values()) session.value.board = writeBoard(board.value, entry);
    pendingBoard.clear();
    void persist();
  }
  async function start() {
    if (connecting.value || changingLanguage.value) return;
    stopped = false;
    connecting.value = true;
    notice.value = "";
    if (phase.value === "completed") {
      const revision = session.value.revision;
      const interaction_mode = session.value.interaction_mode;
      const teaching_language = session.value.teaching_language;
      session.value = {
        ...freshSession(plan),
        revision,
        interaction_mode,
        teaching_language,
        board: emptyBoard(plan.nodes[0], teaching_language),
      };
      live.clearResumption();
    }
    try {
      const config = await getConfig();
      if (!stopped)
        await live.connect(config, teacherInstruction(plan, session.value.teaching_language));
    } catch (error) {
      connecting.value = false;
      phase.value = "paused";
      notice.value = String(error?.message || error);
    }
  }
  function pause() {
    if (phase.value === "completed") return;
    epoch += 1;
    clearTimeout(responseTimer);
    pendingBoard.clear();
    audibleEpoch = -1;
    outcome = null;
    turnDone = false;
    if (["inviting", "awaiting_answer", "feedback"].includes(phase.value)) restorePractice = true;
    phase.value = "paused";
    live.silence(
      `control_epoch=${epoch}. The student paused the lesson. End your current turn and stay silent. Do not call control tools for this app instruction. The microphone may remain on for student questions and explicit continue.`,
    );
    void persist();
    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => {
      if (phase.value === "paused") void live.disconnect();
    }, 120000);
  }
  function resume() {
    clearTimeout(pauseTimer);
    notice.value = "";
    if (!live.connected.value || phase.value === "completed") {
      void start();
      return;
    }
    if (restorePractice || phase.value === "awaiting_answer") invite();
    else if (session.value.completed_beats.includes(key())) afterTeaching();
    else teach();
  }
  function ask(text) {
    const value = String(text).trim();
    if (!value || !live.connected.value) return;
    if (/^(继续|继续上课|继续讲|continue|continúa)[。!！]?$/iu.test(value)) {
      resume();
      return;
    }
    if (/^(暂停|停一下|pause)[。!！]?$/iu.test(value)) {
      pause();
      return;
    }
    if (/^(跳过|跳过这次互动|skip|saltar)[。!！]?$/iu.test(value)) {
      skipInteraction();
      return;
    }
    const isAnswer = ["awaiting_answer", "inviting"].includes(phase.value) && !restorePractice;
    restorePractice = !isAnswer && (restorePractice || task === "interaction");
    epoch += 1;
    pendingBoard.clear();
    audibleEpoch = -1;
    outcome = isAnswer ? null : "question";
    turnDone = false;
    studentStarted = true;
    phase.value = isAnswer ? "feedback" : "answering";
    record("user", value);
    live.send(
      `${isAnswer ? "Student practice answer. Give brief feedback and call finish_interaction." : "Student question. Answer directly, call report_student_question, then wait for explicit continue."}\n${teachingLanguageInstruction(plan, session.value.teaching_language)}\ncontrol_epoch=${epoch}; interaction_id=${practice()?.id || "none"}; node_id=${node.value.id}; beat_id=${beat.value.id}\nStudent: ${value}`,
    );
  }
  function skipInteraction() {
    if (!node.value.practice || !practice() || ["answered", "skipped"].includes(practice().status))
      return;
    practice().status = "skipped";
    epoch += 1;
    outcome = null;
    turnDone = false;
    restorePractice = false;
    live.stopAudio();
    void persist();
    if (session.value.completed_beats.includes(key())) advanceNode();
    else teach();
  }
  function setInteractionMode(mode) {
    session.value.interaction_mode = mode;
    if (
      mode === "listen_only" &&
      practice() &&
      !["answered", "skipped"].includes(practice().status)
    )
      skipInteraction();
    else {
      void persist();
      // Let an in-flight explanation finish. The controller applies this
      // preference before inviting practice and includes it in the next turn.
    }
  }
  async function setTeachingLanguage(mode) {
    if (
      !["native", "target"].includes(mode) ||
      mode === session.value.teaching_language ||
      connecting.value ||
      changingLanguage.value
    )
      return;
    changingLanguage.value = true;
    try {
      if (phase.value !== "ready" && phase.value !== "completed") pause();
      session.value.teaching_language = mode;
      session.value.board = emptyBoard(node.value, mode);
      pendingBoard.clear();
      audibleEpoch = -1;
      live.clearResumption();
      await live.disconnect();
      await persist();
    } finally {
      changingLanguage.value = false;
    }
  }
  async function suspend() {
    pause();
    await live.disconnect();
    await persist();
  }
  async function close() {
    stopped = true;
    clearTimeout(saveTimer);
    clearTimeout(pauseTimer);
    clearTimeout(responseTimer);
    await live.disconnect();
    await persist();
  }
  return {
    session,
    phase,
    node,
    beat,
    progress,
    transcript,
    board,
    live,
    saveError,
    notice,
    connecting,
    changingLanguage,
    start,
    pause,
    resume,
    ask,
    skipInteraction,
    setInteractionMode,
    setTeachingLanguage,
    persist,
    suspend,
    close,
  };
}
