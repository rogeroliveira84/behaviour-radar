"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { BehaviourRadar, stableStringify } = require("..");

test("stableStringify sorts object keys", () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: 2, c: 3 } }),
    "{\"a\":{\"c\":3,\"d\":2},\"b\":1}"
  );
});

test("track aggregates repeated patterns and actor actions", () => {
  const radar = new BehaviourRadar({
    actor: (event) => event.userId
  });

  const first = radar.track({
    userId: "user-1",
    action: "LOGIN",
    payload: { country: "AU", method: "password" }
  });

  const second = radar.track({
    userId: "user-1",
    action: "LOGIN",
    payload: { method: "password", country: "AU" }
  });

  assert.equal(first.isNewPattern, true);
  assert.equal(second.isNewPattern, false);
  assert.equal(second.patternCount, 2);
  assert.equal(second.actorActionCount, 2);

  const topPattern = radar.getTopPatterns({ limit: 1 })[0];
  assert.equal(topPattern.count, 2);
  assert.equal(topPattern.action, "LOGIN");
});

test("findRoutines returns repeated transitions", () => {
  const radar = new BehaviourRadar({
    actor: (event) => event.userId
  });

  radar.trackMany([
    { userId: "user-1", action: "LOGIN" },
    { userId: "user-1", action: "VIEW_DASHBOARD" },
    { userId: "user-1", action: "LOGIN" },
    { userId: "user-1", action: "VIEW_DASHBOARD" },
    { userId: "user-1", action: "LOGIN" }
  ]);

  const routines = radar.findRoutines("user-1");

  assert.deepEqual(routines[0], {
    from: "LOGIN",
    to: "VIEW_DASHBOARD",
    transition: "LOGIN->VIEW_DASHBOARD",
    count: 2
  });
});

test("detectAnomaly explains why an event looks unusual", () => {
  const radar = new BehaviourRadar({
    actor: (event) => event.userId
  });

  radar.trackMany([
    { userId: "user-1", action: "LOGIN", payload: { method: "password" } },
    { userId: "user-1", action: "VIEW_DASHBOARD", payload: { section: "main" } }
  ]);

  const anomaly = radar.detectAnomaly({
    userId: "user-1",
    action: "TRANSFER_FUNDS",
    payload: { amount: 9000, destination: "new-wallet" }
  });

  assert.equal(anomaly.level, "high");
  assert.ok(anomaly.reasons.includes("new-action-for-actor"));
  assert.ok(anomaly.reasons.includes("new-pattern"));
});
