# Precure: user and agent guide

## What Precure is

Precure gives a public GitHub repository a durable, searchable memory. Instead
of asking every person or coding agent to re-read a whole codebase, you index it
once and retrieve the most relevant grounded facts whenever work needs to be
done.

It is useful before a launch, integration, handoff, audit, redesign, or coding
task because it turns an unfamiliar repository into evidence that different
teams can use.

## Why it is powerful

- **Less repeated discovery.** Index once, then use the returned `repoId` for
  questions, reports, architecture, risks, activity, and coding-agent recall.
- **Grounded answers.** Precure retrieves stored repository memories before it
  answers. Q&A includes memory-ID references so a developer can trace an answer
  back to the indexed evidence.
- **Useful beyond engineering.** Ask with an audience such as `marketing`,
  `design`, `DevOps`, `HR`, `product`, or `engineering` to receive the same
  evidence in language suited to that team.
- **Stays current.** Repository Memory Sync pulls the latest remote-branch
  commits and refreshes the stored memory, so an initialized repository does
  not become a one-time snapshot.
- **Built for agents.** VibeMemory provides compact, raw memory snippets for a
  coding agent to use before it plans or edits code. It does not generate an
  extra LLM answer, keeping the returned context direct and task-oriented.

## How persistent memory works

1. You provide a public GitHub repository URL.
2. Precure clones the repository, identifies source files, architecture,
   dependencies, commit history, and known documentation or maintenance gaps.
3. It saves those memories as durable JSON records on Precure's persistent
   storage volume, alongside the repository checkout.
4. It returns a deterministic `repoId` for that normalized GitHub URL.
5. Future calls use the `repoId` to retrieve relevant memory instead of
   rebuilding the repository understanding from scratch.
6. When the repository changes, call `sync_repo` to update the checkout and
   refresh its memory.

The persistent memory belongs to the public repository identity, not a
particular buyer or computer. This means different users and compatible agents
can retrieve the same up-to-date repository understanding with the same
`repoId`. Precure serializes simultaneous index and sync operations per
repository so updates do not race.

## What each service is for

| Need | Use this service | What you receive |
| --- | --- | --- |
| Start understanding a public repository | Repo Memory Indexer (`init_repo`) | A durable `repoId` after indexing |
| Refresh after merges and commits | Repository Memory Sync (`sync_repo`) | Updated checkout and refreshed memory |
| Ask a plain-language question | Repo Memory Q&A (`ask`) | Grounded answer with memory-ID references |
| Check known concerns | Risk Gap Scanner (`list_gaps`) | Known gaps ranked by severity |
| Make a due-diligence decision | Repository Risk Report (`gap_report`) | Gaps, dependency information, and activity together |
| See how code is organized | Architecture Mapper (`get_architecture`) | Module relationships and architecture memories |
| Understand what is changing | Repo Activity Timeline (`activity`) | Recent commits, releases, and change context |
| Give a coding agent durable context | VibeMemory (`recall`) | Compact grounded snippets and relationships |
| Keep or move a complete memory snapshot | Download Memory (`GET /repo/memory/download?repoId=<repoId>`) | A ZIP of generated memory JSON and metadata, without source code |

## Quick start for people

1. Index a public repository with **Repo Memory Indexer**.
2. Save the returned `repoId` in your project notes or agent configuration.
3. Choose the next service based on your question. For example:

   - Product: “What customer problem does this repository appear to solve?”
   - Marketing: “Which capabilities can we responsibly describe publicly?”
   - Design: “Which user-facing flows or interfaces are represented?”
   - DevOps: “What environment, deployment, and operational risks should we plan for?”
   - HR: “What should a new engineer learn first?”
   - Engineering: “Where is payment middleware configured and what depends on it?”

4. Run **Repository Memory Sync** whenever you need the latest merged branch
   state, then continue using the same `repoId`.

## Quick start for agents

Connect to the standard MCP endpoint:

```text
https://precure-production.up.railway.app/mcp
```

1. Send the MCP `initialize` request and retain the returned `mcp-session-id`.
2. Call `init_repo` once with `github_url` and retain its `repoId`.
3. Call the appropriate tool with `repoId`.
4. For recurring coding work, connect to VibeMemory instead:

```text
https://precure-production.up.railway.app/vibememory/mcp
```

5. Call `recall` with `repoId`, the current coding task, and an optional
   `max_results` (up to 8). Use the returned memory IDs and snippets as context
   before planning or making edits.

Both endpoints are paid, x402-protected MCP services. A compatible agent wallet
handles the payment challenge for each request. Standard Precure MCP calls cost
0.25 USDT per request; VibeMemory calls cost 0.05 USDT per request.

Use `repoId` in new integrations. The older `repo` input name is still accepted
for compatibility, but `repoId` is the documented contract.

## Download Memory

For a durable offline record, backup, or import into a compatible internal
workflow, request:

```text
GET https://precure-production.up.railway.app/repo/memory/download?repoId=<repoId>
```

This flagship export costs 4 USDT0. The ZIP contains Precure's generated
memory JSON records, `metadata.json`, and an export manifest. It intentionally
does not include the repository checkout, source files, `.git` history, or any
server secrets.

## Important limits and good practice

- Only index public repositories. Do not send secrets, private source code, or
  personal data to this public-repository service.
- Sync reflects the selected remote branch history. Merged pull requests arrive
  through that history; open pull requests are not independently indexed.
- Q&A is grounded in retrieved repository memory, but important technical,
  legal, security, or launch decisions should still be reviewed by the relevant
  human owner.
- An MCP session is in memory. Reconnect and initialize again after a service
  restart or deployment; the `repoId` and its persistent memory remain on the
  durable volume.
