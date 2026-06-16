export const BattleEvents = {
  RESTART_LOCAL: "battle:restart_local",
  MAIN_MENU: "battle:main_menu",
  GO_TO_RESULT: "battle:go_to_result",
  GO_TO_STORY_RESULT: "battle:go_to_story_result",
  GO_TO_ONLINE_RESULT: "battle:go_to_online_result",
  RECORD_FRAME: "battle:record_frame",
  TRANSITION_READY: "battle:transition_ready",
  SHOP_READY: "battle:shop_ready",
  SYNC_ROLLBACK_MANAGER_STATE: "battle:sync_rollback_manager_state",
  RESET_ACCUMULATOR: "battle:reset_accumulator",
  PRINT_DEBUG_HASH_BUNDLE: "battle:print_debug_hash_bundle",
  END_REPLAY: "battle:end_replay",
} as const;