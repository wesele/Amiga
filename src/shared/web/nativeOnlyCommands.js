/**
 * Web 版明确不支持的命令清单。
 *
 * 这里的每一条都表示：该命令在 Tauri（native）端注册，但浏览器演示版故意不实现，
 * 因为对应的 UI 在 web 模式下不可达（模块被 clientOnly 隐藏，或入口被 v-if="!isWebMode" 移除）。
 *
 * 新增条目前必须同时确认：
 *   1. 调用该命令的界面在 web 模式下确实不可达（隐藏 / 不渲染 / 无入口）；
 *   2. 不是为了「让 contractParity 测试变绿」而临时加白名单。
 * 如果对应功能在 web 模式下可用，就应该在 webBackend.js 里补上实现，而不是登记到这里。
 */
export const NATIVE_ONLY_COMMANDS = new Map([
  // 遗留命令：没有 UI 入口，仅保留以兼容旧调用
  ["greet", "legacy 命令，前端没有任何调用入口"],

  // speaking 模块整体在 web 模式隐藏
  ["speaking_list_topics_cmd", "web 模式隐藏 speaking 模块（clientOnly，LearnHubPage.vue）"],
  ["speaking_start_session_cmd", "web 模式隐藏 speaking 模块（clientOnly，LearnHubPage.vue）"],
  ["speaking_score_turn_cmd", "web 模式隐藏 speaking 模块（clientOnly，LearnHubPage.vue）"],
  ["speaking_record_live_turn_cmd", "web 模式隐藏 speaking 模块（clientOnly，LearnHubPage.vue）"],
  ["speaking_hint_cmd", "web 模式隐藏 speaking 模块（clientOnly，LearnHubPage.vue）"],
  ["speaking_translate_cmd", "web 模式隐藏 speaking 模块（clientOnly，LearnHubPage.vue）"],
  ["speaking_finish_cmd", "web 模式隐藏 speaking 模块（clientOnly，LearnHubPage.vue）"],

  // chat 模块整体在 web 模式隐藏（含 AI 对话与翻译官）
  ["chat_completion_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],
  ["chat_completion_with_session_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],
  ["chat_stream_with_session_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],
  ["create_chat_session_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],
  ["get_chat_sessions_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],
  ["delete_chat_session_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],
  ["get_chat_messages_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],
  ["update_chat_session_title_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],
  ["get_amiga_profile_cmd", "web 模式隐藏 chat 模块（clientOnly，AppShell.vue / LearnHubPage.vue）"],

  // 云同步仅 native 端可用
  ["test_cloud_sync_cmd", "设置页云同步区块在 web 模式隐藏（SettingsPage.vue 的 !isWebMode）"],
]);
