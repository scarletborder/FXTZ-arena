import type { BattleSceneData } from "../loadout";
import type { AccountSettings } from "./gamepad";

export function resolveAccountBattleProfile(
  account: Pick<AccountSettings, "p1ProfileId" | "p2ProfileId" | "battleProfile">,
  sceneData: Pick<BattleSceneData, "localSingleDevice">,
): string {
  if (sceneData.localSingleDevice) {
    return account.p1ProfileId;
  }
  return account.battleProfile === "Player2" ? account.p2ProfileId : account.p1ProfileId;
}
