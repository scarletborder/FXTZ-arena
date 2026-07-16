import { describe } from "vitest";

import { defineCharacterRollbackTests } from "./character-suite";
import { CHARACTER_IDS } from "./matrix";

describe("character rollback hash consistency shard 1", () => {
  defineCharacterRollbackTests(
    CHARACTER_IDS.filter((_character, index) => index % 4 === 1),
  );
});
