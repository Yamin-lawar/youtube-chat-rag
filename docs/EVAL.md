# Retrieval eval

How we measure whether retrieval finds the right part of a video, and how to check the numbers yourself.

The eval answers one question: **for a given question, are the chunks the search returns the ones that contain the answer?** It does not judge the written answer. That is a separate step.

## Why it exists

Reading a few answers and deciding they "look fine" cannot show whether a change helped. Hybrid search, a reranker or new chunking each need a fixed set of questions with known answers, scored the same way every run. Run the eval before and after a change. If the numbers go up, the change helped.

## How it works

```
 server/eval/questions.json
   86 questions, each with the answer written as a quote from the transcript
              |
              v
 1. Find the quote in the stored chunks  ->  a time range in the video (the "answer key")
 2. Embed the question and search Qdrant ->  a ranked list of chunks
 3. A chunk is CORRECT if its time range overlaps the answer's time range
 4. Score the ranked list (hit rate, recall, precision, nDCG, MRR)
```

### The answer key is a quote, not a chunk id

Each question stores a short, verbatim quote from the transcript:

```json
{
  "id": "q03",
  "type": "fact",
  "question": "What share of CoreWeave's revenue comes from its three biggest customers?",
  "youtubeIds": ["DRDI0KApHZw"],
  "evidence": [
    {
      "youtubeId": "DRDI0KApHZw",
      "quote": "three customers made up about 72% of Coreweave's revenue"
    }
  ]
}
```

We do not store chunk ids because they change whenever the chunking changes. A quote does not. Each run, the code looks the quote up in the stored chunks and turns it into a time range ([evidence.ts](../server/src/eval/evidence.ts)). For q03 that gives `6:11-6:31`.

Two details:

- Chunks store a start and end time, not the time of every word. The quote's position is estimated by assuming an even speaking pace, then widened by 8 seconds on each side. This is accurate to a few seconds, which is enough to tell which chunks cover it.
- Chunks overlap by 200 characters, so one quote usually sits in two neighbouring chunks. Both count as correct.

Questions of type `unanswerable` have no evidence. They are not scored with the metrics. Instead the eval reports their top similarity score, to see whether the score can tell "answer exists" from "no answer".

### Question types

| Type           | Example                                                       |
| -------------- | ------------------------------------------------------------- |
| `fact`         | "What does backlog, or RPO, mean?"                            |
| `list`         | "What are the four risks the video sums up?" (several quotes) |
| `overview`     | "What is this video about?"                                   |
| `paraphrase`   | A fact asked in different words than the transcript uses      |
| `multi-video`  | A question across two selected videos                         |
| `unanswerable` | A question the videos do not answer                           |

## The metrics

Here `k` is how many top results we look at. We report k = 1, 3, 5 and 10.

| Metric          | Plain question                       | How it is calculated                                                                            |
| --------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Hit rate@k**  | Is anything correct in the top k?    | 1 if at least one top-k chunk is correct, else 0, averaged over questions                       |
| **Recall@k**    | Did we find every piece of evidence? | Quotes covered by the top k chunks, divided by the number of quotes                             |
| **Precision@k** | Is what we returned useful?          | Correct chunks in the top k, divided by k                                                       |
| **MRR**         | How high is the first correct chunk? | 1 / rank of the first correct chunk, averaged (rank 1 = 1.0, rank 2 = 0.5, rank 4 = 0.25)       |
| **nDCG@k**      | Is the whole list in a good order?   | Credit for each correct chunk, larger near the top, divided by the credit of a perfect ordering |

Notes on reading them:

- **Recall counts quotes, not chunks.** If two chunks cover the same quote, finding either one finds the evidence. Precision does count chunks.
- **Best possible precision** is printed next to precision. A question with 2 correct chunks cannot score above 2/5 = 40% at k = 5, so a score near that is close to perfect.
- **Random guessing** is printed too: the hit rate you would get by picking k chunks at random from the selected videos. The videos are short (12 to 19 chunks), so random guessing already scores high at larger k. A result close to that line means retrieval adds little at that k.
- **What the model really receives** is reported separately. The app keeps at most 12 chunks and drops any scoring more than 0.12 below the best. The eval checks whether the evidence survives that cut.

## Running it

You need Qdrant running, the eval videos ingested, and `GOOGLE_API_KEY` set in `.env` (the questions are embedded with Gemini).

```bash
# from the repo root
npm run eval --workspace server

# or from server/
npm run eval
```

The output has these parts:

1. A table of hit rate, recall, precision, nDCG and random guessing at each k, plus MRR.
2. The same scores grouped by question type.
3. What the model really receives (evidence recall and chunks kept).
4. The questions where the first correct chunk was not rank 1.
5. The top-score gap between answerable and unanswerable questions.

Embedding the questions takes a minute or so because of the free-tier rate limit.

## Comparing with earlier runs

The embedding of each question is kept in `server/eval/cache/` (not committed), so after the first run the eval makes no embedding calls and does not use the Gemini quota (1000 requests a day on the free tier). Every run is saved as a JSON file in `server/eval/runs/` (not committed) and compared with [baseline.json](../server/eval/baseline.json), the run to beat (committed). The comparison is printed after the normal output.

```bash
# keep the current numbers as the baseline (do this on a setup you trust)
npm run eval --workspace server -- --save-baseline

# run an experiment and name it; the output ends with a comparison to the baseline
npm run eval --workspace server -- --label hybrid

# choose the search strategy (dense is the default, set SEARCH_STRATEGY in .env to change the app too)
npm run eval --workspace server -- --strategy hybrid --label hybrid-v1

# hybrid with the exact-word list counting less than the meaning list (default 1, 0 = same as dense)
npm run eval --workspace server -- --strategy hybrid --sparse-weight 0.3 --label hybrid-w0.3

# re-order the search results with a local reranker model (downloaded on the first run)
npm run eval --workspace server -- --reranker minilm --label dense-minilm

# search with extra texts written by an LLM (hyde, hyde+q, multi). Writes them first and caches them in
# eval/cache/query-expansions.json. Pass --reranker none, or the RERANKER in .env is used.
npm run eval --workspace server -- --expansion multi --reranker none --label dense-multi

# search another chunking (size/overlap in characters). Ingest it first, one Qdrant collection per variant:
#   npm run ingest:eval --workspace server -- --chunking 500/100 --dry-run   (counts the chunks and Gemini requests)
#   npm run ingest:eval --workspace server -- --chunking 500/100
# --budget 10000 also scores the first 10,000 characters of results, so chunk sizes compare at equal text (E12).
npm run eval --workspace server -- --chunking 500/100 --budget 10000 --reranker none --label chunks-500

# parent-child: search the small chunks of --chunking, return the bigger chunks of --parent (both must be ingested; E13)
npm run eval --workspace server -- --chunking 500/100 --parent 2000/400 --budget 10000 --reranker none --label parent-child

# score only some questions: ids and ranges in file order (cannot be combined with --save-baseline)
npm run eval --workspace server -- --only q42-q86 --label new-questions

# answer-level check: write real answers (retrieve, then generate), then check refusals and citations
# --dry-run only counts the calls. Answers are cached by prompt, so a stopped run resumes where it stopped.
# One provider only (--provider groq, the default, or gemini). The free tiers limit this hard (E10).
npm run eval:answers --workspace server -- --reranker bge-m3 --only q42-q56 --label dense-bge-m3

# compare against another saved run instead of the baseline
npm run eval --workspace server -- --against eval/runs/<file>.json

# compare any two saved runs
npm run eval:compare --workspace server -- eval/runs/<before>.json eval/runs/<after>.json
```

The comparison shows the new value and the change in points for each metric and cutoff, the MRR per question type, the settings that differ (top-k, margin, chunking), and the questions where the first correct chunk moved up or down:

```
                      top 1      top 3      top 5     top 10
  Hit rate          74% (+4)    92% (0)   100% (0)   100% (0)
  Recall@k          63% (+3)    81% (0)    91% (0)    97% (0)
  ...
  MRR 0.818 -> 0.851 (+0.033)

Questions where the first correct chunk moved up (2):
  q05 rank 4 -> 1  What are the four risks the video sums up for neo cloud stocks?
```

(The numbers above are an illustration, not a real result.)

Things to keep in mind:

- **Change one thing per run.** Each file records the git commit, so you can see which code made it.
- **A run is repeatable.** Two runs with no change give identical numbers, so any difference comes from what you changed.
- **Check the size of the change.** With 78 answerable questions, one question moving is about 1.3 points of hit rate. Trust changes that point the same way across several metrics.
- **Questions must match.** If you add or remove questions, the averages are no longer comparable and the comparison prints a warning. Save a new baseline after changing the question set.

## Checking the labels

A score is only as good as its labels. Before trusting a number, or after editing a question, run the review script from `server/`:

```bash
npx tsx --env-file=../.env scripts/eval-review.ts          # every question
npx tsx --env-file=../.env scripts/eval-review.ts q03 q07  # only these
```

For each question it prints where the answer is and what retrieval returned, with the correct chunks marked:

```
q03 [fact] What share of CoreWeave's revenue comes from its three biggest customers?
  GOLD  DRDI0KApHZw 6:11-6:31
        "three customers made up about 72% of Coreweave's revenue"
  RETRIEVED 5 chunks:
    1 GOLD 0.783 DRDI0KApHZw #7 @6:15
    2 GOLD 0.700 DRDI0KApHZw #6 @5:19
    3      0.699 DRDI0KApHZw #9 @8:05
    ...
  => found 1 of 1 evidence, first correct chunk at rank 1
```

Read it like marking homework: is the quoted sentence really the answer, and did retrieval find it? The script also counts label problems:

- `NOT FOUND`: the quote does not appear in the stored chunks. Fix the quote.
- Said in more than one place: the label is ambiguous. Make the quote more specific.

## Adding or editing a question

1. Add an entry to [questions.json](../server/eval/questions.json) with a new unique `id`.
2. Copy the quote **exactly** from the transcript. Keep it short and self-contained, so it does not straddle a chunk boundary.
3. Run `eval-review.ts` on the new id and confirm there are no label problems.
4. Run the full eval.

The file is validated on load ([questions.ts](../server/src/eval/questions.ts)): ids must be unique, `unanswerable` questions have no evidence, every other question needs evidence, and each evidence video must be one of the question's selected videos.

## Baseline

This is the saved baseline (`server/eval/baseline.json`). Dense search, recursive chunking (1000 characters, 200 overlap), top-k 12, margin 0.12. 78 answerable and 8 unanswerable questions on 12 videos (three short investing and AI-bubble videos, two long ones of 72 and 50 chunks, and seven more: a 75-chunk coding tutorial, two videos about AI harnesses that cover the same topic, three beginner-investing videos and one Hindi video). The pool for a question is 58.2 chunks on average.

|                            | top 1 | top 3 | top 5 | top 10 |
| -------------------------- | ----- | ----- | ----- | ------ |
| Hit rate                   | 69%   | 91%   | 97%   | 100%   |
| Recall@k                   | 64%   | 84%   | 91%   | 98%    |
| Precision@k                | 69%   | 48%   | 34%   | 20%    |
| Best possible precision@k  | 100%  | 68%   | 44%   | 22%    |
| nDCG@k                     | 69%   | 71%   | 75%   | 80%    |
| Random guessing (hit rate) | 6%    | 17%   | 27%   | 46%    |

MRR 0.809. By type (questions in brackets): facts 0.931 (37), lists 0.821 (7), paraphrases 0.772 (16), multi-video 0.643 (9), overview 0.528 (9). The chunks the app really sends to the model (10.5 on average) contain 98% of the evidence.

Earlier baselines, kept for the record:

| Set                            | Questions (answerable) | MRR   | Hit rate at top 5 | Random guessing at top 10 |
| ------------------------------ | ---------------------- | ----- | ----------------- | ------------------------- |
| v1: three short videos         | 25 (23)                | 0.841 | 100%              | 81%                       |
| v2: plus two long videos       | 41 (37)                | 0.818 | 100%              | 62%                       |
| **v3: plus seven more videos** | **86 (78)**            | 0.809 | 97%               | 46%                       |

The v2 baseline file is kept as [baseline-v2-41-questions.json](../server/eval/results/baseline-v2-41-questions.json). Each step made the set harder (more chunks to choose from, so less luck), and hit rate at top 5 is no longer stuck at 100%.

## Limitations

- **The set is bigger but still small.** 78 answerable questions, so one question is 1.3 points of hit rate and differences under about 3 to 5 points are noise. The groups by type are smaller (7 lists, 9 overview, 9 multi-video), so the per-type numbers move a lot with a single question. Hit rate is 100% only at top 10 now, so top 1, top 3, MRR, nDCG and recall are the numbers to compare.
- **The questions were written by reading the transcripts.** That favours wording the transcripts contain. The paraphrase questions try to avoid it, but a set written by someone who has not read the videos would be a fairer test.
- **The Hindi video is a cross-language test.** Two questions ask in English about a Hindi transcript. Dense search can match across languages. The keyword (BM25) tokenizer cannot match English words to Hindi text, and it also removes Hindi vowel marks (it strips accents with the same rule), so for that video a keyword search is both useless and damaged. Known limitation, see EXPERIMENTS.md.
- **Overview labels are a judgement call.** "What is the main argument?" has no single correct passage, so those scores say less than the fact scores.
- **One chunking setup.** The scripts search the `chunks_recursive` collection. Comparing chunking strategies needs a collection per strategy and a way to choose it. The quote labels themselves do not change.
- **Chunk size is not controlled.** Metrics count chunks, and a top 5 of small chunks gives the model less text than a top 5 of large ones. Compare chunking strategies together with the amount of text sent.
- **"No answer" detection by score does not work.** The highest top score among unanswerable questions (0.710) is above the lowest among answerable ones (0.624). Earlier, the highest unanswerable scores came from questions that name the speaker ("Howard Marks", "Andrew Ng"), which matches that video's opening even though the topic (cryptocurrency, quantum computing) is never mentioned.

Results of the experiments run with this eval are in [EXPERIMENTS.md](EXPERIMENTS.md).
