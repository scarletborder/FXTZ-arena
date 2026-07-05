import type { BattleSceneData } from "../loadout";
import type { AccountSettings, InputProfileId } from "./gamepad";

export function resolveAccountBattleProfile(
  account: Pick<AccountSettings, "p1Profile" | "p2Profile" | "battleProfile">,
  sceneData: Pick<BattleSceneData, "localSingleDevice">,
): InputProfileId {
  if (sceneData.localSingleDevice) {
    return account.p1Profile;
  }
  return account.battleProfile === "Player2" ? account.p2Profile : account.p1Profile;
}
