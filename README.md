# YouTube Chat

Chat with one or more YouTube videos using retrieval-augmented generation (RAG).
Paste a URL, build a personal library, select up to 5 videos, and hold a continuous conversation grounded in their transcripts.

> Work in progress. Evaluation results and architecture notes will be added as the project grows.

## Stack

- **Backend:** Node.js, Express, TypeScript, LangChain
- **Vector store:** Qdrant
- **Database:** PostgreSQL with Prisma ORM
- **LLM and embeddings:** Google Gemini
- **Frontend:** React, Vite, Tailwind CSS

## Getting started

Requirements: Node.js 22+, Docker.

```bash
cp .env.example .env        # then fill in GOOGLE_API_KEY
docker compose up -d        # starts Qdrant and PostgreSQL
npm install
npm run db:migrate --workspace server  # creates tables and generates the Prisma client
npm run dev:server
```

## Project plan

See [PLAN.md](PLAN.md).
