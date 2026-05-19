import type { PendingSceneInput, ReceivedSceneInput } from "./types";

export class CombatInputQueues {
  readonly receive_scene: ReceivedSceneInput[] = [];
  readonly send_scene: PendingSceneInput[] = [];

  enqueueReceived(input: ReceivedSceneInput): void {
    this.receive_scene.push(input);
  }

  enqueuePending(input: PendingSceneInput): void {
    this.send_scene.push(input);
  }

  drainReceived(consumer: (input: ReceivedSceneInput) => void): void {
    while (this.receive_scene.length > 0) {
      consumer(this.receive_scene.shift()!);
    }
  }

  drainPending(consumer: (input: PendingSceneInput) => void): void {
    while (this.send_scene.length > 0) {
      consumer(this.send_scene.shift()!);
    }
  }
}
