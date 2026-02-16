# Nanoclaw Learnings: Architecture Suggestions for Wellington

Patterns extracted from `.old/nanoclaw` that could improve the current agent server architecture.

## 1. Session Continuity

**Current:** Each `POST /api/agent` is stateless. The client sends full `messages[]` history every time; `query()` starts fresh.

**From nanoclaw:** Sessions persist via the `resume` option in the Agent SDK, with JSONL transcript storage. The agent retains its full tool-use history, file reads, and reasoning across turns — not just the chat messages the client sends back.

**Suggestion:** Accept an optional `sessionId` in `ContainerRequest`, pass it via `resume` to `query()`, and return the new session ID in the SSE stream. This is especially important once agents start doing multi-step work — without session persistence, the agent loses all context about files it read, tools it used, and decisions it made.

## 2. Conversation History Passthrough

**Current:** `req.messages` is received but only `lastMessage` is sent to `query()`. The full conversation history is lost.

**Suggestion:** At minimum, format prior messages into the system prompt so the agent has conversational context. Better: use the session resume approach from suggestion 1 so history is maintained natively by the SDK.

## 3. Populate the Skills System

**Current:** Skills directories exist but are empty. Sub-agents declare skills by name but there's nothing to load.

**From nanoclaw:** Skills are markdown files containing domain-specific instructions, transformation guides, and behavioral context. They're the primary extension mechanism — "skills over features."

**Suggestion:** Each skill should be a markdown file in `skills/` that gets loaded into the sub-agent's context when invoked. The `general` and `support` sub-agents currently have empty prompts — those should be skill-driven.

## 4. Enrich AGENT.md

**Current:** 10 lines of generic instructions. The agent has almost no behavioral guidance.

**From nanoclaw:** `CLAUDE.md` plus per-group markdown files loaded as system context, with global memory, group-specific instructions, and detailed behavioral expectations.

**Suggestion:** `AGENT.md` should encode the agent's actual personality, capabilities, boundaries, and domain knowledge. Consider a hierarchical prompt: `AGENT.md` (base identity) + skill-specific markdown + client system prompt.

## 5. Re-evaluate the Bash Tool

**Current:** `disallowedTools: ["Bash"]` — agents can't execute commands.

**From nanoclaw:** Bash is allowed inside containers but sanitized via hooks that strip secrets from the environment (`unset ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN 2>/dev/null;` prepended to every command).

**Suggestion:** Completely disabling Bash severely limits what the agent can do (no git, no builds, no file exploration beyond Read). Since we're already running in a Cloudflare Sandbox, consider allowing Bash with sanitization hooks rather than blanket-disabling it.

## 6. Follow-Up Message Pipe

**Current:** Each user message spawns a new `query()` call. If the agent is mid-execution, there's no way to send additional context.

**From nanoclaw:** A `MessageStream` push-based async iterable pipes follow-up messages to a running agent. Combined with an idle timeout, the container stays alive between exchanges.

**Suggestion:** Support a bidirectional pattern — either upgrade to WebSocket, or add a `POST /api/agent/:sessionId/message` endpoint that pipes input to a running agent. Avoids cold-start overhead for multi-turn conversations.

## 7. Error Recovery

**Current:** Errors in `pull()` close the stream. No retry logic. No cursor management.

**From nanoclaw:** Cursor rollback on error with an output-sent guard — if the agent fails before sending output, cursor rolls back for retry; if output was already sent, cursor stays to prevent duplicates.

**Suggestion:** Track whether output was streamed before an error occurred. Add a `retry-hint` field to error SSE events so the client knows whether to retry or accept partial output.

## 8. Structured Logging

**Current:** `console.log/error` with manual string formatting.

**From nanoclaw:** Structured logging with pino, log levels, contextual metadata per operation.

**Suggestion:** Switch to structured logging (pino or similar). The SSE `debug` events are a good start for client-side observability, but server-side logs should be structured and filterable.

## 9. Simplify Sub-Agent Routing

**Current:** Main agent has `allowedTools: ["Task"]` and routes to sub-agents, but the sub-agents only have `["Skill"]` and empty skills. The routing layer adds latency and token cost without providing specialization.

**Suggestion:** Either give the sub-agents real differentiation (different tool sets, different models, different prompts) or simplify to a single agent with skill loading. Nanoclaw used a single agent with rich context per group — no routing layer.

## 10. Token Budget Awareness

**From nanoclaw:** The `repo-tokens` GitHub Action badge tracks codebase size in tokens relative to context window capacity.

**Suggestion:** As skills and AGENT.md grow, track the total prompt token budget. Consider a token budget check that warns when the combined system prompt + skills + conversation history approaches the context limit.
