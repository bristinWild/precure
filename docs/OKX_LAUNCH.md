# Precure OKX.AI Launch

## 1. Test payments on X Layer testnet

Set `PRECURE_PAYMENT_MODE=x402`, add the OKX API credentials and `PAY_TO_ADDRESS`, then temporarily change `NETWORK` in `src/payments/payment.ts` from `eip155:196` to `eip155:1952`. Fund the buyer wallet with test USD₮0 and test OKB from the X Layer faucet.

Start the service and send an unpaid request to a paid route. It must return `402` and include the `PAYMENT-REQUIRED` header. Complete the wallet payment and replay the same request; it must return `200` with the `PAYMENT-RESPONSE` settlement proof.

Once verified, restore `eip155:196` before production deployment.

## 2. Deploy

The service stores repository clones and local-json memories under `/app/storage`; it must be a persistent volume. The included `Dockerfile` and `fly.toml` are configured for Fly.io in Singapore, which is suitable for calling OpenAI. A fresh deployment needs the following secrets:

```text
OPENAI_API_KEY
PRECURE_MODEL=gpt-5.5-2026-04-23
PRECURE_PAYMENT_MODE=x402
FREE_CALLS_PER_DAY=3
PAY_TO_ADDRESS
OKX_API_KEY
OKX_SECRET_KEY
OKX_PASSPHRASE
```

Create a `precure_storage` volume before the first deploy. Do not expose the service until its public HTTPS URL returns `402` for an unpaid paid route.

## 3. Register and list

Use the Agentic Wallet attached to the intended OKX account. Register an A2MCP ASP with the following service values:

```text
Name: Precure
Description: Grounded, pay-per-call repository memory for agents.
Endpoint: https://<your-domain>/mcp
Price: set by x402 per call
```

Then submit the marketplace listing from Onchain OS. The listing is an account-level action and requires the owner to authenticate with their Agentic Wallet.

## MCP tools

`/mcp` is a streamable HTTP MCP endpoint and exposes `init_repo`, `ask`, `list_gaps`, `gap_report`, `get_architecture`, and `activity`. The REST routes retain individual prices. MCP is initially priced as a single `$0.25` tool-call route because x402 route middleware prices an HTTP route, not a JSON-RPC tool nested inside that route.
