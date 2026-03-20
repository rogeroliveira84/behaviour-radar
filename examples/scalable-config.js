"use strict";

const { BehaviourRadar } = require("..");

const radar = new BehaviourRadar({
  actor: (event) => event.userId,
  maxActors: 10000,
  maxPatterns: 50000,
  actorTtlMs: 1000 * 60 * 60 * 24,
  patternTtlMs: 1000 * 60 * 60 * 24,
  windowMs: 1000 * 60 * 60 * 24 * 7
});

radar.trackMany([
  { userId: "user-1", action: "LOGIN", timestamp: "2026-03-20T00:00:00.000Z" },
  { userId: "user-1", action: "VIEW_DASHBOARD", timestamp: "2026-03-20T00:05:00.000Z" },
  { userId: "user-2", action: "LOGIN", timestamp: "2026-03-20T00:10:00.000Z" }
]);

console.log("Storage stats");
console.log(radar.getStats());

console.log("\nTop patterns");
console.log(radar.getTopPatterns());
