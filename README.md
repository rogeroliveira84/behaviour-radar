# Behaviour Radar

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-0A7B83)](https://github.com/rogeroliveira84/behaviour-ai)
[![Tests](https://img.shields.io/badge/tests-node--test-1E293B)](https://nodejs.org/api/test.html)
[![Behaviour analytics](https://img.shields.io/badge/focus-behaviour%20analytics-F97316)](https://github.com/rogeroliveira84/behaviour-ai)
[![GitHub stars](https://img.shields.io/github/stars/rogeroliveira84/behaviour-ai)](https://github.com/rogeroliveira84/behaviour-ai)

Behaviour Radar is a tiny JavaScript library for turning raw events into clear behavioural signals.

Think of it as the missing layer between plain event logs and heavyweight analytics platforms. You send in actions like `LOGIN`, `PURCHASE`, or `TRANSFER_FUNDS`, and it gives you a compact behavioural memory:

- repeated patterns
- per-user or per-device profiles
- common routines
- anomaly hints you can actually explain

It is intentionally simple: no external dependencies, no training pipeline, and no infrastructure setup. Feed it events, then query patterns, profiles, routines, and anomaly signals in a few lines of code.

## Why it feels different

The original project counted exact duplicate payloads. This version keeps that spirit, but turns it into something you can actually build on:

- Stable event fingerprinting with configurable normalization
- Per-actor profiles and action frequency summaries
- Transition tracking to detect common routines
- Simple anomaly scoring for rare or new behaviour
- Portable Node.js package with tests and example usage

## What you can answer with it

- What does this user usually do next?
- Which behaviours are becoming a habit?
- What changed in this actor's pattern today?
- Is this event familiar, rare, or suspicious?
- Which sequences are most common across my system?

## How it works

```mermaid
flowchart LR
    A["Raw events"] --> B["Normalize payload"]
    B --> C["Fingerprint pattern"]
    C --> D["Update actor profile"]
    D --> E["Track transitions"]
    E --> F["Return insights"]

    F --> G["Top patterns"]
    F --> H["Actor routines"]
    F --> I["Anomaly hints"]
```

## Perfect for

- Product teams that want behavioural insight without adopting a full analytics stack
- Fraud and risk flows that need quick, explainable anomaly hints
- Internal tools that want to learn user habits from workflow events
- Prototypes and AI agents that need behavioural memory in-process

## Install

```bash
npm install github:rogeroliveira84/behaviour-ai
```

Or clone and run locally:

```bash
git clone https://github.com/rogeroliveira84/behaviour-ai.git
cd behaviour-ai
npm test
node examples/quick-start.js
```

## In 30 seconds

You define how to identify the actor, send in events, and immediately query the behavioural model.

```js
const { BehaviourRadar } = require("behaviour-ai");

const radar = new BehaviourRadar({
  actor: (event) => event.userId || event.deviceId || "anonymous"
});

radar.track({
  userId: "user-42",
  action: "LOGIN",
  payload: { method: "password", country: "AU" }
});

radar.track({
  userId: "user-42",
  action: "VIEW_DASHBOARD",
  payload: { section: "portfolio" }
});

radar.track({
  userId: "user-42",
  action: "BUY_ASSET",
  payload: { symbol: "ETH", amount: 2 }
});

console.log(radar.getTopPatterns());
console.log(radar.getActorProfile("user-42"));
console.log(radar.findRoutines("user-42"));
console.log(
  radar.detectAnomaly({
    userId: "user-42",
    action: "TRANSFER_FUNDS",
    payload: { amount: 50000, destination: "new-wallet" }
  })
);
```

## Example output

```js
[
  {
    fingerprint: "98b0df32",
    action: "LOGIN",
    count: 3,
    lastSeenAt: "2026-03-20T05:10:00.000Z"
  }
]
```

## Why teams tend to like it

| Behaviour Radar | Traditional analytics setup |
|----------|-----------------------------|
| In-process and lightweight | Usually external and infrastructure-heavy |
| Optimized for behavioural patterns | Optimized for dashboards and reporting |
| Explainable anomaly reasons | Often opaque scoring or no anomaly layer |
| Simple JavaScript API | Multiple services, schemas, and ETL steps |

## API

### `new BehaviourRadar(options?)`

Create a tracker instance.

Options:

- `actor(event)`: returns the actor id. Default is `"global"`.
- `normalizer(event)`: transforms an event before fingerprinting.
- `sequenceLimit`: how many recent events to retain per actor. Default `25`.
- `rarePatternThreshold`: events at or below this count are treated as rare. Default `1`.

### `track(event)`

Stores an event and returns a summary:

```js
{
  actorId: "user-42",
  action: "LOGIN",
  fingerprint: "98b0df32",
  isNewPattern: true,
  patternCount: 1,
  actionCount: 1,
  anomaly: {
    score: 0.45,
    level: "medium",
    reasons: ["new-pattern", "new-transition"]
  }
}
```

Expected event shape:

```js
{
  action: "LOGIN",
  payload: { method: "password" },
  timestamp: "2026-03-20T05:10:00.000Z",
  userId: "user-42"
}
```

Only `action` is required.

### `trackMany(events)`

Tracks an array of events and returns the per-event summaries.

### `getTopPatterns(options?)`

Returns the most common behaviour fingerprints.

Options:

- `limit`: default `5`
- `action`: filter by action name

### `getActorProfile(actorId)`

Returns a behavioural profile for an actor:

- total events
- first and last seen timestamps
- action counts
- top transitions
- recent event history

### `findRoutines(actorId, options?)`

Returns the most repeated action-to-action transitions for an actor.

Options:

- `limit`: default `5`
- `minOccurrences`: default `2`

### `detectAnomaly(event)`

Scores an event without storing it. The score is heuristic-based and designed to be understandable:

- new action for this actor
- rare or unseen pattern
- new transition from the actor's previous action

This is useful for guardrails, fraud hints, or nudging reviews.

### `snapshot()`

Returns a serializable view of the tracker state.

## A realistic example

Imagine an investment app tracking this sequence for `user-42`:

1. `LOGIN`
2. `VIEW_DASHBOARD`
3. `BUY_ASSET`
4. `LOGIN`

After a few repetitions, Behaviour Radar starts recognizing that flow as familiar. If the next event suddenly becomes `TRANSFER_FUNDS` to a new destination, `detectAnomaly()` can flag it as unusual because the action, pattern, and transition are all new for that actor.

## Custom normalization

If you want to ignore fields like timestamps, request ids, or noisy metadata, provide a normalizer:

```js
const radar = new BehaviourRadar({
  actor: (event) => event.userId,
  normalizer: (event) => ({
    action: event.action,
    payload: {
      ...event.payload,
      requestId: undefined,
      timestamp: undefined
    }
  })
});
```

## Use cases

- Product analytics: discover repeated user flows and friction points
- Fraud detection: flag unexpected actions or new transitions
- Internal tools: monitor how teams use workflows over time
- Recommendations: identify the next most likely action
- Habit tracking: measure streaks, routines, and deviations

## Design philosophy

- Keep the API small enough to understand in one sitting
- Prefer explainable heuristics over magical black-box scoring
- Make behavioural tracking useful before adding heavier ML layers
- Work well as a library, not a platform

## Run the example

```bash
node examples/quick-start.js
```

## Run tests

```bash
npm test
```

## Roadmap ideas

- Sliding time windows and recency weighting
- Session detection
- Actor segmentation and clustering
- Persistence adapters for Redis, SQLite, or Postgres
- Streaming ingestion for live dashboards

## License

MIT
