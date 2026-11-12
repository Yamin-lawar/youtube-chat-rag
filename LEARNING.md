# Learning log

What I built, what I measured, and what I concluded for each part of the RAG pipeline.
Every experiment with its numbers is collected in [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md).
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

**Later change:** top-k became 12 and the margin 0.12, see section 9.

## 6. Generation (prompt, citations, model fallback)

**What it does:** puts the retrieved chunks into a prompt as numbered excerpts (video id and timestamp for each), puts the question last, and asks a chat model to answer only from the excerpts and cite them as [1], [2]. Temperature is 0.2 so the answer stays close to the text.

**What I found**

- `gpt-oss` writes citations as 【1】 whatever the prompt says, so a small function rewrites them to plain [1]. The UI then only has to understand one format.
- The Gemini free tier was unreliable. It often answered "high demand" (503), and it was also slow when it did answer. The same short prompt took 193 seconds on Gemini and 0.96 seconds on Groq in one test, and 19 seconds on Gemini in another. Groq is now tried first and Gemini is the fallback.
- The fallback only switches when a provider returns an error. It cannot switch away from a call that just hangs.

**Limitation:** no timeout on the first token for answers, so a provider that hangs without an error can still freeze a chat.

**To try:** a first-token timeout, and comparing the models with the judge evals.

## 7. Streaming (SSE)

**What it does:** sends the answer to the browser word by word as Server-Sent Events: `start`, `sources`, many `token` events, then `done` (or `error`).

**What I found**

- With Groq the first token arrived after about 1.2 seconds, and the remaining 75 tokens followed within 0.2 seconds. Tokens come in bursts, so the browser reveals them a few characters per frame to get a steady flow.
- The generator waits for the first token before it returns. That is what lets the fallback switch models without the user seeing anything. A failure after the first token cannot be hidden, so the message is saved as `failed` with the text written so far.
- The answer text is saved about once a second, and the server keeps writing the answer even if the user closes the tab. A reloaded page finds the finished answer.

**Limitation:** there is no way to cancel an answer that is being written.

## 8. Query rewriting for follow-up questions

**What it does:** turns a follow-up such as "and in China?" into a standalone question before searching. It reads the last 10 finished messages from Postgres, asks a small model to rewrite the last message, and uses the result for both the search and the prompt. The first message of a chat is not rewritten. If every model fails or times out, the original question is used.

**What I found**

- Rewrites took 0.6 to 0.9 seconds with Groq. "and in China?" became "How much power do AI data centers need in China?", a question that was already clear came back unchanged, and "What does he think about cooling?" became "What does Elon Musk think about cooling?".
- The rewriter can copy a wrong claim from an earlier answer. A rewrite once contained "cooling being a slightly bigger constraint than power", a premise the assistant had stated earlier and the transcript did not support.
- It can also lose the topic: "and what about water use?" became just "What about water use?" with no mention of data centers.
- The rewritten question is saved on the message (`search_query`) and shown in the UI, so a bad answer can be traced to a bad rewrite.

**Limitation:** one extra model call per follow-up, and it reads assistant text, which may contain errors.

**To try:** rewrite from user messages only, tell the model to keep the topic, and measure with a set of follow-up questions.

## 9. Short answers: the prompt and the retrieval settings

**What I found**

- The question "Which companies provide neo cloud services?" got a one-sentence answer. Two things caused it. The prompt ended with "Answer clearly and briefly", and retrieval kept only 3 chunks.
- The best chunk scored 0.735 and the other useful chunks about 0.65. The margin of 0.08 cut the line at 0.655, so 3 of the 7 useful chunks were kept. The margin, not top-k, was the limit.
- I removed "briefly", asked for names, numbers and reasons with the length matched to the question, and changed top-k from 8 to 12 and the margin from 0.08 to 0.12. The answer became a structured list from 7 chunks, and the details I checked (Iren started as a Bitcoin miner, Lambda is private) are in the transcript.
- When a video does not contain the topic at all, scores are flat and low. The same question against a video about something else scored between 0.522 and 0.557 for all candidates.

**Limitation:** 12 and 0.12 come from one question. A wider margin can add noise on questions with one clear answer.

**To try:** tune both numbers with the retrieval eval.

## 10. Eval set v1 (draft)

**What it is:** 25 questions on three videos (48 chunks): fact, list, overview, paraphrase, multi-video, and two the videos cannot answer. The right answer is stored as a verbatim transcript quote, which the code turns into a time range. A retrieved chunk is correct if its time range overlaps it, so the labels still work when chunking changes.

**What I found in the first review**

- All 25 quotes were found in the stored chunks.
- With top-k 12 and margin 0.12, retrieval found every piece of evidence for all 23 answerable questions, most of them at rank 1. The set is too easy to separate strategies: the videos are short (12 to 19 chunks), so keeping 12 chunks keeps nearly the whole video.
- The two unanswerable questions had top scores of 0.60 and 0.59. The lowest top score among answerable questions was 0.63. The gap is narrow.

**Baseline scores** (`npm run eval --workspace server`, dense search, recursive 1000/200 chunks, 23 answerable questions):

|                            | top 1 | top 3 | top 5 | top 10 |
| -------------------------- | ----- | ----- | ----- | ------ |
| Hit rate                   | 74%   | 91%   | 100%  | 100%   |
| Recall@k                   | 67%   | 81%   | 92%   | 100%   |
| Precision@k                | 74%   | 49%   | 34%   | 20%    |
| Best possible precision@k  | 100%  | 68%   | 43%   | 22%    |
| nDCG@k                     | 74%   | 74%   | 78%   | 83%    |
| Random guessing (hit rate) | 12%   | 33%   | 51%   | 81%    |

MRR 0.841. Precision looks low at higher k only because few chunks are correct (about two per question), so the best possible precision at top 5 is 43% and the score of 34% is close to that ceiling. By type, MRR was 1.00 for facts, 0.75 for lists, 0.71 for multi-video, 0.83 for paraphrases and 0.375 for overviews. The chunks the app really sends to the model (8.9 on average) contained 100% of the evidence.

**What the baseline says:** retrieval is clearly better than guessing at the top of the list (74% against 12% at top 1), but the pool is small, so the numbers at top 5 and top 10 are close to what guessing gives. Single facts are solved, and the weak spots are overview, list and multi-video questions.

**To try:** a larger pool (more and longer videos in each question) so the high-k numbers stop saturating.

**Eval set v2:** added two long videos (an investor's 72-chunk talk and a 50-chunk interview about AI) and 16 questions, so the set is now 41 questions (37 answerable, 4 unanswerable) on five videos. Some new questions select both long videos, so the search has to pick from 122 chunks. All 16 quotes were found, each in one place.

|                            | top 1 | top 3 | top 5 | top 10 |
| -------------------------- | ----- | ----- | ----- | ------ |
| Hit rate                   | 70%   | 92%   | 100%  | 100%   |
| Recall@k                   | 60%   | 81%   | 91%   | 97%    |
| Precision@k                | 70%   | 50%   | 36%   | 21%    |
| Best possible precision@k  | 100%  | 72%   | 48%   | 24%    |
| nDCG@k                     | 70%   | 72%   | 75%   | 80%    |
| Random guessing (hit rate) | 9%    | 24%   | 38%   | 62%    |

MRR 0.818 (was 0.841). By type: facts 0.969, paraphrases 0.857, lists 0.850, multi-video 0.617, overview 0.354. Random guessing at top 10 fell from 81% to 62%, but hit rate is still 100% at top 5, because most long-video questions found the answer at rank 1 or 2. The numbers to compare experiments on are top 1, top 3, MRR, nDCG and recall.

Both new unanswerable questions scored higher than the weakest answerable one: 0.670 (cryptocurrency, asked of the investing talk) and 0.669 (quantum computing, asked of the AI interview), against a lowest answerable top score of 0.629. Both questions name the speaker, which matches the video's opening. So the top score cannot say "no answer exists".

## Open questions

- Does 768 dimensions lose quality compared with 3072?
- Does correcting misheard terms improve retrieval?
- Does hybrid search (dense plus BM25) fix near-ties and exact-term questions? First try (equal-weight RRF): no overall gain, better on facts, lists and multi-video, worse on paraphrases. See E6 in [docs/EXPERIMENTS.md](docs/EXPERIMENTS.md). Weighted RRF and stemming are still to try.
- Does a reranker improve the final order of results?
- Does rewriting from user messages only avoid carrying wrong claims into the search?
- Can anything separate answerable from unanswerable questions? The top score cannot (0.670 for a question the videos do not answer, against 0.629 for the weakest answerable one). Try an LLM check on the retrieved chunks, or the gap between the first and second score.
