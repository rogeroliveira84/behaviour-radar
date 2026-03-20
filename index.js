"use strict";

const { BehaviourRadar, MemoryAdapter, stableStringify, simpleHash } = require("./src/behaviour-radar");

module.exports = {
  BehaviourRadar,
  BehaviourAI: BehaviourRadar,
  MemoryAdapter,
  createTracker: (options) => new BehaviourRadar(options),
  stableStringify,
  simpleHash
};
