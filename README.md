# Precure

> **Agents can't read code before they trust it. Precure sells that reading.**
> A pay-per-call memory oracle for codebases - an Agentic Service Provider (ASP) on [OKX.AI](https://www.okx.ai), built on the open-source [cliper-memory](https://github.com/bristinWild/cliper-sdk) knowledge-graph engine.

Built for the **OKX.AI Genesis Hackathon** · Mode: **Agent-to-MCP** · Category: **Software Utility**

---

## Why this matters

The agent economy has a blind spot: **code**.

On OKX.AI, agents take tasks - integrate this protocol, evaluate this project, build on this SDK. Every one of those tasks begins with the same expensive question: *what is actually in this repository?* Today an agent's options are bad:

- **Read the raw repo itself** - thousands of files through a context window, re-done from scratch by every agent, for every task, every time. Slow, token-hungry, and it still misses everything that isn't in the tree: history, decisions, undocumented risk.
- **Trust the README** - marketing, not ground truth.
- **Skip the reading** - and integrate code nobody actually understood. In crypto, that's how money burns.

Precure turns "understanding a repository" from a per-agent, per-task cost into **shared, queryable infrastructure**: one deep scan builds a persistent knowledge graph; every question afterward costs cents and returns in seconds. Due diligence becomes a utility - like a price feed, but for code comprehension.

## What it is

An ASP exposing one repository-memory engine as callable tools:

| Tool | What it does | Price (draft) |
| --- | --- | --- |
| `init_repo(github_url)` | Clone → scan → build the memory graph (one-time per repo, cached) | $0.50 |
| `ask(repo, question)` | Natural-language answer synthesized from the repo's memory | $0.02 |
| `list_gaps(repo)` | Undocumented / risky corners, ranked by severity - the "what should worry you" call | $0.10 |
| `gap_report(repo)` | Full structured risk report (gaps + dependency risk + activity) | $0.25 |
| `get_architecture(repo)` | Module boundaries and structural map | $0.05 |
| `activity(repo)` | Timeline: commits, releases, recent evolution | $0.02 |

Free tier for discovery; paid calls settle via **x402** (OKX Payment SDK) - the caller's agent pays automatically, no accounts, no negotiation. That is exactly OKX.AI's Agent-to-MCP model: *"standardized MCP/API services, pay-per-call... paid services need an x402-compliant endpoint."*

## How it works

```
OKX.AI agent / user
      │  x402 pay-per-call (MCP/HTTP)
      ▼
┌─────────────────── Precure service ───────────────────┐
│                                                            │
│  init_repo:  shallow clone ──▶ cliper init (local-json)    │
│              → .memory/<repo-hash>/*.json                  │
│              13 typed memories · explicit relationships    │
│              (files, commits, PRs, architecture,           │
│               dependencies, GAPS ranked by severity)       │
│                                                            │
│  ask:        retrieve relevant memories                    │
│              (keyword score + 1-hop relationship expansion)│
│              ──▶ GPT-5.6 synthesizes the answer            │
│              from retrieved memories only (grounded)       │
│                                                            │
│  cache:      one graph per repo, shared by all callers     │
│              re-sync on demand (content-hashed, only       │
│              deltas rebuild)                                │
└────────────────────────────────────────────────────────────┘
```

Design decisions that matter:

- **Local-json provider, not a cloud graph DB** - the service holds zero external credentials; every memory is a plain JSON file on disk. Simple to host, simple to audit, trivially portable.
- **Retrieval + LLM synthesis** - memories are retrieved deterministically (keyword scoring + one hop along explicit `relationships`), then GPT-5.6 composes the answer *only from what was retrieved*. Grounded answers, no hallucinated code claims.
- **Scan, never execute** - the cliper scanner reads files; repository code is never run. Clone size caps and timeouts bound every ingestion.
- **Shared cache economics** - the expensive call (`init_repo`) happens once per repository; every subsequent caller rides the same graph at query prices. Margins improve with popularity - the right shape for a marketplace utility.

## Built on cliper-memory (open source, MIT)

The engine is [`cliper-memory`](https://www.npmjs.com/package/cliper-memory) - a CLI/SDK that treats a repository the way a senior engineer's head does: not as text, but as **typed knowledge with relationships**. 13 memory types (file, commit, pull request, architecture, dependency, responsibility, timeline, release, issue, git, package, repository, and **gap** - undocumented or risky corners, ranked). The same engine already powers a Slack agent (ask your codebase in the channel) and Reprox (persistent memory for Codex over MCP). Precure is the third surface: **memory for the open agent economy.**

*Git stores source code. Cliper stores engineering knowledge. Precure sells it by the question.*

## Build plan

### Phase 0 - Foundation (prerequisite)
- `cliper-memory@0.2.x` published with the multi-provider local-json support
- Deterministic memory sets verified (triple-sync no-op)

### Phase 1 - Core service (day 1)
- New repo `repo-oracle` (separate from all frozen infrastructure)
- Fastify/Express service with the six tools as endpoints + MCP-compatible surface
- Ingestion worker: `git clone --depth 1` (size cap, timeout) → `cliper init` with `CLIPER` local-json provider → memory dir keyed by repo-URL hash
- Retrieval module: reuse the local-json search (keyword scoring + relationship hop), return raw memories

### Phase 2 - Synthesis (day 1–2)
- GPT-5.6 answer composer: system prompt "answer only from these memories, cite memory ids", retrieved memories as context
- `gap_report` formatter: severity-ranked markdown/JSON report

### Phase 3 - Payments (day 2)
- x402 middleware on paid routes via OKX Payment SDK; free tier: N calls/day per caller
- Price table as config

### Phase 4 - Deploy + list (day 2–3)
- Deploy as a fresh service (Fly.io / Railway new project - the Slack-judging stack stays untouched)
- Register as ASP on okx.ai (Agent-to-MCP), submit listing for internal review (~1 hr)
- Smoke test from the OKX side as a caller

### Phase 5 - Submission (day 3)
- ≤90s demo: agent asks Precure about a known DeFi repo → grounded answer → `list_gaps` ranks the risk → price ticker showing x402 charges
- X post with #OKXAI + demo
- Google form with ASP details + X post link

## Roadmap after the hackathon

- Private repos (caller-supplied deploy keys, encrypted at rest)
- Continuous sync: webhook on push → incremental re-scan (cliper's content-hashed sync makes this cheap)
- Cross-repo questions ("compare how these two protocols handle access control")
- Evaluator-friendly artifacts: attestable gap reports for OKX arbitration cases
- Cognee-backed premium tier: full graph-traversal answers for complex relationship queries

## License

MIT (service scaffolding) · built on cliper-memory (MIT)

## Run locally

```bash
npm install
cp .env.example .env
npm run start
```

The REST API is at `http://localhost:3000/repo`. The streamable HTTP MCP endpoint is `http://localhost:3000/mcp`.

`PRECURE_PAYMENT_MODE=free` is the local default. Set it to `x402` only with the OKX payment environment variables configured. The operational testnet, deployment, and listing procedure is in [docs/OKX_LAUNCH.md](docs/OKX_LAUNCH.md).
