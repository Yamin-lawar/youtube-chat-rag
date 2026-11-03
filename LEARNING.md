# Learning log

What I built, what I measured, and what I concluded for each part of the RAG pipeline.
Test video for most entries: a 87-minute RAG tutorial (about 11,000 words, auto-generated English captions).

## 1. Transcript loading

**What it does:** turns a YouTube video id into timed caption segments (`text`, `startMs`, `durationMs`).

**What I found**

- LangChain's `YoutubeLoader` calls YouTube's `get_transcript` endpoint, which currently fails with HTTP 400. It also joins all captions into one string, which throws the timestamps away.
- Downloading the video's caption track directly works and keeps timing. The video's 1,767 caption lines averaged 34 characters each.
- The transcript provider sits behind a `TranscriptProvider` interface, so a different source can replace it if YouTube blocks scraping.

**Limitation:** auto-generated captions mishear technical terms ("superbase" for "Supabase"). Retrieval can only be as good as this text.

**To try:** correct terms using the video's title and description, or an LLM clean-up pass, and measure the effect in evals.

## 2. Chunking (recursive character splitter)

**What it does:** splits the transcript into chunks of about 1,000 characters with 200 characters of overlap, then maps each chunk back to a start and end time.

**What I found**

- 1,767 segments became 75 chunks (min 650, average 992, max 999 characters).
- LangChain's splitter reports line numbers but no character positions, so timestamps are recovered afterwards: join the segments, remember each segment's start offset, find each chunk in the joined text, and binary-search the offsets.
- Chunk times are accurate to the segment (a few seconds), which is enough for citations and "jump to" links.

**Limitation:** splitting by character count ignores meaning, so chunks can start and end mid-sentence.

**To try:** sentence-aware, semantic, time-window and parent-child chunking; different sizes and overlaps.

## 3. Embeddings (Gemini `gemini-embedding-001`, 768 dimensions)

**What it does:** turns each chunk into a vector of 768 numbers so chunks can be compared by meaning.

**What I found**

- Documents and questions are embedded with different task types (`RETRIEVAL_DOCUMENT` and `RETRIEVAL_QUERY`) so a question lands near the passages that answer it.
- The free tier allows 100 embedding requests per minute, and every text in a batch counts. LangChain swallowed the resulting 429 error and returned empty vectors instead of failing. The embedder now throttles itself to 90 texts per minute and checks that every vector has 768 numbers.
- Cosine scores are relative, not absolute. A relevant question scored 0.83 against its best chunk and an unrelated question scored 0.52, but chunks of the same video score high against each other (0.85 to 0.87).

**Limitation:** a similarity score alone can't say "no answer found". Retrieval needs a relative cutoff, not a fixed threshold.

**To try:** 768 against 3072 dimensions, and another embedding model, compared with evals.

## 4. Distance metrics (cosine, dot product, Euclidean)

**What I did:** ran the same questions on several videos and compared the top chunks under all three metrics.

**What I found**

- Vector lengths were nearly equal (0.577 to 0.594, not normalized to 1 but very close).
- The three metrics returned almost the same chunks on every video. Differences appeared only where two scores were nearly tied.

**Why:** when vectors have equal length, cosine, dot product and Euclidean distance are three readings of the same angle, so they sort chunks the same way.

**Conclusion:** with this model the metric is not where retrieval quality is won. I use cosine, the standard choice for this model. Quality is more likely to come from chunking, hybrid search, query rewriting and reranking. Near-ties among relevant chunks are the real weakness.

## 5. Retrieval (filtered Qdrant search plus a relative cutoff)

**What it does:** embeds the question (as `RETRIEVAL_QUERY`), asks Qdrant for the 8 nearest chunks of the selected videos only, then drops chunks scoring more than 0.08 below the best one.

**What I found** (test video: an interview about AI data centers and power, 19 chunks)

- A specific question ("how much power do the data centers need") scored 0.71 down to 0.62. The top chunks were the power-generation passages, and 3 of 8 were dropped.
- A vague question ("what is this video about") scored 0.60 to 0.63 with no standout, so all 8 were kept in an order that means little.
- The video filter (`youtubeId` in a list) is what limits a chat to its selected videos. It uses the payload index created at ingest.

**Limitation:** a relative cutoff only helps when one part of the video clearly matches. Broad questions match nothing in particular, so retrieval guesses. The 0.08 margin is a guess and is not tuned.

**To try:** tune the margin and top-k with evals, query rewriting and decomposition for vague or multi-part questions, hybrid search, and a reranker.

## Open questions

- Does 768 dimensions lose quality compared with 3072?
- Does correcting misheard terms improve retrieval?
- Does hybrid search (dense plus BM25) fix near-ties and exact-term questions?
- Does a reranker improve the final order of results?
