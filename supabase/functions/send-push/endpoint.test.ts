import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedEndpoint } from "./endpoint.ts";

test("알려진 브라우저 푸시 서비스(https)만 허용 — 내부 주소·유사 도메인·포트·http 거부(SSRF)", () => {
  assert.equal(isAllowedEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isAllowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"), true);
  assert.equal(isAllowedEndpoint("https://wns2-db5p.notify.windows.com/w/?token=abc"), true);
  assert.equal(isAllowedEndpoint("https://web.push.apple.com/abc"), true);
  assert.equal(isAllowedEndpoint("https://127.0.0.1/x"), false);
  assert.equal(isAllowedEndpoint("https://[::1]/x"), false);
  assert.equal(isAllowedEndpoint("https://10.0.0.5/x"), false);
  assert.equal(isAllowedEndpoint("https://fcm.googleapis.com.evil.com/x"), false);
  assert.equal(isAllowedEndpoint("https://evilfcm.googleapis.com/x"), false);
  assert.equal(isAllowedEndpoint("https://fcm.googleapis.com:8443/x"), false);
  assert.equal(isAllowedEndpoint("https://user:pw@fcm.googleapis.com/x"), false);
  assert.equal(isAllowedEndpoint("http://fcm.googleapis.com/x"), false);
  assert.equal(isAllowedEndpoint("not a url"), false);
});

test("로컬 검증 모드는 http·임의 호스트 허용(운영 금지)", () => {
  assert.equal(isAllowedEndpoint("http://host.docker.internal:54999/ok", true), true);
  assert.equal(isAllowedEndpoint("javascript:alert(1)", true), false);
});
