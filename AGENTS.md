# Agent Instructions

These instructions apply to every contributor and coding agent working in this repository.

## Language

- Write all source code, comments, documentation, commit messages, and pull request descriptions in English.
- All user-facing frontend content must be in English, including labels, buttons, messages, validation errors, and accessibility text.
- Use clear English names for files, variables, functions, components, database fields, and API routes.

## Git workflow

- Do not commit directly to `main` unless explicitly authorized.
- Create a focused branch for every change.
- Keep commits small, descriptive, and limited to one concern.
- Push the branch and open a pull request for every change.
- Review and merge changes through the pull request; keep `main` stable and ready to demo.

## Project organization

- Keep application code in `src/`, static files in `public/`, project notes in `docs/`, and tests in `tests/`.
- Prefer simple, understandable solutions suitable for a hackathon. Avoid unnecessary abstractions and dependencies.
- Never commit secrets. Document required environment variables with placeholder values in `.env.example`.

## Hackathon judging context

- Keep the official NextWave Hackathon 2026 evaluation guidelines in context whenever planning or making trade-offs.
- Optimize for depth over difficulty, working software over promised functionality, and sound judgment over spectacle.
- Prioritize the jury's core lenses:
  1. The system works end to end and responds correctly when judges change inputs live without team intervention.
  2. The architecture is sound, and the team can explain major decisions, rejected alternatives, and trade-offs.
  3. The product solves the challenge as written, including difficult and unpolished real-world cases.
  4. The solution contains an original insight, approach, or mechanism.
  5. The experience is useful and clear, the demo is legible, and the repository is understandable without extra context.

## Security & AgentPay Protocol Invariants

- AutoParts operates as a standalone B2B merchant participating in the AgentPay network.
- Must implement standard decentralized discovery at `GET /.well-known/agentpay.json`.
- Must sign immutable quotes using ES256 keypairs (`POST /v1/agents-pay/quotes`).
- Must verify incoming SDK request proofs with ES256, a registered public key, exact URL/body binding, expiry, and atomic replay protection.
- Must submit only an opaque purchase capability to the Mandate Authority and verify its signed receipt before fulfilment.
- Must never receive a card reference, Vault token, passkey payload, or a merchant-decided canonical category/trust tier.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
