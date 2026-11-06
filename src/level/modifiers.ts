// 難度修正: which apply to a variant, and the move-speed factor they give an enemy.
import type { Difficulty, Modifier } from "./types.ts";

/**
 * Every modifier key seen in the main, activity, campaign and 集成戰略 level files (CN data,
 * 2026-11-07). The UI names each one; the pipeline warns about any key not listed.
 */
export const knownModifierKeys = [
  "ebuff_attribute",
  "enemy_attribute_mul",
  "enemy_attribute_add",
  "global_lifepoint",
  "gbuff_lifepoint",
  "env_system_new",
  "env_gbuff_new",
  "env_gbuff_new_with_verify",
  "level_hidden_group_enable",
  "level_hidden_group_disable",
  "level_predefines_enable",
  "level_enemy_replace",
  "level_deck_cards_enable",
  "level_input_card_delete",
  "char_attribute_mul",
  "char_attribute_mulkkk",
  "char_attribute_add",
  "cbuff_attribute",
  "char_respawntime_mul",
  "char_respawntime_add",
  "cbuff_respawn_time",
  "char_skill_cd_mul",
  "char_skill_cd_add",
  "char_cost_mul",
  "char_cost_add",
  "cbuff_char_cost",
  "char_blockcnt_add",
  "char_exclude",
  "cbuff_excluded",
  "char_talent_blackb_assign",
  "char_skill_blackb_add",
  "char_skill_blackb_mul",
  "char_shared_blackboard_assign",
  "char_dynamic_ability_new",
  "global_initial_cost_add",
  "cbuff_initial_cost",
  "cbuff_max_cost",
  "global_cost_recovery_mul",
  "cbuff_cost_recovery",
  "global_forbid_location",
  "global_placable_char_num_add",
  "gbuff_placable_char_num",
  "global_squad_num_limit",
  "global_token_cnt_add",
  "cbuff_token_initial_cnt",
  "global_enemy_taunt_level_pow",
  "enemy_talent_blackb_mul",
  "enemy_talent_blackb_add",
  "enemy_talent_blackb_max",
  "ebuff_talent_blackb_mul",
  "ebuff_talent_blackb_add",
  "enemy_skill_blackb_mul",
  "enemy_skill_blackb_add",
  "enemy_skill_cd_mul",
  "ebuff_skill_cd",
  "enemy_skill_init_cd_mul",
  "enemy_skill_radius_mul",
  "ebuff_skill_radius",
  "enemy_skill_sp_cost_add",
  "enemy_skill_sp_max_init_add",
  "enemy_attackradius_mul",
  "ebuff_attack_radius",
  "enemy_dynamic_ability_new",
  "enemy_weight_add",
  "ebuff_weight",
  "enemy_abnormal_immune",
  "map_tile_blackb_assign",
  "map_tile_blackb_add",
  "map_tile_blackb_mul",
  // 集成戰略 only.
  "level_predefine_tokens_random_spawn_on_tile",
  "level_predefines_skill_replace",
  "default_key",
] as const;

export type KnownModifierKey = (typeof knownModifierKeys)[number];

export function isKnownModifierKey(key: string): key is KnownModifierKey {
  return (knownModifierKeys as readonly string[]).includes(key);
}

/** A variant = the level file + the modifiers whose mask matches its difficulty. */
export function variantModifiers(modifiers: Modifier[], difficulty: Difficulty): Modifier[] {
  return modifiers.filter((m) => m.difficulties.includes(difficulty));
}

/** Enemy-attribute multiplier modifiers; their `move_speed` enters the movement model. */
const moveSpeedKeys = new Set(["ebuff_attribute", "enemy_attribute_mul"]);

function enemyList(modifier: Modifier, key: string): string[] | null {
  const entry = modifier.blackboard.find((b) => b.key === key);
  return entry?.valueStr ? entry.valueStr.split("|") : null;
}

/** Whether `modifier` enters the movement model (for every enemy, or the ones it names). */
export function affectsMovement(modifier: Modifier): boolean {
  return moveSpeedKeys.has(modifier.key) && modifier.blackboard.some((b) => b.key === "move_speed");
}

/** The blackboard's `enemy` list narrows a modifier to those enemies; `enemy_exclude` removes some. */
function movesEnemy(modifier: Modifier, enemyId: string): boolean {
  if (!affectsMovement(modifier)) return false;
  const only = enemyList(modifier, "enemy");
  if (only && !only.includes(enemyId)) return false;
  return !enemyList(modifier, "enemy_exclude")?.includes(enemyId);
}

/** Product of the `move_speed` factors the variant's modifiers give `enemyId`; 1 when none do. */
export function moveSpeedFactor(modifiers: Modifier[], enemyId: string): number {
  let factor = 1;
  for (const m of modifiers) {
    if (movesEnemy(m, enemyId)) factor *= m.blackboard.find((b) => b.key === "move_speed")!.value;
  }
  return factor;
}
