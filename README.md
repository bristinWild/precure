# Precure

**Precure is a paid MCP service for understanding public GitHub repositories.** It builds a persistent local knowledge graph for a repository, then lets agents retrieve grounded answers, architecture, activity, and known risk gaps without repeatedly reading the entire source tree.

It is built with NestJS, [cliper-memory](https://www.npmjs.com/package/cliper-memory), OpenAI, the Model Context Protocol (MCP), and the OKX x402 payment SDK.

## Production service

| Item | Value |
| --- | --- |
| Primary public MCP endpoint | `https://precure-production.up.railway.app/mcp` |
| Alternate Fly deployment | `https://precure.fly.dev/mcp` |
| Protocol | Streamable HTTP MCP |
| Payment network | X Layer mainnet (`eip155:196`) |
| MCP route price | `0.25` USDT per `POST /mcp` request |
| Storage | Persistent volume mounted at `/app/storage` |

The Railway endpoint has been smoke-tested to return an x402 `402 Payment Required` challenge. A complete paid settlement-and-replay test still requires a funded compatible buyer wallet.

## What it does

1. A caller submits a public GitHub URL.
2. Precure shallow-clones the repository and runs `cliper-memory` with the `local-json` provider.
3. The generated memories are stored with the repository under `storage/repositories/<repo-id>/`.
4. Callers use the repository ID to ask questions or retrieve architecture, activity, gaps, and reports.
5. For Q&A, Precure retrieves relevant memories and sends only that retrieved context to OpenAI. The model is instructed to answer only from those memories and cite memory IDs.

Repository IDs are deterministic: they are a SHA-256 hash of the normalized GitHub URL (lowercase, with a trailing slash and optional `.git` removed).

## User-facing services

The OKX.AI listing exposes fixed-price API services. They can share the same MCP endpoint because the client invokes the relevant MCP tool.

| Listing name | MCP tool | Customer provides |
| --- | --- | --- |
| Repo Memory Indexer | `init_repo` | A public GitHub repository URL |
| Repository Memory Sync | `sync_repo` | Repository ID returned by the indexer |
| Repo Memory Q&A | `ask` | Repository ID and a question |
| Risk Gap Scanner | `list_gaps` | Repository ID |
| Repository Risk Report | `gap_report` | Repository ID |
| Architecture Mapper | `get_architecture` | Repository ID |
| Repo Activity Timeline | `activity` | Repository ID |
| VibeMemory Recall | `recall` | Repository ID and a coding-task query |

`sync_repo` refreshes the checked-out remote branch and rebuilds persistent local memory. Merged pull requests are included through the updated branch history; open pull requests require a separate GitHub integration.

## MCP interface

### Connect

Use the streamable HTTP endpoint:

```text
https://precure-production.up.railway.app/mcp
```

The server supports the standard MCP initialization and session flow. The first JSON-RPC request must be an `initialize` request; later requests must send the `mcp-session-id` response header back to the service.

### VibeMemory interface

Use the lightweight persistent-memory endpoint for coding agents:

```text
https://precure-production.up.railway.app/vibememory/mcp
```

VibeMemory exposes `recall`. It returns compact, grounded memory snippets and memory IDs for a task without calling an LLM to generate an answer.

### Tools

| Tool | Input | Result |
| --- | --- | --- |
| `init_repo` | `{ "github_url": "https://github.com/owner/repository" }` | `{ success, cloned, indexed, repoId }` |
| `sync_repo` | `{ "repo": "<repoId>" }` | Pull the remote branch and refresh persistent memory |
| `ask` | `{ "repo": "<repoId>", "question": "...", "audience": "marketing \| design \| DevOps \| HR \| product \| engineering" }` | Grounded, audience-aware natural-language answer with memory-ID citations |
| `list_gaps` | `{ "repo": "<repoId>" }` | Gap memories, ordered high → medium → low severity |
| `gap_report` | `{ "repo": "<repoId>" }` | Gap memories, dependency memories, and activity memories |
| `get_architecture` | `{ "repo": "<repoId>" }` | Architecture and repository memories |
| `activity` | `{ "repo": "<repoId>" }` | Commit, release, and timeline memories, newest first when date metadata exists |
| VibeMemory `recall` | `{ "repo": "<repoId>", "query": "...", "max_results": 5 }` | Grounded memory snippets, relationships, and memory IDs for a coding agent |

The server returns tool results as JSON serialized in MCP text content. Tool failures are returned as MCP `isError: true` content.

### Typical MCP sequence

```text
initialize
  → retain mcp-session-id
tools/call: init_repo({ github_url })
  → retain repoId
tools/call: sync_repo({ repo: repoId })
tools/call: ask({ repo: repoId, question })
tools/call: list_gaps({ repo: repoId })
```

## REST interface

The same service also offers direct REST routes. These are useful for debugging or a custom integration; marketplace clients should normally use MCP.

| Method | Route | Body / purpose |
| --- | --- | --- |
| `POST` | `/repo/init` | `{ "githubUrl": "https://github.com/owner/repository" }` |
| `POST` | `/repo/:repoId/sync` | Update the remote branch and refresh persistent memory |
| `POST` | `/repo/:repoId/ask` | `{ "question": "..." }` |
| `GET` | `/repo/:repoId/gaps` | List known gap memories |
| `GET` | `/repo/:repoId/gap-report` | Return gaps, dependencies, and activity |
| `GET` | `/repo/:repoId/architecture` | Return architecture and repository memories |
| `GET` | `/repo/:repoId/activity` | Return commit, release, and timeline memories |

`repoId` must be a 64-character lowercase SHA-256 hexadecimal string. Unknown or uninitialized IDs return the guidance: `Repository memory is not initialized; run cliper init first.`

## Payments and x402

Set `PRECURE_PAYMENT_MODE=x402` to enable the OKX x402 Express middleware. In this mode the service protects these routes:

| Route | Configured x402 price |
| --- | ---: |
| `POST /repo/init` | 0.50 USDT |
| `POST /repo/:repoId/sync` | 0.25 USDT |
| `POST /repo/:repoId/ask` | 0.02 USDT |
| `GET /repo/:repoId/gaps` | 0.10 USDT |
| `GET /repo/:repoId/gap-report` | 0.25 USDT |
| `GET /repo/:repoId/architecture` | 0.05 USDT |
| `GET /repo/:repoId/activity` | 0.02 USDT |
| `GET` or `POST /mcp` | 0.25 USDT |
| `GET` or `POST /vibememory/mcp` | 0.05 USDT |

Important: x402 middleware prices an HTTP route, not an individual JSON-RPC tool. Consequently, the marketplace uses a single **0.25 USDT** price for each MCP-backed listing. An MCP initialization request is also a `POST /mcp` request and is therefore challenged in x402 mode.

An unpaid paid request should return `402` with a `PAYMENT-REQUIRED` header. This includes a plain `GET /mcp` endpoint probe, which allows OKX.AI's User-flow validator to verify that the endpoint is x402-gated. After a valid compatible payment, the payment SDK is expected to settle it and allow the request through with a settlement response header.

### Current free-tier behavior

`PRECURE_PAYMENT_MODE=free` disables payment middleware entirely for local development. The `FREE_CALLS_PER_DAY` bookkeeping middleware is present in the code, but it does **not** currently waive or enforce payments when x402 is enabled. Do not advertise a limited free tier until that behavior is implemented and tested.

## Architecture

```text
MCP client / REST client
          |
          | HTTPS + x402 challenge/settlement
          v
NestJS application
  ├── MCP controller (`/mcp`)
  │     └── MCP server: init_repo, sync_repo, ask, list_gaps, gap_report,
  │                      get_architecture, activity
  ├── VibeMemory MCP controller (`/vibememory/mcp`)
  │     └── MCP server: recall
  ├── Repository controller (`/repo/*`)
  ├── RepoService
  │     ├── simple-git shallow clone
  │     ├── cliper-memory local-json indexing and retrieval
  │     └── persistent files in /app/storage/repositories
  └── AiService
        └── OpenAI Responses API; retrieved memory context only
```

### Storage layout

When deployed in the Docker image, `process.cwd()` is `/app`. A repository is stored at:

```text
/app/storage/repositories/<repoId>/
├── .git/
└── .cliper/
    ├── metadata.json
    └── memory/
        └── cliper-<project-name>/*.json
```

This is stateful application data. Attach durable storage to `/app/storage`; otherwise every redeploy can erase initialized repositories and their memory graphs.

## Local development

### Prerequisites

- Node.js 22 or newer
- Git
- An OpenAI API key for `ask`
- Optional: OKX payment credentials for x402 testing

### Install and run

```sh
npm install
cp .env.example .env
# Add OPENAI_API_KEY to .env
npm run start:dev
```

Local endpoints:

```text
http://localhost:3000/mcp
http://localhost:3000/repo
```

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | For `ask` | OpenAI Responses API credentials |
| `PRECURE_MODEL` | No | Model ID; defaults to `gpt-5.5-2026-04-23` in code |
| `PRECURE_PAYMENT_MODE` | No | Use `free` locally or `x402` for paid routes |
| `FREE_CALLS_PER_DAY` | No | Reserved for free-tier logic; not enforced today |
| `PAY_TO_ADDRESS` | In x402 mode | Receiving EVM address for X Layer payments |
| `OKX_API_KEY` | In x402 mode | OKX facilitator API credential |
| `OKX_SECRET_KEY` | In x402 mode | OKX facilitator secret |
| `OKX_PASSPHRASE` | In x402 mode | OKX facilitator passphrase |
| `PORT` | No | HTTP port; defaults to `3000` |

Never commit `.env` or deploy these values as plaintext configuration. Use Railway Variables or Fly secrets.

### Example REST call in free mode

```sh
curl -X POST http://localhost:3000/repo/init \
  -H 'content-type: application/json' \
  -d '{"githubUrl":"https://github.com/owner/repository"}'
```

Save the returned `repoId`, then ask a question:

```sh
curl -X POST http://localhost:3000/repo/<repoId>/ask \
  -H 'content-type: application/json' \
  -d '{"question":"What are the main modules and responsibilities?"}'
```

## Deployment

### Railway (primary)

The current marketplace endpoint is served from Railway.

1. Deploy this repository using its `Dockerfile` or Railway’s Node build environment.
2. Set all production environment values as Railway Variables, including `PRECURE_PAYMENT_MODE=x402`.
3. Attach a Railway Volume at **`/app/storage`**.
4. Generate or retain the public Railway domain.
5. Confirm that `POST https://precure-production.up.railway.app/mcp` returns `402` with `PAYMENT-REQUIRED` when no payment is supplied.
6. Run a funded-wallet settlement test before relying on paid calls in production.

Railway terminates TLS at its proxy. The application trusts exactly one proxy
hop so x402 challenges advertise the public `https://` resource URL rather
than Railway's internal `http://` connection. Keep this setting when changing
the deployment topology.

The volume is essential: repository clones and local JSON memories must survive restarts and deployments.

### Fly.io (alternate deployment)

The repository includes [`fly.toml`](fly.toml) for a Singapore deployment. It expects:

- Fly app name: `precure`
- Persistent volume name: `precure_storage`
- Mount path: `/app/storage`
- Public endpoint: `https://precure.fly.dev/mcp`

Typical sequence:

```sh
flyctl volumes create precure_storage --app precure --region sin --size 1
flyctl secrets import --app precure < .env
flyctl deploy --app precure
```

Set `PRECURE_PAYMENT_MODE=x402` in the deployed secrets; `.env.example` intentionally defaults to `free`.

## Operations checklist

Before listing or demonstrating Precure:

- [ ] Confirm a volume is mounted at `/app/storage`.
- [ ] Confirm `OPENAI_API_KEY` and all x402 secrets are present.
- [ ] Confirm `PRECURE_PAYMENT_MODE=x402` in production.
- [ ] Send an unpaid `POST /mcp` and verify `402` plus `PAYMENT-REQUIRED`.
- [ ] Decode the payment challenge and verify its resource URL starts with `https://`.
- [ ] Complete one end-to-end paid call and retain the settlement evidence.
- [ ] Initialize a small public repository and verify each MCP tool responds.
- [ ] Monitor volume consumption; cloned repositories and their memories accumulate.
- [ ] Keep only one marketplace endpoint as the intended primary service to avoid operational confusion.

## Testing

```sh
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

At the time this README was updated, unit tests pass. The E2E suite requires Jest ESM configuration work because the `cliper-memory` dependency brings in an ESM-only `chalk` package; the current Jest configuration fails before executing the E2E test.

## Security and operational limitations

- **Public repositories only:** `init_repo` accepts only `https://github.com/<owner>/<repo>` URLs. Private repository access is not implemented.
- **No clone resource limits yet:** cloning is shallow and uses `--filter=blob:none`, but the code currently has no explicit clone-size cap, concurrency limit, or timeout. Treat public ingestion as an abuse and cost-control surface.
- **Branch synchronization:** `sync_repo` fetches the checked-out remote branch and rebuilds local memory. It does not currently ingest open pull requests as separate objects.
- **Concurrent writers:** indexing and synchronization use a volume-backed per-repository lock. Calls for the same repository wait in sequence so they do not clone, reset, or rebuild memory at the same time.
- **No per-tool MCP price today:** MCP is billed per `/mcp` HTTP request at 0.25 USDT; the lower per-route REST prices do not apply to MCP tool names.
- **Single-process MCP sessions:** in-memory MCP session transports are held in the application process. Horizontal scaling requires shared session strategy or sticky routing.
- **OpenAI data handling:** Q&A sends retrieved memory content and the caller’s question to OpenAI. Do not index repositories whose content should not be sent to that provider.

## Roadmap

- Implement a real limited free tier.
- Add clone quotas, timeouts, size limits, and concurrency controls.
- Add explicit refresh/incremental re-indexing.
- Add private-repository support with caller-supplied, securely handled credentials.
- Add full x402 settlement integration tests.
- Improve the E2E test setup for ESM dependencies.
- Consider an external/shared store before horizontal scaling.

## License

This service scaffolding is currently marked `UNLICENSED` in `package.json`. `cliper-memory` is an external dependency with its own license; review it before redistribution.
