"use strict";

const { MemoryAdapter } = require("./adapters/memory-adapter");

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sorted = {};

  for (const key of Object.keys(value).sort()) {
    const current = sortObject(value[key]);

    if (current !== undefined) {
      sorted[key] = current;
    }
  }

  return sorted;
}

function stableStringify(value) {
  return JSON.stringify(sortObject(value));
}

function simpleHash(input) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function toIsoDate(input) {
  const date = input ? new Date(input) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error("Event timestamp must be a valid date");
  }

  return date.toISOString();
}

class BehaviourRadar {
  constructor(options = {}) {
    this.actorSelector = options.actor || (() => "global");
    this.normalizer = options.normalizer || ((event) => ({ action: event.action, payload: event.payload || {} }));
    this.sequenceLimit = options.sequenceLimit || 25;
    this.rarePatternThreshold = options.rarePatternThreshold ?? 1;
    this.adapter =
      options.adapter ||
      new MemoryAdapter({
        maxActors: options.maxActors,
        maxPatterns: options.maxPatterns,
        actorTtlMs: options.actorTtlMs,
        patternTtlMs: options.patternTtlMs,
        windowMs: options.windowMs
      });
  }

  track(event) {
    const prepared = this.#prepareEvent(event);
    this.adapter.prepareFor(prepared.timestamp);

    const profile = this.adapter.getOrCreateActor(prepared.actorId, (actorId) => this.#createProfile(actorId));
    const previousAction = profile.lastAction;
    const existingPattern = this.adapter.getPattern(prepared.fingerprint);
    const isNewActionForActor = !profile.actionCounts.has(prepared.action);
    const isNewPattern = !existingPattern;
    const isRarePattern = Boolean(existingPattern && existingPattern.count <= this.rarePatternThreshold);
    const isNewTransition = Boolean(previousAction && !profile.transitions.has(`${previousAction}->${prepared.action}`));
    const currentActionCount = this.adapter.incrementAction(prepared.action);
    const actorActionCount = incrementProfileMap(profile.actionCounts, prepared.action);

    this.adapter.incrementTotalEvents();
    const storedPattern = this.adapter.recordPattern(prepared);

    if (!profile.firstSeenAt) {
      profile.firstSeenAt = prepared.timestamp;
    }

    profile.lastSeenAt = prepared.timestamp;
    profile.lastAction = prepared.action;
    profile.totalEvents += 1;

    profile.history.push({
      timestamp: prepared.timestamp,
      action: prepared.action,
      fingerprint: prepared.fingerprint
    });

    if (profile.history.length > this.sequenceLimit) {
      profile.history.shift();
    }

    if (previousAction) {
      const transitionKey = `${previousAction}->${prepared.action}`;
      incrementProfileMap(profile.transitions, transitionKey);
    }

    const anomaly = this.#scoreFlags({
      isNewActionForActor,
      isNewPattern,
      isRarePattern,
      isNewTransition
    });

    return {
      actorId: prepared.actorId,
      action: prepared.action,
      fingerprint: prepared.fingerprint,
      isNewPattern,
      patternCount: storedPattern.count,
      actionCount: currentActionCount,
      actorActionCount,
      anomaly
    };
  }

  trackMany(events) {
    if (!Array.isArray(events)) {
      throw new Error("trackMany expects an array of events");
    }

    return events.map((event) => this.track(event));
  }

  detectAnomaly(event) {
    const prepared = this.#prepareEvent(event);
    this.adapter.prepareFor(prepared.timestamp);

    const profile = this.adapter.getActor(prepared.actorId) || this.#createProfile(prepared.actorId);
    const previousAction = profile.lastAction;
    const existingPattern = this.adapter.getPattern(prepared.fingerprint);

    return this.#scoreFlags({
      isNewActionForActor: !profile.actionCounts.has(prepared.action),
      isNewPattern: !existingPattern,
      isRarePattern: Boolean(existingPattern && existingPattern.count <= this.rarePatternThreshold),
      isNewTransition: Boolean(previousAction && !profile.transitions.has(`${previousAction}->${prepared.action}`))
    });
  }

  getTopPatterns(options = {}) {
    return this.adapter.getTopPatterns(options);
  }

  getActorProfile(actorId) {
    const profile = this.adapter.getActor(actorId);

    if (!profile) {
      return null;
    }

    const actions = Object.fromEntries(
      Array.from(profile.actionCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    );

    const topTransitions = Array.from(profile.transitions.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([transition, count]) => ({ transition, count }));

    return {
      actorId,
      totalEvents: profile.totalEvents,
      firstSeenAt: profile.firstSeenAt,
      lastSeenAt: profile.lastSeenAt,
      lastAction: profile.lastAction,
      actions,
      topTransitions,
      recentHistory: profile.history.map((entry) => ({ ...entry }))
    };
  }

  findRoutines(actorId, options = {}) {
    const profile = this.adapter.getActor(actorId);

    if (!profile) {
      return [];
    }

    const limit = options.limit || 5;
    const minOccurrences = options.minOccurrences || 2;

    return Array.from(profile.transitions.entries())
      .filter(([, count]) => count >= minOccurrences)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, limit)
      .map(([transition, count]) => {
        const [from, to] = transition.split("->");
        return { from, to, transition, count };
      });
  }

  snapshot() {
    return {
      totalEvents: this.adapter.totalEvents,
      storage: this.adapter.getStats(),
      topPatterns: this.getTopPatterns({ limit: this.adapter.patterns.size || 5 }),
      actions: Object.fromEntries(
        Array.from(this.adapter.actionCounts.entries()).sort(
          (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
        )
      ),
      actors: Array.from(this.adapter.actorProfiles.keys())
        .sort()
        .map((actorId) => this.getActorProfile(actorId))
    };
  }

  getStats() {
    return this.adapter.getStats();
  }

  trim(referenceTimestamp = new Date().toISOString()) {
    this.adapter.prepareFor(toIsoDate(referenceTimestamp));
    return this.getStats();
  }

  #prepareEvent(event) {
    if (!event || typeof event !== "object") {
      throw new Error("Event must be an object");
    }

    if (!event.action || typeof event.action !== "string") {
      throw new Error("Event action is required");
    }

    const normalized = this.normalizer(event);

    if (!normalized || typeof normalized !== "object" || !normalized.action) {
      throw new Error("Normalizer must return an object with an action");
    }

    const action = normalized.action;
    const payload = normalized.payload || {};
    const actorId = String(this.actorSelector(event));
    const timestamp = toIsoDate(event.timestamp);
    const fingerprint = simpleHash(`${action}:${stableStringify(payload)}`);

    return {
      action,
      payload,
      actorId,
      timestamp,
      fingerprint
    };
  }

  #createProfile(actorId) {
    return {
      actorId,
      totalEvents: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      lastAction: null,
      actionCounts: new Map(),
      transitions: new Map(),
      history: []
    };
  }

  #scoreFlags(flags) {
    const reasons = [];
    let score = 0;

    if (flags.isNewActionForActor) {
      reasons.push("new-action-for-actor");
      score += 0.35;
    }

    if (flags.isNewPattern) {
      reasons.push("new-pattern");
      score += 0.35;
    } else if (flags.isRarePattern) {
      reasons.push("rare-pattern");
      score += 0.2;
    }

    if (flags.isNewTransition) {
      reasons.push("new-transition");
      score += 0.2;
    }

    if (reasons.length === 0) {
      reasons.push("familiar-behaviour");
    }

    const boundedScore = Math.min(Number(score.toFixed(2)), 1);

    return {
      score: boundedScore,
      level: boundedScore >= 0.7 ? "high" : boundedScore >= 0.35 ? "medium" : "low",
      reasons
    };
  }
}

module.exports = {
  BehaviourRadar,
  MemoryAdapter,
  stableStringify,
  simpleHash
};

function incrementProfileMap(map, key) {
  const next = (map.get(key) || 0) + 1;
  map.set(key, next);
  return next;
}
