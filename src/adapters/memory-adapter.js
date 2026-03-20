"use strict";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function incrementMap(map, key) {
  const next = (map.get(key) || 0) + 1;
  map.set(key, next);
  return next;
}

function toMilliseconds(value, optionName) {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${optionName} must be a non-negative number`);
  }

  return value;
}

function toPositiveLimit(value, optionName) {
  if (value === undefined || value === null) {
    return Infinity;
  }

  if (value === Infinity) {
    return Infinity;
  }

  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${optionName} must be a positive integer`);
  }

  return value;
}

class MemoryAdapter {
  constructor(options = {}) {
    this.maxActors = toPositiveLimit(options.maxActors, "maxActors");
    this.maxPatterns = toPositiveLimit(options.maxPatterns, "maxPatterns");
    this.actorTtlMs = toMilliseconds(options.actorTtlMs, "actorTtlMs");
    this.patternTtlMs = toMilliseconds(options.patternTtlMs, "patternTtlMs");
    this.windowMs = toMilliseconds(options.windowMs, "windowMs");

    this.totalEvents = 0;
    this.actionCounts = new Map();
    this.actorProfiles = new Map();
    this.patterns = new Map();
    this.topPatternsDirty = true;
    this.topPatternsCache = [];
  }

  prepareFor(timestamp) {
    this.#pruneActors(timestamp);
    this.#prunePatterns(timestamp);
  }

  incrementTotalEvents() {
    this.totalEvents += 1;
    return this.totalEvents;
  }

  incrementAction(action) {
    return incrementMap(this.actionCounts, action);
  }

  getActor(actorId) {
    return this.actorProfiles.get(actorId) || null;
  }

  getOrCreateActor(actorId, createProfile) {
    const existing = this.actorProfiles.get(actorId);

    if (existing) {
      return existing;
    }

    this.#enforceActorLimit();

    const profile = createProfile(actorId);
    this.actorProfiles.set(actorId, profile);
    return profile;
  }

  getPattern(fingerprint) {
    return this.patterns.get(fingerprint) || null;
  }

  recordPattern(prepared) {
    const existing = this.patterns.get(prepared.fingerprint);

    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = prepared.timestamp;
      existing.lastActorId = prepared.actorId;
      existing.actors.add(prepared.actorId);
      this.topPatternsDirty = true;
      return existing;
    }

    this.#enforcePatternLimit();

    const pattern = {
      fingerprint: prepared.fingerprint,
      action: prepared.action,
      count: 1,
      firstSeenAt: prepared.timestamp,
      lastSeenAt: prepared.timestamp,
      samplePayload: clone(prepared.payload),
      actors: new Set([prepared.actorId]),
      lastActorId: prepared.actorId
    };

    this.patterns.set(prepared.fingerprint, pattern);
    this.topPatternsDirty = true;
    return pattern;
  }

  getTopPatterns(options = {}) {
    const limit = options.limit || 5;
    const action = options.action;

    if (this.topPatternsDirty) {
      this.topPatternsCache = Array.from(this.patterns.values()).sort(
        (left, right) => right.count - left.count || left.action.localeCompare(right.action)
      );
      this.topPatternsDirty = false;
    }

    return this.topPatternsCache
      .filter((pattern) => !action || pattern.action === action)
      .slice(0, limit)
      .map((pattern) => ({
        fingerprint: pattern.fingerprint,
        action: pattern.action,
        count: pattern.count,
        actors: pattern.actors.size,
        firstSeenAt: pattern.firstSeenAt,
        lastSeenAt: pattern.lastSeenAt,
        samplePayload: clone(pattern.samplePayload)
      }));
  }

  getStats() {
    return {
      adapter: "memory",
      totalEvents: this.totalEvents,
      retainedActors: this.actorProfiles.size,
      retainedPatterns: this.patterns.size,
      limits: {
        maxActors: this.maxActors,
        maxPatterns: this.maxPatterns,
        actorTtlMs: this.actorTtlMs,
        patternTtlMs: this.patternTtlMs,
        windowMs: this.windowMs
      }
    };
  }

  #pruneActors(referenceTimestamp) {
    const cutoff = this.#getCutoff(referenceTimestamp, this.actorTtlMs);

    if (cutoff === null) {
      return;
    }

    for (const [actorId, profile] of this.actorProfiles.entries()) {
      if (Date.parse(profile.lastSeenAt || profile.firstSeenAt || referenceTimestamp) < cutoff) {
        this.actorProfiles.delete(actorId);
      }
    }
  }

  #prunePatterns(referenceTimestamp) {
    const cutoff = this.#getCutoff(referenceTimestamp, this.patternTtlMs);

    if (cutoff === null) {
      return;
    }

    for (const [fingerprint, pattern] of this.patterns.entries()) {
      if (Date.parse(pattern.lastSeenAt || referenceTimestamp) < cutoff) {
        this.patterns.delete(fingerprint);
        this.topPatternsDirty = true;
      }
    }
  }

  #getCutoff(referenceTimestamp, ttlMs) {
    if (ttlMs === null && this.windowMs === null) {
      return null;
    }

    const referenceTime = Date.parse(referenceTimestamp);
    const thresholds = [];

    if (ttlMs !== null) {
      thresholds.push(referenceTime - ttlMs);
    }

    if (this.windowMs !== null) {
      thresholds.push(referenceTime - this.windowMs);
    }

    return Math.max(...thresholds);
  }

  #enforceActorLimit() {
    if (this.maxActors === Infinity || this.actorProfiles.size < this.maxActors) {
      return;
    }

    const oldestActorId = this.#findOldestKey(this.actorProfiles, (profile) => profile.lastSeenAt || profile.firstSeenAt);

    if (oldestActorId !== null) {
      this.actorProfiles.delete(oldestActorId);
    }
  }

  #enforcePatternLimit() {
    if (this.maxPatterns === Infinity || this.patterns.size < this.maxPatterns) {
      return;
    }

    const oldestPatternKey = this.#findOldestKey(this.patterns, (pattern) => pattern.lastSeenAt);

    if (oldestPatternKey !== null) {
      this.patterns.delete(oldestPatternKey);
      this.topPatternsDirty = true;
    }
  }

  #findOldestKey(map, getTimestamp) {
    let oldestKey = null;
    let oldestValue = null;

    for (const [key, value] of map.entries()) {
      const timestamp = getTimestamp(value);

      if (oldestValue === null || timestamp < oldestValue) {
        oldestKey = key;
        oldestValue = timestamp;
      }
    }

    return oldestKey;
  }
}

module.exports = {
  MemoryAdapter
};
