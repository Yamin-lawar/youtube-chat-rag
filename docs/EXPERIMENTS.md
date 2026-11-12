# Experiment log

Every experiment I ran on this project, in order: what I changed, why, what the numbers said, and what I can and cannot conclude from them. Written to be read again before an interview.

How the numbers are produced is in [EVAL.md](EVAL.md). The per-block notes (what each pipeline step does) are in [../LEARNING.md](../LEARNING.md).

## Summary

| #   | Experiment                            | Question                                      | Result                                                        | Status                  |
| --- | ------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- | ----------------------- |
| E1  | Distance metrics                      | Does cosine, dot product or Euclidean matter? | No, the three return almost the same chunks                   | Done, cosine kept       |
| E2  | Retrieval settings (top-k, margin)    | Why was an answer one sentence long?          | The 0.08 margin cut useful chunks; 12 and 0.12 fixed it       | Done, one question only |
| E3  | Eval set v1 and first baseline        | How good is dense search?                     | MRR 0.841, but the set was too easy                           | Done                    |
| E4  | Eval set v2 (long videos)             | Can a harder set separate strategies?         | Partly: top 1, top 3, MRR, nDCG can; hit rate at 5 still 100% | Done, baseline saved    |
| E5  | Reproducibility checks                | Is the eval deterministic and refactor-safe?  | Yes, four re-runs gave identical numbers                      | Done                    |
| E6  | Hybrid search v1 (dense + BM25, RRF)  | Does adding exact-word search help?           | No: MRR 0.818 to 0.815, paraphrases much worse                | Done, not adopted       |
| E7+ | Weighted RRF, stemming, reranker, ... | See "Planned"                                 |                                                               | Not run yet             |

The app still uses **dense search** (`SEARCH_STRATEGY` defaults to `dense`) because nothing has beaten the baseline yet.

## The yardstick

All retrieval numbers below come from the same fixed eval: 41 questions on 5 videos (37 answerable, 4 not answerable from the videos), each labelled with a verbatim transcript quote. A retrieved chunk counts as correct if its time range overlaps a quote's time range, so the labels survive a change of chunking. Differences under about 5 points are noise: one question is worth 2.7 points of hit rate.

Baseline (E4): dense search, recursive chunking (1000 characters, 200 overlap), Gemini embeddings (768 dimensions), top-k 12, margin 0.12. Saved in [baseline.json](../server/eval/baseline.json).

## E1. Distance metrics

- **Question:** does the choice of cosine, dot product or Euclidean change what is retrieved?
- **What I did:** ran the same questions on several videos and compared the top chunks under all three.
- **Result:** vector lengths were nearly equal (0.577 to 0.594), and the three metrics returned almost the same chunks. They differed only where two scores were nearly tied.
- **Why:** with equal-length vectors the three metrics are three readings of the same angle, so they sort chunks the same way.
- **Conclusion:** the metric is not where quality is won with this model. Cosine kept, the standard choice. Quality has to come from chunking, hybrid search, query rewriting or reranking.
- **Caveat:** judged by eye on a few questions, before the eval existed.
- **Details:** LEARNING.md section 4.

## E2. Retrieval settings: top-k and margin

- **Problem:** "Which companies provide neo cloud services?" got a one-sentence answer.
- **Cause found:** the prompt said "briefly", and retrieval kept only 3 chunks. The best chunk scored 0.735 and the other useful chunks about 0.65. The 0.08 margin cut the line at 0.655, so only 3 of the 7 useful chunks were kept. The margin, not top-k, was the limit.
- **Change:** removed "briefly", top-k 8 to 12, margin 0.08 to 0.12.
- **Result:** the answer became a structured list from 7 chunks. I spot-checked two details against the transcript.
- **Caveat:** one question, judged by hand. 12 and 0.12 were never tuned on the eval, and a wider margin can add noise when one chunk is clearly the answer.
- **Details:** LEARNING.md section 9.

## E3. Eval set v1 and the first baseline

- **Setup:** 25 questions on 3 short videos (48 chunks): fact, list, overview, paraphrase, multi-video, and 2 unanswerable. 23 answerable.
- **Result:** MRR 0.841. Hit rate 74% at top 1, 91% at top 3, 100% at top 5. Random guessing scored 12%, 33%, 51%, 81% at the same cutoffs.
- **By type (MRR):** facts 1.00, paraphrase 0.83, list 0.75, multi-video 0.71, overview 0.375.
- **Conclusion:** single facts are solved. The weak spots are overview, list and multi-video questions.
- **Problem found:** the videos are only 12 to 19 chunks, so keeping 12 chunks keeps nearly the whole video. The numbers at top 5 and top 10 are close to what guessing gives, so this set cannot separate strategies well.

## E4. Eval set v2: two long videos

- **Change:** added an investor's 72-chunk talk and a 50-chunk interview, plus 16 questions (41 total). Several questions select both long videos, so the search picks from 122 chunks.
- **Result (the saved baseline):**

|                            | top 1 | top 3 | top 5 | top 10 |
| -------------------------- | ----- | ----- | ----- | ------ |
| Hit rate                   | 70%   | 92%   | 100%  | 100%   |
| Recall@k                   | 60%   | 81%   | 91%   | 97%    |
| Precision@k                | 70%   | 50%   | 36%   | 21%    |
| Best possible precision@k  | 100%  | 72%   | 48%   | 24%    |
| nDCG@k                     | 70%   | 72%   | 75%   | 80%    |
| Random guessing (hit rate) | 9%    | 24%   | 38%   | 62%    |

MRR 0.818. By type: facts 0.969, paraphrase 0.857, list 0.850, multi-video 0.617, overview 0.354. The chunks the app sends to the model (9.8 on average) hold 97% of the evidence.

- **Conclusion:** random guessing at top 10 fell from 81% to 62%, but hit rate is still 100% at top 5. Compare experiments on **top 1, top 3, MRR, nDCG and recall**, not on hit rate at 5 or 10.
- **Finding, "no answer" detection:** the highest top score among unanswerable questions (0.670) is above the lowest among answerable ones (0.629). Both unanswerable questions that scored high name the speaker, which matches that video's opening. So a score threshold cannot tell "the videos do not say this". Still an open problem.

## E5. Reproducibility checks

Before trusting any comparison I checked that the eval does not move by itself. All four re-runs gave **identical numbers** (every delta 0):

| Run                   | What changed                                                        |
| --------------------- | ------------------------------------------------------------------- |
| `same-again`          | nothing, run twice back to back                                     |
| `after-refactor`      | search code moved behind a `SearchStrategy` interface               |
| `own-qdrant`          | the app's own Qdrant on port 6335 instead of another project's      |
| `run` (after E6 prep) | Qdrant collection rebuilt with sparse vectors, dense vectors copied |

Why it matters: a change of a few points between two runs can then be attributed to the change, not to chance. (Search and embeddings are deterministic here, so there is no run-to-run noise. The noise that remains is the small question set.)

Side finding: the app and eval had been silently using another project's Qdrant container on port 6333. The project now has its own on 6335.

## E6. Hybrid search v1: dense + BM25 merged with RRF

- **Hypothesis:** meaning-based search blurs exact terms ("RPO", "Gartner", "72%"). A second, exact-word search merged with the first should help questions that name specific things.
- **What I built:**
  - BM25 sparse vectors: tokenizer (lower case, accents removed, stop words and fillers dropped, numbers kept, no stemming), weights `tf*(k1+1) / (tf + k1*(1-b+b*len/avg))` with k1 1.2, b 0.75, words turned into numbers with a 32-bit FNV-1a hash. Document length average is a constant, 90 words. IDF is applied by Qdrant (`idf` modifier), not by the client.
  - Reciprocal Rank Fusion: each list gives a chunk `1/(60+rank)` points, points are added, scores are ignored and only ranks are used.
  - `HybridSearch`: dense and sparse searches run together, each returns at least 20 candidates, RRF merges them, margin disabled (RRF scores are 0.01 to 0.03, not cosine).
  - Qdrant cannot add a sparse vector to an existing collection, so the collection was rebuilt from the stored dense vectors (no re-embedding). Script: `scripts/add-sparse-vectors.ts`.
- **Run:** `npm run eval --workspace server -- --strategy hybrid --label hybrid-v1`. Code at commit `59d561f`. Saved run: [hybrid-v1.json](../server/eval/results/hybrid-v1.json).
- **Result, against the baseline:**

|             | top 1   | top 3    | top 5    | top 10   |
| ----------- | ------- | -------- | -------- | -------- |
| Hit rate    | 70% (0) | 89% (-3) | 97% (-3) | 100% (0) |
| Recall@k    | 60% (0) | 80% (-1) | 89% (-2) | 96% (-1) |
| Precision@k | 70% (0) | 44% (-6) | 35% (-1) | 20% (-1) |
| nDCG@k      | 70% (0) | 66% (-6) | 74% (-1) | 78% (-2) |

MRR 0.818 to 0.815. The model would receive 12 chunks instead of 9.8, holding 97.7% of the evidence instead of 97.3%.

| MRR by type | dense (baseline) | hybrid-v1 | change |
| ----------- | ---------------- | --------- | ------ |
| fact        | 0.969            | 1.000     | +0.031 |
| list        | 0.850            | 0.900     | +0.050 |
| multi-video | 0.617            | 0.750     | +0.133 |
| overview    | 0.354            | 0.302     | -0.052 |
| paraphrase  | 0.857            | 0.671     | -0.186 |

- **Per question:** first correct chunk moved up on 4 questions (q05 4 to 2, q14 4 to 2, q35 2 to 1, q41 4 to 1) and down on 7 (biggest: q30 3 to 8, q16 2 to 5; also q07, q18, q21, q23, q37 by one place).
- **Conclusion:** hybrid-v1 is **not better** than dense on this set, and it is not adopted. The overall change is inside the noise, but the pattern by type is the useful part: it gains on facts, lists and multi-video questions (the ones that name specific things) and loses on paraphrases and overviews.
- **Likely explanation (a reading, not tested):** paraphrase questions are written without the transcript's words, so the sparse list returns weak matches on common words. RRF counts both lists equally, so that noise pushes good dense results down. Testing it needs the experiments below.
- **Not verified:** how Qdrant's IDF weighting treats the question words, and whether a different candidate count changes anything.
- **Caveat on the fusion scores:** the top fused score cannot say "no answer" either (0.0323 for the highest unanswerable question against 0.0308 for the lowest answerable one). A fused score is mostly a rank, so its maximum is about 2/61.

## Planned (not run yet)

Each is a small change judged on the same eval. Add a result below when it is run.

| Idea                              | What it tests                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Weighted RRF (dense counts more)  | Does a smaller sparse vote fix the paraphrase drop and keep the fact gains?                 |
| Fewer sparse candidates (5 to 10) | Does less noise in the sparse list help?                                                    |
| Stemming in the tokenizer         | "customer"/"customers", "pay"/"paid" match, so the sparse list gets better                  |
| Reranker                          | Does reordering the top candidates with a cross-encoder fix near-ties?                      |
| Query optimisation                | Do rewritten or expanded questions retrieve better than the raw question?                   |
| Chunking variants                 | Sentence-aware, time-window, different sizes, parent-child; needs a collection per strategy |
| 768 against 3072 dimensions       | Does the smaller embedding lose quality?                                                    |
| Correcting misheard terms         | Does fixing "superbase" to "Supabase" in the transcript help?                               |
| Margin and top-k tuning           | Tune 12 and 0.12 on the eval instead of one question                                        |
| "No answer" detection             | LLM check on the retrieved chunks, or the gap between the first and second score            |

## Other measurements (not retrieval experiments)

- **Answer models:** the Gemini free tier was unreliable. The same short prompt took 193 seconds on Gemini and 0.96 seconds on Groq in one test, and 19 seconds on Gemini in another, and Gemini often returned 503. Groq is now tried first, Gemini is the fallback. The fallback cannot rescue a call that just hangs without an error (no first-token timeout yet). LEARNING.md section 6.
- **Streaming:** with Groq, first token after about 1.2 seconds, the other 75 tokens within 0.2 seconds. LEARNING.md section 7.
- **Query rewriting:** 0.6 to 0.9 seconds per rewrite with Groq. It can copy a wrong claim from an earlier assistant answer, or drop the topic ("and what about water use?" lost "data centers"). Not measured on the eval yet. LEARNING.md section 8.
- **Embeddings:** the free tier allows 100 embedding requests a minute, and LangChain swallowed the 429 errors and returned empty vectors, so the embedder throttles itself and checks vector sizes. LEARNING.md section 3.
- **Chunking:** 1,767 caption segments became 75 chunks (min 650, average 992, max 999 characters). Chunk times are accurate to the segment, a few seconds. After tokenizing, chunks average 85 to 90 words, one video averages 209. LEARNING.md section 2.

## Interview cheat sheet

**One-minute story.** I built a chat-with-YouTube-videos RAG app, then did not trust my own impression of its quality, so I built a retrieval eval first: 41 questions labelled with transcript quotes mapped to time ranges, so labels survive chunking changes. Every change is judged by numbers against a saved baseline. Hybrid search was the first real experiment and it did not beat dense, and I can explain why it likely did not.

**Questions I should be able to answer**

- _Why did you build an eval before improving retrieval?_ Without it I could not tell a real gain from a lucky question. A first look at one question said answers were too short; the fix looked good but was never measured (E2). The eval fixed that.
- _How do you label ground truth without fixed chunk ids?_ The label is a verbatim quote from the transcript. The code finds its time span (with padding) and a chunk is correct if its time range overlaps. If chunking changes, the labels still work.
- _What do hit rate, recall, precision, MRR and nDCG tell you?_ Hit rate: was any correct chunk in the top k. Recall@k: share of the evidence quotes found. Precision@k: share of the top k that is correct. MRR: how high the first correct chunk is, on average. nDCG: rewards correct chunks being higher up.
- _Why not compare on hit rate at 5 or 10?_ It saturates at 100%, so it cannot show a difference (E4).
- _What is hybrid search?_ Dense search finds meaning, BM25 finds exact words. Merge the two ranked lists.
- _What is BM25?_ Score a chunk by the words it shares with the question, weighted by how rare the word is (IDF), how often it appears in the chunk (with diminishing returns, capped by k1), and a correction for chunk length (b).
- _Why RRF, and not just add the scores?_ The two scores are on different scales (cosine about 0.5 to 0.8, BM25 up to double digits). RRF uses only ranks: `1/(60+rank)` from each list.
- _Why did hybrid not help?_ It helped questions that name specific things (facts, lists, multi-video) and hurt paraphrases, whose wording is not in the transcript, so the keyword list adds noise and RRF weights both lists equally. Next test is weighting dense higher.
- _What would you do differently?_ A bigger, harder question set. Right now one question is 2.7 points, so only consistent moves across several metrics mean something.
- _Is your eval deterministic?_ Yes. Identical numbers across four re-runs (E5). The noise that is left is the question set size.
- _Why did you build the eval yourself and not use Ragas, DeepEval or LangSmith?_ Ragas and DeepEval are Python, and LangSmith is hosted and would send data out. The stack is TypeScript and free tiers, and the retrieval metrics are simple to write and to explain.
- _Why store a sparse vector in Qdrant instead of searching in memory?_ Qdrant filters by video and applies IDF itself, and it keeps the dense and sparse vectors together on each point.
- _What is the weakest part of the system?_ "No answer" detection: the score of a question the videos cannot answer overlaps with the score of a weak real question (0.670 against 0.629).

**Numbers worth remembering**

| What                             | Number                                   |
| -------------------------------- | ---------------------------------------- |
| Eval set                         | 41 questions, 37 answerable, 5 videos    |
| Baseline (dense)                 | MRR 0.818, hit rate 70% at 1, 92% at 3   |
| Hit rate at top 5                | 100% (saturated, do not use)             |
| Weakest question type            | Overview, MRR 0.354                      |
| One question is worth            | 2.7 points of hit rate                   |
| Hybrid v1                        | MRR 0.815, paraphrase MRR 0.857 to 0.671 |
| Chunks                           | 375 in total, about 1000 characters      |
| BM25 / RRF constants             | k1 1.2, b 0.75, RRF k 60                 |
| Gemini against Groq, same prompt | 193 s against 0.96 s                     |

## How to add an entry

1. Write the question or hypothesis before running.
2. Change one thing. Run `npm run eval --workspace server -- --strategy <name> --label <short-name>`. The comparison with the baseline prints at the end.
3. Copy the numbers here (side by side with the baseline), including the types that got worse. Say what you cannot conclude.
4. If a run is worth keeping, copy its file from `server/eval/runs/` (git-ignored) to `server/eval/results/`.
5. Add a row to the summary table.
