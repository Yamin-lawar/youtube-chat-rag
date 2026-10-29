# YouTube RAG Chat: 3-Day Plan

Goal: a portfolio-grade app to chat with up to 5 YouTube videos, built to learn and compare RAG techniques with evals.

Stack: TypeScript + Node (Express), LangChain JS, Qdrant (Docker), Postgres + Drizzle (Docker), Gemini (free tier: LLM + embeddings), React + Vite + Tailwind + shadcn/ui + Framer Motion + TanStack Query.

## How we work

- **RAG is built block by block.** Claude adds one RAG block (e.g. transcript loading, then chunking, then embedding), stops, and explains what it does and why. Yamin runs it, inspects and debugs the actual output, asks questions, and says when to move on. Slow is fine; understanding comes first.
- **Experiments are Yamin's.** In Phase 2, Yamin implements and runs the variations by hand. Claude prepares the structure, explains, and helps when stuck.
- **Non-RAG work** (sessions, database, UI, infra, GitHub) is built by Claude without stopping, with a short summary.
- **Code style: plain and readable, but professional.** No clever abstractions. Strict TypeScript, ESLint + Prettier, small focused files, clear names, comments that explain _why_, consistent error handling, environment-based config, and tests where they matter. The repo must hold up to review by a senior engineer.
- **Git:** commits are authored by Yamin Lawar only, with no co-author or tool attribution lines.

Gate rule: each gate = working, tested, committed and pushed to GitHub with a short note in LEARNING.md.

---

## Day 1: Baseline end to end (thin RAG slice)

Setup (Claude)

- Repo scaffold: `server/`, `client/`, `.gitignore`, `.env.example`, README skeleton
- Postgres added to docker-compose; Drizzle schema: users, videos, user_videos, conversations, conversation_videos, messages
- Anonymous session (cookie with user id)

RAG baseline, one block at a time (stop + explain + Yamin inspects output after each)

1. Transcript loading via `TranscriptProvider` interface (LangChain `YoutubeLoader` first). Inspect: raw transcript + metadata
2. Chunking v1: recursive character splitter (size 1000, overlap 200). Inspect: chunk count, sizes, overlaps
3. Embeddings: Gemini. Inspect: vector dimensions, a similarity check between two chunks
4. Storing in Qdrant (dense, cosine) with `video_id` payload + index. Inspect: points in the Qdrant dashboard
5. Retrieval v1: dense top-k filtered by `video_id IN (...)`. Inspect: retrieved chunks + scores for a test question
6. Generation: prompt with retrieved context. Inspect: full prompt sent to the LLM + answer
7. Streaming over SSE. Inspect: tokens arriving in the terminal, then in the browser

Video library (Claude)

- Add by URL, dedupe by YouTube video id, link to user, thumbnail + title via oEmbed
- Max 5 videos per conversation

**Gate 1:** paste a URL, see it in the library, ask a question, get a streamed answer. Pushed.

---

## Day 2: RAG experiments (the core learning)

Each experiment is a swappable strategy behind a config flag. Claude explains each technique and prepares the slot for it; Yamin implements and runs it by hand (hand-roll first, then compare with the library), debugging retrieved chunks and answers.

1. Chunking: fixed, recursive, sentence/semantic, time-window, parent-child
2. Indexing: dense (cosine), sparse (BM25, TF-IDF) as Qdrant sparse vectors
3. Search: dense, sparse, hybrid with RRF fusion
4. Query optimization: history-aware rewrite, multi-query, expansion, decomposition, HyDE
5. Reranking: LLM-based reranker; optionally Cohere cross-encoder

Conversations (Claude, in parallel)

- Persisted threads, history window, reopen old conversations

**Gate 2:** every technique above works behind a flag and is logged in LEARNING.md (how it works, trade-offs). Pushed.

---

## Day 3: Evals, polish, ship

Evals (learning focus)

- Question set per demo video with gold answers / gold chunks
- Retrieval metrics: recall@k, MRR, nDCG
- Generation metrics: LLM-as-judge faithfulness and answer relevance
- Run every strategy combination; results table in README
- Pick the best default config from the numbers

Polish (Claude)

- Impressive, interactive UI: polished library grid with thumbnails; ChatGPT-style chat (token-by-token streaming with cursor, markdown rendering, smooth scroll); citations with timestamps; loading/error states
- Fallback transcript provider, seeded demo videos
- README with architecture diagram and eval results

Optional: host (Qdrant Cloud + managed Postgres + a small Node host).

**Gate 3:** repo is presentable, evals table in README, demo works. Pushed.

---

## Risks

- Transcript scraping blocked on cloud IPs: cache forever, fallback providers, seeded demos
- Gemini free-tier rate limits: batch embeddings, retry with backoff, cache eval runs
- Day 2 is the largest: cut order if behind is multi-query/decomposition, then cross-encoder reranker
