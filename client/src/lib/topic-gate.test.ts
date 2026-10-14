import { test } from "node:test";
import assert from "node:assert/strict";
import { createTopicGate } from "./topic-gate.ts";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("같은 토픽은 이전 해제가 끝난 뒤에만 다시 연다(StrictMode 재마운트·빠른 재구독)", async () => {
  const gate = createTopicGate();
  const log: string[] = [];
  let finishClose = () => {};
  const opener = (tag: string) => () => {
    log.push(`open ${tag}`);
    return () => {
      log.push(`close ${tag}`);
      return new Promise<void>((resolve) => {
        finishClose = resolve;
      });
    };
  };

  const off1 = gate("room:1", opener("a"));
  await flush();
  off1(); // 해제 시작(아직 끝나지 않음)
  const off2 = gate("room:1", opener("b"));
  await flush();
  assert.deepEqual(log, ["open a", "close a"], "해제가 끝나기 전에는 열지 않는다");
  finishClose();
  await flush();
  assert.deepEqual(log, ["open a", "close a", "open b"]);
  off2();
});

test("열리기 전에 해제하면 아예 열지 않는다, 다른 토픽은 서로 기다리지 않는다", async () => {
  const gate = createTopicGate();
  const log: string[] = [];
  const opener = (tag: string) => () => {
    log.push(`open ${tag}`);
    return async () => {
      log.push(`close ${tag}`);
    };
  };
  gate("room:2", opener("x"))();
  gate("room:3", opener("y"));
  await flush();
  assert.deepEqual(log, ["open y"]);
});
