"use strict";

const { BehaviourRadar } = require("..");

const radar = new BehaviourRadar({
  actor: (event) => event.userId || "anonymous",
  normalizer: (event) => ({
    action: event.action,
    payload: {
      ...event.payload,
      requestId: undefined
    }
  })
});

radar.trackMany([
  {
    userId: "user-42",
    action: "LOGIN",
    payload: { method: "password", country: "AU", requestId: "req-1" }
  },
  {
    userId: "user-42",
    action: "VIEW_DASHBOARD",
    payload: { section: "portfolio", requestId: "req-2" }
  },
  {
    userId: "user-42",
    action: "BUY_ASSET",
    payload: { symbol: "ETH", amount: 2, requestId: "req-3" }
  },
  {
    userId: "user-42",
    action: "LOGIN",
    payload: { method: "password", country: "AU", requestId: "req-4" }
  }
]);

console.log("Top patterns");
console.log(radar.getTopPatterns({ limit: 3 }));

console.log("\nActor profile");
console.log(radar.getActorProfile("user-42"));

console.log("\nDetected routines");
console.log(radar.findRoutines("user-42", { minOccurrences: 1 }));

console.log("\nAnomaly preview");
console.log(
  radar.detectAnomaly({
    userId: "user-42",
    action: "TRANSFER_FUNDS",
    payload: { amount: 50000, destination: "new-wallet" }
  })
);
