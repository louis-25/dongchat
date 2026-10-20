import { test } from "node:test";
import assert from "node:assert/strict";
import { albumRows, chunkFiles, imageLabel } from "./album.ts";

test("사진 묶음 배치: 3칸씩, 끝이 1장 남으면 2+2", () => {
  assert.deepEqual(albumRows(1), [1]);
  assert.deepEqual(albumRows(2), [2]);
  assert.deepEqual(albumRows(3), [3]);
  assert.deepEqual(albumRows(4), [2, 2]);
  assert.deepEqual(albumRows(5), [3, 2]);
  assert.deepEqual(albumRows(7), [3, 2, 2]);
  assert.deepEqual(albumRows(8), [3, 3, 2]);
  assert.deepEqual(albumRows(10), [3, 3, 2, 2]);
});

test("10장씩 나눠 보낸다", () => {
  assert.deepEqual(chunkFiles([1, 2, 3], 10), [[1, 2, 3]]);
  assert.deepEqual(chunkFiles(Array.from({ length: 23 }, (_, i) => i), 10).map((c) => c.length), [10, 10, 3]);
});

test("미리보기 문구", () => {
  assert.equal(imageLabel(1), "(사진)");
  assert.equal(imageLabel(5), "(사진 5장)");
});
