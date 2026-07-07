import type { BattleSceneData } from "../loadout";
import type { AccountSettings, InputProfileId } from "./gamepad";

export function resolveAccountBattleProfileId(
  account: Pick<AccountSettings, "p1ProfileId" | "p2ProfileId" | "battleProfile">,
  sceneData: Pick<BattleSceneData, "localSingleDevice">,
): string {
  if (sceneData.localSingleDevice) {
    return account.p1ProfileId;
  }
  return account.battleProfile === "Player2" ? account.p2ProfileId : account.p1ProfileId;
}

export function resolveAccountBattleInput(
  account: Pick<AccountSettings, "p1Input" | "p2Input" | "battleProfile">,
  sceneData: Pick<BattleSceneData, "localSingleDevice">,
): InputProfileId {
  if (sceneData.localSingleDevice) {
    return account.p1Input;
  }
  return account.battleProfile === "Player2" ? account.p2Input : account.p1Input;
}

export const resolveAccountBattleProfile = resolveAccountBattleProfileId;

export interface RuntimeBattleInputCapabilities {
  readonly mobileControlsEnabled: boolean;
  readonly joystickAvailable?: boolean;
}

export function resolveRuntimeBattleInput(
  requestedInput: InputProfileId,
  capabilities: RuntimeBattleInputCapabilities,
): InputProfileId {
  if (requestedInput === "mobile" && !capabilities.mobileControlsEnabled) {
    return "keyboard";
  }
  if (requestedInput.startsWith("joystick:") && capabilities.joystickAvailable === false) {
    return "keyboard";
  }
  return requestedInput;
}
