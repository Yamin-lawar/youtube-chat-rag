# Experiment log

Every experiment I ran on this project, in order: what I changed, why, what the numbers said, and what I can and cannot conclude from them. Written to be read again before an interview.

How the numbers are produced is in [EVAL.md](EVAL.md). The per-block notes (what each pipeline step does) are in [../LEARNING.md](../LEARNING.md).

## Summary

| #    | Experiment                                                | Question                                                           | Result                                                                                              | Status                    |
| ---- | --------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------- |
| E1   | Distance metrics                                          | Does cosine, dot product or Euclidean matter?                      | No, the three return almost the same chunks                                                         | Done, cosine kept         |
| E2   | Retrieval settings (top-k, margin)                        | Why was an answer one sentence long?                               | The 0.08 margin cut useful chunks; 12 and 0.12 fixed it                                             | Done, one question only   |
| E3   | Eval set v1 and first baseline                            | How good is dense search?                                          | MRR 0.841, but the set was too easy                                                                 | Done                      |
| E4   | Eval set v2 (long videos)                                 | Can a harder set separate strategies?                              | Partly: top 1, top 3, MRR, nDCG can; hit rate at 5 still 100%                                       | Done, baseline saved      |
| E5   | Reproducibility checks                                    | Is the eval deterministic and refactor-safe?                       | Yes, four re-runs gave identical numbers                                                            | Done                      |
| E6   | Hybrid search v1 (dense + BM25, RRF)                      | Does adding exact-word search help?                                | No: MRR 0.818 to 0.815, paraphrases much worse                                                      | Done, not adopted         |
| E7   | Weighted RRF (sparse weight 0 to 1)                       | Does a smaller keyword vote fix the paraphrase drop?               | Paraphrase drop shrinks as the weight falls; best MRR +0.02 (later shown to be noise, see E8)       | Done, not adopted         |
| E8   | Eval set v3 (45 new questions) and a held-out check of E7 | Does the weight chosen in E7 still help on questions it never saw? | No: MRR 0.801 (dense) against 0.779 (weight 0.3), and worse with more weight                        | Done, new baseline saved  |
| E9   | Reranker (cross-encoder on the top 20)                    | Does reading question and chunk together fix the order?            | minilm: worse on both sets. bge-m3: MRR 0.801 to 0.888 on held-out, flat on old set                 | Done, bge-m3 promising    |
| E10  | Answer-level check of the reranker                        | Does the reranker change refusals or answers, not just ranks?      | No change on 8 unanswerable and 15 answerable questions; only 23 of 86 could be run (quota)         | Done in part, quota-bound |
| E11  | Query expansion (hyde, hyde+q, multi)                     | Does letting an LLM rewrite the question before searching help?    | No: MRR 0.809 to 0.755 / 0.793 / 0.803. Better on the old 37 questions, worse on the new 41 (again) | Done, not adopted         |
| E12+ | Stemming, ...                                             | See "Planned"                                                      |                                                                                                     | Not run yet               |

The app still uses **dense search with no reranker** (`SEARCH_STRATEGY` defaults to `dense`, `RERANKER` to `none`). The bge-m3 reranker (E9) is the first thing that looks better, but it costs about 4 seconds a question and I have not measured answer quality, so it is opt-in for now.

## The yardstick

All retrieval numbers come from a fixed eval where each question is labelled with a verbatim transcript quote. A retrieved chunk counts as correct if its time range overlaps a quote's time range, so the labels survive a change of chunking. Differences of a few points are noise: with 78 answerable questions one question is worth 1.3 points of hit rate.

**Two question sets.** E3 to E7 used the earlier set (41 questions on 5 videos, 37 answerable, baseline MRR 0.818). From E8 on the set is 86 questions on 12 videos (78 answerable, baseline MRR 0.809). Numbers in E3 to E7 are on the earlier set unless the text says otherwise. The earlier baseline is kept in [baseline-v2-41-questions.json](../server/eval/results/baseline-v2-41-questions.json).

Baseline (current, from E8): dense search, recursive chunking (1000 characters, 200 overlap), Gemini embeddings (768 dimensions), top-k 12, margin 0.12. Saved in [baseline.json](../server/eval/baseline.json).

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

## E7. Weighted RRF: turning the keyword list down

- **Hypothesis (from E6):** hybrid-v1 hurt paraphrases because the noisy keyword list counted as much as the meaning list. If the keyword list counts less, the paraphrase loss should shrink and the gains on facts and multi-video questions should mostly stay.
- **What I changed:** `reciprocalRankFusion` takes a weight per list (points = `weight / (60 + rank)`), `HybridSearch` takes a `sparseWeight` (dense is always 1), and the eval has `--sparse-weight`. The weight is saved in the run record and printed in the comparison. Command: `npm run eval --workspace server -- --strategy hybrid --sparse-weight 0.3 --label hybrid-w0.3`. Best run saved: [hybrid-w0.3.json](../server/eval/results/hybrid-w0.3.json).
- **Sanity check:** weight 0 gives exactly the dense baseline on every number. The weight code does what it says.
- **Result** (same 37 answerable questions each time; `1.0` is hybrid-v1, `dense` is the baseline):

| sparse weight | hit@1 | hit@3 | hit@5 | recall@3 | recall@5 | nDCG@3 | nDCG@5 | MRR   | fact | list | overview | paraphrase | multi-video |
| ------------- | ----- | ----- | ----- | -------- | -------- | ------ | ------ | ----- | ---- | ---- | -------- | ---------- | ----------- |
| dense (0)     | 70%   | 92%   | 100%  | 81%      | 91%      | 72%    | 75%    | 0.818 | 0.97 | 0.85 | 0.35     | 0.86       | 0.62        |
| 0.1           | 70%   | 92%   | 100%  | 81%      | 91%      | 71%    | 74%    | 0.816 | 0.97 | 0.85 | 0.28     | 0.86       | 0.67        |
| 0.2           | 73%   | 92%   | 97%   | 81%      | 89%      | 70%    | 74%    | 0.824 | 0.97 | 0.85 | 0.26     | 0.83       | 0.77        |
| **0.3**       | 76%   | 95%   | 97%   | 84%      | 90%      | 71%    | 75%    | 0.839 | 1.00 | 0.87 | 0.26     | 0.83       | 0.77        |
| 0.4           | 73%   | 89%   | 97%   | 81%      | 89%      | 70%    | 74%    | 0.821 | 1.00 | 0.87 | 0.24     | 0.75       | 0.77        |
| 0.5           | 73%   | 92%   | 97%   | 83%      | 89%      | 71%    | 75%    | 0.832 | 1.00 | 0.90 | 0.30     | 0.75       | 0.77        |
| 0.7           | 70%   | 92%   | 97%   | 81%      | 89%      | 68%    | 74%    | 0.817 | 1.00 | 0.90 | 0.30     | 0.67       | 0.77        |
| 1.0 (v1)      | 70%   | 89%   | 97%   | 80%      | 89%      | 66%    | 74%    | 0.815 | 1.00 | 0.90 | 0.30     | 0.67       | 0.75        |

- **What the table supports:**
  - **Paraphrase MRR falls as the keyword weight rises:** 0.86, 0.86, 0.83, 0.83, 0.75, 0.75, 0.67, 0.67. It never goes up. This is the clearest result, and it fits the E6 explanation (keyword matches hurt questions that do not use the transcript's words). It is still a pattern over 7 paraphrase questions.
  - **Facts, lists and multi-video questions gain once the weight is about 0.2 or more, and the gain does not grow with more weight.** So a small keyword vote gets most of the benefit.
- **What it does not support:**
  - **Overview questions get worse at every weight above 0** (0.35 down to between 0.24 and 0.30). One question drives it: q30 ("What is the main message of Howard Marks's talk?") falls from rank 3 to rank 7 or 8 whenever the keyword list has a say.
  - **The best weight is not a clear winner.** MRR is 0.839 at 0.3 but 0.821 at 0.4 and 0.832 at 0.5. A real effect would move smoothly. The gains are one or two questions each (at 0.3: q05 4 to 3, q35 2 to 1 and q41 4 to 1 moved up; q07 2 to 3, q16 2 to 3 and q30 3 to 8 moved down), and one question is worth 2.7 points of hit rate.
  - **I picked the best of 8 weights on the same 37 questions I score with.** The 0.3 result is the highest of several noisy numbers, so it is flattered. It would need a fresh set of questions to confirm.
- **Conclusion:** weighted RRF reduces the paraphrase damage and keeps a small, uncertain gain. The best case is MRR +0.02, which I cannot tell apart from noise. **Not adopted**: the app stays on dense search. The weight stays available as `HYBRID_SPARSE_WEIGHT` and `--sparse-weight` for later experiments.
- **What would settle it:** a larger, harder question set (especially more overview and exact-term questions), or a held-out set of new questions used only to check the chosen weight. **Done in E8: the gain at weight 0.3 did not hold up.**

## E8. Eval set v3, and a held-out check of E7

- **Why:** by E7 one question was worth 2.7 points, many differences were one question, and I had picked the best of 8 weights on the same questions I scored with. I needed more questions, and some that no choice had been made on.
- **What I added:** 45 questions (q42 to q86), written by reading the stored transcripts and labelled with verbatim quotes. All 45 quotes were checked to appear in exactly one place in their video. The mix, chosen to make retrieval harder:

| Type         | New | What they test                                                                                 |
| ------------ | --- | ---------------------------------------------------------------------------------------------- |
| fact         | 21  | Many with an exact term or number ("109 billion", "$6,500", "3072", "Opus 4.6", "Test Sprite") |
| paraphrase   | 9   | Worded without the transcript's words ("go-ahead from a person" for "approval")                |
| overview     | 5   | Whole-video questions                                                                          |
| multi-video  | 4   | Two to four videos selected, only some relevant                                                |
| list         | 2   | The four harness components, the three reasons to retrieve only relevant parts                 |
| unanswerable | 4   | Topics checked to be absent from the selected videos                                           |

Seven new videos: a 75-chunk coding tutorial (the same ideas repeat many times), **two videos about the same topic** (AI agent harnesses), **three beginner-investing videos** that overlap with each other and with the Howard Marks talk, and a **Hindi** video (two English questions about a Hindi transcript).

- **New baseline (dense, all 86 questions, 78 answerable):**

|                            | top 1 | top 3 | top 5 | top 10 |
| -------------------------- | ----- | ----- | ----- | ------ |
| Hit rate                   | 69%   | 91%   | 97%   | 100%   |
| nDCG@k                     | 69%   | 71%   | 75%   | 80%    |
| Random guessing (hit rate) | 6%    | 17%   | 27%   | 46%    |

MRR 0.809 (was 0.818). By type: facts 0.931, lists 0.821, paraphrases 0.772, multi-video 0.643, overview 0.528. The set is harder in the way I wanted: random guessing at top 10 fell from 62% to 46%, and hit rate at top 5 is 97%, no longer stuck at 100%. Full table in [EVAL.md](EVAL.md).

- **The held-out check.** The sparse weight 0.3 was chosen on q01 to q41. I ran the same settings on q42 to q86 only (`--only q42-q86`), 41 answerable questions that no choice was based on. Saved: [heldout-q42-q86-dense.json](../server/eval/results/heldout-q42-q86-dense.json) and the full run [v3-hybrid-w0.3.json](../server/eval/results/v3-hybrid-w0.3.json).

| Questions               | Search             | hit@1 | hit@3 | hit@5 | nDCG@3 | MRR   | fact | list | overview | paraphrase | multi |
| ----------------------- | ------------------ | ----- | ----- | ----- | ------ | ----- | ---- | ---- | -------- | ---------- | ----- |
| **New 41 (held out)**   | dense              | 68%   | 90%   | 95%   | 70%    | 0.801 | 0.90 | 0.75 | 0.67     | 0.71       | 0.68  |
|                         | hybrid, weight 0.3 | 66%   | 88%   | 93%   | 69%    | 0.779 | 0.93 | 0.75 | 0.67     | 0.54       | 0.69  |
|                         | hybrid, weight 0.5 | 63%   | 85%   | 93%   | 67%    | 0.765 | 0.90 | 1.00 | 0.65     | 0.54       | 0.56  |
|                         | hybrid, weight 1.0 | 61%   | 88%   | 90%   | 66%    | 0.753 | 0.89 | 0.75 | 0.75     | 0.53       | 0.54  |
| Old 37 (used to choose) | dense              | 70%   | 92%   | 100%  |        | 0.818 |      |      |          |            |       |
|                         | hybrid, weight 0.3 | 76%   | 95%   | 97%   |        | 0.839 |      |      |          |            |       |
| **All 78**              | dense              | 69%   | 91%   | 97%   | 71%    | 0.809 | 0.93 | 0.82 | 0.53     | 0.77       | 0.64  |
|                         | hybrid, weight 0.3 | 71%   | 91%   | 95%   | 70%    | 0.807 | 0.96 | 0.83 | 0.49     | 0.67       | 0.73  |
|                         | hybrid, weight 0.5 | 68%   | 88%   | 95%   | 69%    | 0.797 | 0.95 | 0.93 | 0.50     | 0.63       | 0.68  |
|                         | hybrid, weight 1.0 | 65%   | 88%   | 94%   | 66%    | 0.782 | 0.94 | 0.86 | 0.55     | 0.59       | 0.66  |

- **What this shows:**
  - **The E7 gain was selection noise.** On the questions it was chosen on, weight 0.3 gained 0.021 MRR (0.818 to 0.839). On 41 new questions the same weight **lost** 0.022 (0.801 to 0.779). Over all 78 the two cancel (0.809 against 0.807).
  - **On new questions, more keyword weight is worse, every step:** MRR 0.801, 0.779, 0.765, 0.753 for weights 0, 0.3, 0.5, 1.0.
  - **The paraphrase damage is real.** Paraphrase MRR fell on the old questions (0.857 to 0.833 at weight 0.3, to 0.67 at 1.0) and on the new ones (0.71 to 0.54). Two sets, same direction. On the new set the worst single move at weight 0.3 was q59 ("Why is it better to invest a bit every month than to wait for the perfect moment?") from rank 1 to rank 9, and q69 ("What do you call it when the answer appears piece by piece...") from rank 10 to outside the top 10.
  - **The facts gain did not replicate beyond one weight:** facts rose a little at weight 0.3 (0.90 to 0.93 on the new set) and not at 0.5 or 1.0. Lists and multi-video questions had no consistent gain.
- **A likely reason the exact-term questions did not help (checked in part):** dense search already put the right chunk first for 18 of the 21 new fact questions, so a keyword list had little left to fix. The three it missed were q56 (rank 2), q66 (rank 9) and q72 (rank 3). I did not check why the keyword list still did not rescue q66, the "3072" question.
- **Conclusion:** hybrid search with this tokenizer and RRF does **not** beat dense search on this eval, at any weight. It is not adopted, and the earlier "small gain at 0.3" is withdrawn. The weight option stays in the code. This is the most useful thing the log has so far for an interview: a promising result that did not survive new data.
- **Caveats:**
  - 41 held-out questions is still small. A difference of 0.02 MRR is about one question, so "worse by 0.022" is weak on its own. The reasons to believe it are the direction at every weight and the paraphrase drop appearing on both sets.
  - I wrote the new questions after reading the transcripts. That favours wording the transcripts contain, which should help keyword search, not hurt it, so it does not explain the result in hybrid's disfavour.
  - The tokenizer **removes Hindi vowel marks** (it strips accents with a rule that also hits Devanagari: "जून" becomes "जन", "बिलियन" becomes "बलयन"), so keyword search on the Hindi video is damaged as well as useless for English questions. It touches only that video's questions (2 of 41). Known bug, not fixed yet.
  - Keyword search also depends on caption quality: auto-generated captions mishear words, so an exact term can be missing from the transcript.

## E9. Reranker: a cross-encoder reads question and chunk together

- **Why:** dense search compares two vectors that were made separately, so the chunk's vector was written without knowing the question. A cross-encoder reads the question and one chunk together and outputs one score, so it can notice details such as "RPO". The question: does reordering the top candidates with it fix the near-ties dense search gets wrong?
- **What I built:** `RerankedSearch` takes the top 20 chunks from the normal search, scores each one against the question with a model running inside the Node process (`@huggingface/transformers`, ONNX on CPU), and keeps the best 12. Two models, chosen with `RERANKER` or `--reranker`:

| Name   | Model                                | Size (on disk) | Time for 20 chunks | Languages    |
| ------ | ------------------------------------ | -------------- | ------------------ | ------------ |
| minilm | Xenova/ms-marco-MiniLM-L-6-v2 (fp32) | 87 MB          | about 0.25 s       | English only |
| bge-m3 | bge-reranker-v2-m3 (ONNX, 8-bit q8)  | 561 MB         | about 3.9 s        | multilingual |

Cohere Rerank was ruled out because it is API-only (cannot be self-hosted). The "no local models" rule was relaxed only for this reranker.

- **Setup:** same 86 questions, top 12 kept, no margin filter (reranker scores are not comparable to cosine, so `maxScoreDrop` is off). The question embeddings came from the new cache, so every run saw identical queries. Choose on q01 to q41, confirm on q42 to q86 (as in E8).
- **Results, all 78 answerable questions** (runs saved in `server/eval/results/`):

| Search             | hit@1 | hit@3 | hit@5 | hit@10 | nDCG@5 | MRR       | fact | list | overview | paraphrase | multi |
| ------------------ | ----- | ----- | ----- | ------ | ------ | --------- | ---- | ---- | -------- | ---------- | ----- |
| dense (baseline)   | 69%   | 91%   | 97%   | 100%   | 0.752  | 0.809     | 0.93 | 0.82 | 0.53     | 0.77       | 0.64  |
| dense + minilm     | 64%   | 90%   | 95%   | 99%    | 0.689  | 0.776     | 0.87 | 0.91 | 0.50     | 0.64       | 0.80  |
| hybrid + minilm    | 64%   | 88%   | 94%   | 99%    | 0.681  | 0.773     | 0.85 | 0.91 | 0.50     | 0.64       | 0.86  |
| **dense + bge-m3** | 81%   | 86%   | 94%   | 97%    | 0.771  | **0.854** | 0.97 | 1.00 | 0.58     | 0.70       | 0.82  |

- **The held-out check.** Same runs split into the questions I used to look at things (37 answerable, q01 to q41) and the ones I had not (41 answerable, q42 to q86):

| Search          | Old 37 MRR | Old 37 hit@1 | New 41 MRR | New 41 hit@1 | New 41 nDCG@5 |
| --------------- | ---------- | ------------ | ---------- | ------------ | ------------- |
| dense           | 0.818      | 70%          | 0.801      | 68%          | 0.751         |
| dense + minilm  | 0.798      | 68%          | 0.756      | 61%          | 0.693         |
| hybrid + minilm | 0.798      | 68%          | 0.750      | 61%          |               |
| dense + bge-m3  | 0.815      | 76%          | **0.888**  | **85%**      | 0.792         |

Saved separately as `new45-dense-minilm` and `new45-dense-bge-m3` runs. The eval prints the settings comparison against the 86-question baseline for `--only` runs (for example "0.809 to 0.888"), which is not like for like: compare against the held-out dense run (0.801) instead, as in the table above.

- **What this shows:**
  - **minilm is worse than no reranker, on both sets.** MRR down 0.020 on the old questions and 0.045 on the new ones. Same direction on two sets, so I believe it. It lost most on paraphrases (0.77 to 0.64) and on facts (0.93 to 0.87). The likely reason is that it was trained on English web-search queries and short passages, and our questions are spoken-style and our chunks are caption text (not checked).
  - **Hybrid plus a reranker is the same as dense plus a reranker** (0.773 against 0.776). The reranker decides the order, so the first-stage choice hardly matters. That is a second, indirect reason hybrid was not worth it. Not tested with bge-m3.
  - **bge-m3 helps at the top and costs a little further down.** hit@1 rose from 69% to 81% (about 9 questions of 78), MRR 0.809 to 0.854, nDCG@5 0.752 to 0.771. But hit@3 fell 91% to 86%, hit@5 97% to 94% and hit@10 100% to 97%. 14 questions moved up, 11 moved down, and the worst were q59 (rank 1 to 12) and q30 (rank 3, now outside the top 12).
  - **The gain is not selection noise this time, but it is uneven.** On the old 37 questions MRR is flat (0.818 to 0.815, hit@1 70% to 76%). On the new 41 it is large (0.801 to 0.888, hit@1 68% to 85%, about 7 questions). It lost nothing on either set by MRR, unlike E7. The new questions have more exact terms and repeated ideas, which may be where a cross-encoder helps most.
  - **Types:** with bge-m3, facts 0.93 to 0.97, lists 0.82 to 1.00, multi-video 0.64 to 0.82, overview 0.53 to 0.58, but paraphrase 0.77 to 0.70. By set: on the 7 old paraphrases 0.857 to 0.673, on the 9 new ones 0.706 to 0.717 (flat). Paraphrases did not improve, and on the old set they got clearly worse (7 questions, so noisy), which is the same weak spot hybrid search had.
- **Cost:** about 3.9 seconds a question on this laptop CPU for bge-m3 (86 questions took 5 min 36 s) against about 0.25 s for minilm. The model is 561 MB on disk and the Node process grew to about 500 MB of memory. On a server without a fast CPU this is a real cost for chat.
- **Conclusion:** the minilm reranker is **rejected**. The bge-m3 reranker is **promising and not adopted yet**. It sharpens the first result (hit@1 +12 points) but thins the tail, and it is slow. `RERANKER` stays `none` by default.
- **Caveats (important):**
  - **The answer model sees 12 chunks, not one.** What matters for the final answer is whether the evidence is in those 12. With bge-m3 the share of evidence quotes kept in the 12 went down slightly, 0.981 to 0.968 (the dense baseline kept about 10.5 chunks on average because of its margin filter, so this is not exactly like for like). So **the retrieval gain at rank 1 may not turn into better answers**. Answer quality was not measured.
  - **"No answer" was untested with a reranker** (checked in E10: no change on the 8 unanswerable questions). The app does not refuse on a score: the answer model refuses by following the prompt, and the margin filter only trims chunks.
  - **Only the top 20 candidates are reranked.** A right chunk outside the first 20 cannot be rescued. I did not try 10 or 30 candidates.
  - **41 held-out questions is small.** 0.087 MRR is a handful of questions. The reasons to believe it are hit@1, MRR and nDCG all rising and nothing getting worse by MRR on either set. The reasons for doubt are the old-set MRR being flat and the tail getting worse.
  - **The 8-bit (q8) bge-m3 model is a lossy version.** I did not compare it with the full-precision one.
  - **Same warning as before:** the model was tried once with default settings. I did not tune anything for it, which is on purpose, so the numbers are not flattered.

## E10. Answer-level check of the reranker, and the "no answer" question

- **Why:** E9 measured where the right chunk ranks. The answer model reads 12 chunks, not one, so a better rank 1 might not change the answer. And I wanted to know whether the reranker changes what the app does with questions the videos cannot answer.
- **A correction first.** I had assumed the app refuses "no answer" questions using the cosine score. It does not. `retrieveChunks` only trims weak chunks (the 0.12 margin) and never refuses. The refusal comes from the answer model following one prompt rule ("if the excerpts do not contain the answer, say you could not find it"). So the reranker can only matter through which 12 chunks the model sees and in what order. The reranked search always keeps 12, while dense keeps about 10.5 on answerable questions (and 12 on unanswerable ones, where all scores are low and close together).
- **What I built:** `npm run eval:answers --workspace server`. It runs the app's real path (retrieve, then the real prompt and answer model) for each question and records:
  - **Refused?** The answer says it could not find it (a phrase check on the first 300 characters). Right for the 8 unanswerable questions, a false refusal for answerable ones. I read all 16 unanswerable answers: the check matched all 14 refusals and not the 2 real answers.
  - **Cited the right passage?** For answerable questions that were answered: does at least one cited excerpt overlap a labelled quote, by the same time-overlap rule as the retrieval eval?
  - **Citation precision:** of the excerpts cited, the share that overlap a labelled quote. Stricter, because citing 9 excerpts and hitting one still counts as a hit above.
  - **No LLM judge.** A judge would use up the same small free quota again and would add its own errors. Both checks are deterministic, so a re-run on cached answers gives the same numbers. The cost is that citing the right passage does not prove the claim is correct.
- **How it stays affordable:** answers are cached by the exact prompt (so a stopped run resumes and a re-score is free), a pre-flight line prints the calls and tokens, it waits out per-minute limits and 503s, and a daily limit stops it cleanly. It uses one provider only, so a mid-run fallback cannot mix two models into one comparison.
- **Setup:** answer model `openai/gpt-oss-120b` on Groq (the app's first choice, temperature 0.2), dense search, 12 chunks. Each answer was written once and cached, so both configurations are one sample each of the model's output.
- **Results** (runs in `server/eval/results/answers-*.json`, answers included):

| Questions                  | Measure                              | dense | dense + bge-m3 |
| -------------------------- | ------------------------------------ | ----- | -------------- |
| 8 unanswerable             | refused (correct)                    | 7     | 7              |
|                            | answered (q85, the same one)         | 1     | 1              |
| 15 answerable (q42 to q56) | wrongly refused                      | 0     | 0              |
|                            | answered and cited the right passage | 15    | 15             |
|                            | citation precision                   | 0.73  | 0.73           |
|                            | chunks given to the model (average)  | 10.9  | 12.0           |
|                            | average answer length (characters)   | 671   | 609            |
|                            | average citations per answer         | 3.1   | 2.7            |

The 15 are a mix of types: 8 fact, 2 paraphrase, 2 overview, 1 list, 2 multi-video. Under dense, q54 and q55 were given only 7 and 4 chunks by the margin filter.

- **What this shows:**
  - **The reranker does not break refusals.** Same 7 refused, same one answered, and the refusals read almost word for word the same. Even with 12 chunks (more weak ones), the model did not start inventing answers.
  - **The reranker does not change answer grounding on these 15.** Both cite a correct passage every time, with the same precision. bge-m3 cites lower-numbered excerpts (for example [1][2] instead of [1][7]), which is the reordering showing, not a better answer.
  - **It does not show the E9 gain turning into better answers either.** These 15 are a ceiling: 100% either way, so the check cannot separate the two. The rank-1 gain is not shown to matter for answers.
  - **q85** ("What do the videos say about investing in real estate?") was answered by both with a farm-ownership analogy from the videos, hedged as "only touch on". The label (unanswerable) is debatable, and I left it unchanged rather than edit it after seeing the result.
- **What I could not run, and why:** only 23 of 86 questions have paired answers.
  - **Groq** allows 200,000 tokens per rolling 24 hours for this model (and 8,000 a minute). The prompts are about 3,300 tokens, so that is about 50 answers a day. My 60 answers used it all. A full run is about 255,000 input tokens per configuration, roughly 3 days of free Groq for both.
  - **Gemini** (the fallback) returned a 503 "high demand", then a dropped connection, then a 429 quota error on generation.
  - So q57 to q86 and the old q01 to q41 have no paired answers. The partial dense answers for q57 to q71 (14 of 15) are cached. Re-running the same commands resumes and costs only the missing answers.
- **Conclusion:** no sign the reranker harms refusals or grounded answers, and no sign it improves them, on the 23 questions that could be run. The decision about bge-m3 therefore still rests on E9 (better top result) against its cost (about 4 seconds a question, 561 MB). It stays opt-in.
- **Caveats:**
  - **Small and easy.** 15 answerable and 8 unanswerable questions, and the answerable ones were at 100% for both. A difference of one or two questions would have gone unseen.
  - **One sample of the answer.** Temperature 0.2 and one answer per question, so a single changed answer is not evidence.
  - **Proxy metrics.** "Cited a passage with the quote" is not "the answer is correct". I only read the 16 unanswerable answers and the lengths and citations of the 15, not each answerable answer in full.
  - **One answer model.** Another model (the Gemini fallback) may refuse differently.
  - **Refusal check is a phrase check.** It matched every case I read, but a model that refuses in new words would be missed.

## E11. Query expansion: let an LLM rewrite the question before searching

Not the follow-up rewriter already in the app (that one turns "and in China?" into a full question). This one tries to make the search itself find more. Called "expansion" in the code to keep the two apart.

- **Why:** the weak spots in the eval are paraphrases (MRR 0.77) and overviews (0.53), where the question's words are not the transcript's words. An LLM might bridge that gap by writing the question the way the speaker would say it.
- **What I built:** `ExpandedSearch` wraps any search. A model (Groq `openai/gpt-oss-120b`, temperature 0) writes extra texts, each text is searched, and the lists are merged with rank fusion (the same code as hybrid search). If the model fails, the app searches the plain question. Three modes, chosen with `QUERY_EXPANSION` or `--expansion`:

| Mode   | Searched with                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------- |
| hyde   | Only a short invented passage that answers the question, in spoken transcript style (HyDE)          |
| hyde+q | The question and that passage, merged                                                               |
| multi  | The question and three rewrites (reworded, key terms only, a short statement of the answer), merged |

- **Setup:** dense search, no reranker (`--reranker none`, passed on purpose), all 86 questions, top 12. The eval writes every expansion before searching and stops if the model fails, so a failed expansion is never scored as a result. The texts are cached in a file, so every run searches with identical text. The questions' own embeddings were already cached; the new texts cost 338 Gemini embedding requests.
- **Results, all 78 answerable questions:**

| Search           | hit@1 | hit@3 | hit@5 | nDCG@5 | MRR       | Old 37 MRR | New 41 MRR | fact  | list  | overview | paraphrase | multi-video |
| ---------------- | ----- | ----- | ----- | ------ | --------- | ---------- | ---------- | ----- | ----- | -------- | ---------- | ----------- |
| dense (baseline) | 69%   | 91%   | 97%   | 0.75   | **0.809** | 0.818      | 0.801      | 0.931 | 0.821 | 0.528    | 0.772      | 0.643       |
| hyde             | 63%   | 85%   | 92%   | 0.70   | 0.755     | 0.854      | 0.665      | 0.900 | 0.786 | 0.348    | 0.746      | 0.556       |
| hyde+q           | 67%   | 91%   | 96%   | 0.73   | 0.793     | 0.842      | 0.748      | 0.931 | 0.833 | 0.528    | 0.720      | 0.587       |
| multi            | 68%   | 92%   | 96%   | 0.74   | 0.803     | 0.836      | 0.773      | 0.911 | 0.814 | 0.611    | 0.763      | 0.615       |

Runs are in `server/eval/results/expansion-*.json`. Counts per type: 37 fact, 16 paraphrase, 9 overview, 9 multi-video, 7 list.

- **What this shows:**
  - **No mode beats plain dense search.** Best is multi at 0.803 against 0.809, which is the same within noise. hyde alone is clearly worse (-0.054 MRR, hit@1 69% to 63%).
  - **It is the E8 pattern again.** All three modes beat dense on the 37 old questions (+0.036, +0.024, +0.018) and lose on the 41 new ones (-0.136, -0.053, -0.028). If I had judged on the old set only I would have adopted it. That is the reason the new questions are kept as a check. The more the model invents (hyde), the bigger the swing in both directions.
  - **HyDE fails when the model does not know the video.** The model sees only the question, never the transcript. For q53 ("Which products does each harness video give as examples of a harness?") it invented dog harnesses, climbing harnesses and child car seats, when the videos are about AI agent harnesses (the chunk fell out of the top 12). For q73 ("What does the tutorial build?") it invented a to-do app with React and Firebase. For q48 it invented GitHub Copilot latency numbers (rank 1 to 10). It does well when its general knowledge matches the video: q77 (a famous quote) moved from rank 4 to 1.
  - **Multi is safer but does little.** Its rewrites mostly repeat the question (for q73: "What is constructed in the tutorial?", "tutorial build", "The tutorial builds something."). It moved 7 questions up and 6 down. The one visible gain is overview (0.528 to 0.611, 9 questions, so about one or two questions), and paraphrase did not improve (0.772 to 0.763), which was the point of the experiment.
  - **Paraphrases did not get better in any mode** (0.746, 0.720, 0.763 against 0.772), so the idea that an LLM bridges the wording gap did not hold here.
- **Cost:** one extra model call before every search (the eval wrote 86 per mode; wall time was a few minutes, mostly waiting out Groq's per-minute token limit), plus one or three more embedding requests per question, and more Qdrant searches. Not timed per question.
- **Conclusion:** query expansion is **not adopted**. `QUERY_EXPANSION` stays `none`. The code stays, behind the option.
- **Caveats:**
  - **One model, one prompt each.** I did not tune the prompts, on purpose, since tuning on this eval would repeat the selection mistake of E7. A better prompt is possible.
  - **The model never sees the videos.** Giving it the video titles or a summary would address the main failure above. That is the obvious next try and I did not do it.
  - **The invented passage was embedded as a question** (Gemini's query mode), not as a document. HyDE papers embed it as a document. Untested.
  - **Reranker not combined.** All runs had the reranker off. A reranker on top reads the original question, so expansion could still help as a way to find more candidates. Untested.
  - **No margin.** Expanded search keeps the top 12 without the 0.12 cosine margin, like hybrid and reranked search. Retrieval metrics at 1, 3, 5 and 10 do not depend on it.
  - **Small sample.** Differences of 0.01 to 0.02 MRR are one question or less.

## Planned (not run yet)

Each is a small change judged on the same eval. Add a result below when it is run.

| Idea                                                | What it tests                                                                                                                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fewer sparse candidates (5 to 10)                   | Does less noise in the sparse list help?                                                                                                                               |
| Fix Hindi (Devanagari) vowel marks in the tokenizer | Strip accents only from Latin letters, keep the marks of other scripts; rebuild the sparse vectors (found in E8)                                                       |
| Stemming in the tokenizer                           | "customer"/"customers", "pay"/"paid" match, so the sparse list gets better                                                                                             |
| Reranker follow-ups                                 | Candidates 10 or 30 instead of 20; hybrid plus bge-m3; bge-m3 at full precision; a cut-off so the tail is not lost                                                     |
| Finish the answer-level check (E10)                 | The other 63 answerable questions, dense against bge-m3; needs about 3 days of free Groq or a paid tier                                                                |
| Expansion with video context                        | Give the expansion model the video titles or a summary, so it stops inventing the wrong topic (found in E11); embed the passage as a document; expansion plus reranker |
| Chunking variants                                   | Sentence-aware, time-window, different sizes, parent-child; needs a collection per strategy                                                                            |
| 768 against 3072 dimensions                         | Does the smaller embedding lose quality?                                                                                                                               |
| Correcting misheard terms                           | Does fixing "superbase" to "Supabase" in the transcript help?                                                                                                          |
| Margin and top-k tuning                             | Tune 12 and 0.12 on the eval instead of one question                                                                                                                   |
| "No answer" detection                               | LLM check on the retrieved chunks, or the gap between the first and second score                                                                                       |

## Other measurements (not retrieval experiments)

- **Answer models:** the Gemini free tier was unreliable. The same short prompt took 193 seconds on Gemini and 0.96 seconds on Groq in one test, and 19 seconds on Gemini in another, and Gemini often returned 503. Groq is now tried first, Gemini is the fallback. The fallback cannot rescue a call that just hangs without an error (no first-token timeout yet). LEARNING.md section 6.
- **Streaming:** with Groq, first token after about 1.2 seconds, the other 75 tokens within 0.2 seconds. LEARNING.md section 7.
- **Query rewriting:** 0.6 to 0.9 seconds per rewrite with Groq. It can copy a wrong claim from an earlier assistant answer, or drop the topic ("and what about water use?" lost "data centers"). Not measured on the eval yet. LEARNING.md section 8.
- **Embeddings:** the free tier allows 100 embedding requests a minute, and LangChain swallowed the 429 errors and returned empty vectors, so the embedder throttles itself and checks vector sizes. LEARNING.md section 3.
- **Chunking:** 1,767 caption segments became 75 chunks (min 650, average 992, max 999 characters). Chunk times are accurate to the segment, a few seconds. After tokenizing, chunks average 85 to 90 words, one video averages 209. LEARNING.md section 2.

## Interview cheat sheet

**One-minute story.** I built a chat-with-YouTube-videos RAG app, then did not trust my own impression of its quality, so I built a retrieval eval first: 86 questions labelled with transcript quotes mapped to time ranges, so labels survive chunking changes. Every change is judged by numbers against a saved baseline. Hybrid search was the first real experiment and it did not beat dense. Turning the keyword list down looked like a small win on the questions I tuned on, so I added 45 new questions and checked on those: the win disappeared and hybrid was worse at every weight. I dropped it. Then I added a self-hosted cross-encoder reranker: a small one made things worse on both sets, a large multilingual one lifted the top-1 hit rate from 69% to 81% (MRR 0.809 to 0.854, strongest on questions I had not tuned on) but costs about 4 seconds a question and thins the tail, so I kept it opt-in until I can measure answer quality.

**Questions I should be able to answer**

- _Why did you build an eval before improving retrieval?_ Without it I could not tell a real gain from a lucky question. A first look at one question said answers were too short; the fix looked good but was never measured (E2). The eval fixed that.
- _How do you label ground truth without fixed chunk ids?_ The label is a verbatim quote from the transcript. The code finds its time span (with padding) and a chunk is correct if its time range overlaps. If chunking changes, the labels still work.
- _What do hit rate, recall, precision, MRR and nDCG tell you?_ Hit rate: was any correct chunk in the top k. Recall@k: share of the evidence quotes found. Precision@k: share of the top k that is correct. MRR: how high the first correct chunk is, on average. nDCG: rewards correct chunks being higher up.
- _Why not compare on hit rate at 5 or 10?_ On the earlier set it was 100% from top 5, so it could not show a difference (E4). On the 86-question set it is 97% at top 5 and 100% at top 10, still too flat to compare on. Top 1, top 3, MRR and nDCG move more.
- _What is hybrid search?_ Dense search finds meaning, BM25 finds exact words. Merge the two ranked lists.
- _What is BM25?_ Score a chunk by the words it shares with the question, weighted by how rare the word is (IDF), how often it appears in the chunk (with diminishing returns, capped by k1), and a correction for chunk length (b).
- _Why RRF, and not just add the scores?_ The two scores are on different scales (cosine about 0.5 to 0.8, BM25 up to double digits). RRF uses only ranks: `1/(60+rank)` from each list.
- _Why did hybrid not help?_ It helped questions that name specific things (facts, lists, multi-video) and hurt paraphrases, whose wording is not in the transcript, so the keyword list adds noise. I tested that by weighting the keyword list from 0 to 1: paraphrase MRR fell steadily as the weight went up (0.86 down to 0.67). A weight of 0.3 gave the best MRR (0.839 against 0.818), but the curve is bumpy and the gain is one or two questions, so I did not adopt it.
- _You tried 8 weights and picked the best, isn't that overfitting?_ Yes, and I checked it. The best weight (0.3) gained 0.021 MRR on the 37 questions I chose it on, but on 41 new questions it lost 0.022 (0.801 to 0.779) and more keyword weight was worse at every step. So I withdrew the win. Choosing on one set and confirming on a fresh one is why I keep the new questions separate (`--only q42-q86`).
- _What is a reranker and why does it help?_ Dense search scores a chunk with a vector that was made without knowing the question. A cross-encoder reads the question and the chunk together and gives one score, so it catches details a summary vector blurs. It is too slow for all chunks, so it only reorders the top 20 from the normal search (retrieve wide, rerank narrow).
- _Why didn't you use Cohere Rerank?_ It is API-only, so it cannot be self-hosted, and its free trial allows about 10 calls a minute, which makes an 86-question eval slow. A local model is deterministic, needs no key and is free.
- _Did the reranker help?_ It depends on the model. MiniLM made things worse on both question sets (MRR down 0.02 and 0.045). The large multilingual bge-m3 raised hit@1 from 69% to 81% and MRR from 0.809 to 0.854, with most of the gain on the held-out set (0.801 to 0.888), but top-3 and top-5 hit rates fell a few points, it takes about 4 s a question and I have not shown that answers improve. So I call it promising, not adopted.
- _Why did the small reranker lose?_ Probably because it was trained on English web search queries and short passages and ours are spoken-style questions over caption text. I did not verify the reason, only that the loss is the same direction on two question sets.
- _How does your app say "I don't know"?_ Not with a score. The answer model refuses by following one prompt rule, and the retrieval margin only trims weak chunks. I checked this on 8 questions the videos cannot answer: 7 of 8 were refused, with and without the reranker. The eighth (real estate, answered through a farm analogy) is a debatable label.
- _Did the reranker improve the answers?_ I could not show it. On the 15 answerable questions I could run, both versions answered all of them and cited a correct passage every time, so the check was at its ceiling. I ran out of free answer-model quota (Groq 200,000 tokens a day, Gemini 429) before the other 63. That is a limit of the free tier and the sample size, and I say so.
- _Why no LLM judge for the answers?_ It would use the same small free quota and add its own errors. I used checks that are deterministic (did it refuse, did it cite a passage that holds the labelled quote), at the price of not verifying the claim itself.
- _What is query expansion, and did it help?_ An LLM writes extra search texts from the question: an invented answer passage (HyDE) or reworded queries, and the result lists are merged. I tried three modes. None beat plain dense search (best 0.803 against 0.809 MRR). HyDE was worst because the model has never seen the video and invents the wrong topic.
- _What did E11 teach you about evaluation?_ The same thing as E8. All three modes looked better on the 37 questions I had been looking at and worse on the 41 new ones. Checking on a second set stopped me from shipping an LLM call that makes search worse.
- _What would you do differently?_ A bigger question set written by someone who has not read the videos. Now one question is 1.3 points, which is better, but a change of one or two questions is still noise, so only consistent moves across several metrics and across two sets mean something.
- _Is your eval deterministic?_ Yes. Identical numbers across four re-runs (E5). The noise that is left is the question set size.
- _Why did you build the eval yourself and not use Ragas, DeepEval or LangSmith?_ Ragas and DeepEval are Python, and LangSmith is hosted and would send data out. The stack is TypeScript and free tiers, and the retrieval metrics are simple to write and to explain.
- _Why store a sparse vector in Qdrant instead of searching in memory?_ Qdrant filters by video and applies IDF itself, and it keeps the dense and sparse vectors together on each point.
- _What is the weakest part of the system?_ "No answer" detection: the score of a question the videos cannot answer overlaps with the score of a weak real question (0.670 against 0.629).

**Numbers worth remembering**

| What                                    | Number                                                            |
| --------------------------------------- | ----------------------------------------------------------------- |
| Eval set                                | 86 questions, 78 answerable, 12 videos                            |
| Baseline (dense)                        | MRR 0.809, hit rate 69% at 1, 91% at 3                            |
| Hit rate at top 5                       | 97% (100% at top 10, too flat to compare on)                      |
| Weakest question type                   | Overview, MRR 0.528 (multi-video 0.643)                           |
| One question is worth                   | 1.3 points of hit rate                                            |
| Hybrid v1 (equal weights)               | MRR 0.815, paraphrase MRR 0.857 to 0.671                          |
| Weighted RRF (weight 0.3)               | Old set +0.021 MRR, new set -0.022: not real                      |
| Reranker minilm / bge-m3                | MRR 0.776 / 0.854 (dense 0.809); about 0.25 s / 3.9 s a question  |
| bge-m3 on held-out questions            | MRR 0.801 to 0.888, hit@1 68% to 85%                              |
| Answer check (Groq, bge-m3 vs none)     | Unanswerable 7 of 8 refused both; 15 answerable 15/15 both        |
| Groq free answer quota                  | 200,000 tokens a day, about 50 answers                            |
| Query expansion (hyde / hyde+q / multi) | MRR 0.755 / 0.793 / 0.803 (dense 0.809); old set up, new set down |
| Chunks                                  | 375 in total, about 1000 characters                               |
| BM25 / RRF constants                    | k1 1.2, b 0.75, RRF k 60                                          |
| Gemini against Groq, same prompt        | 193 s against 0.96 s                                              |

## How to add an entry

1. Write the question or hypothesis before running.
2. Change one thing. Run `npm run eval --workspace server -- --strategy <name> --label <short-name>`. The comparison with the baseline prints at the end.
3. Copy the numbers here (side by side with the baseline), including the types that got worse. Say what you cannot conclude.
4. If a run is worth keeping, copy its file from `server/eval/runs/` (git-ignored) to `server/eval/results/`.
5. Add a row to the summary table.
