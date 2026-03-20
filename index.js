"use strict";

const { BehaviourRadar, stableStringify, simpleHash } = require("./src/behaviour-radar");

module.exports = {
  BehaviourRadar,
  BehaviourAI: BehaviourRadar,
  createTracker: (options) => new BehaviourRadar(options),
  stableStringify,
  simpleHash
};
