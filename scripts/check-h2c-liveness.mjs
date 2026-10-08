import assert from "node:assert/strict";
import http2 from "node:http2";
import { setTimeout as delay } from "node:timers/promises";

// Go's h2c handoff must clear ReadHeaderTimeout before serving HTTP/2.
// Keep one connection active beyond the official five-second header timeout.
const origin = process.argv[2] ?? "http://127.0.0.1:18080";
const session = http2.connect(origin);
let connectionError;
session.on("error", (error) => { connectionError = error; });
session.on("goaway", () => { connectionError = new Error("unexpected HTTP/2 GOAWAY"); });

try {
  const started = Date.now();
  let completed = 0;
  while (Date.now() - started < 8_000) {
    if (connectionError) throw connectionError;
    assert.ok(!session.closed && !session.destroyed, "HTTP/2 connection closed early");
    await new Promise((resolve, reject) => {
      const request = session.request({ ":path": "/api/v1/setting" });
      request.setTimeout(2_000, () => request.destroy(new Error("HTTP/2 request timed out")));
      request.on("error", reject);
      request.on("response", (headers) => {
        if (headers[":status"] !== 200) {
          request.destroy(new Error(`unexpected HTTP status ${headers[":status"]}`));
        }
      });
      request.on("end", resolve);
      request.resume();
      request.end();
    });
    completed += 1;
    await delay(200);
  }
  if (connectionError) throw connectionError;
  assert.ok(!session.closed && !session.destroyed, "HTTP/2 connection closed early");
  console.log(`h2c liveness passed: one connection, ${completed} requests, over eight seconds`);
} finally {
  session.destroy();
}
