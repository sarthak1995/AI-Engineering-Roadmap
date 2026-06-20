# Day 3 Notes: Embeddings, Semantic Search, Chunking

## 1. Embeddings

- Embeddings turn text into vectors of numbers.
- Similar meaning usually means similar vectors.
- Use them for search, clustering, recommendations, and RAG.
- Different models can give different quality, speed, cost, and language support.
- Example:
```js
const a = "refund for missing order";
const b = "I was charged but the package never arrived";
const embeddingA = [0.12, -0.44, 0.08, 0.91];
const embeddingB = [0.10, -0.40, 0.11, 0.88];
// embeddingA and embeddingB are close in vector space
```

## 2. Semantic Search

- Semantic search finds results by meaning.
- Keyword search finds exact or near-exact words.
- Semantic search is better when users phrase the same idea differently.
- Keyword search is better when exact terms, IDs, or names matter.

## 3. Chunking

- Chunking means splitting long text into smaller pieces before embedding.
- It is needed because long docs are harder to search and retrieve well as one block.
- Good chunks keep one idea together and have a reasonable size.
- Bad chunks are too large, too small, or cut meaning in the middle.
- Metadata helps label chunks with source, type, category, date, or section.
- Good metadata makes filtered search and later retrieval much easier.
- Example:
```js
const chunk = {
  text: "Refunds are processed within 5-7 business days.",
  embedding: [0.14, -0.39, 0.07, 0.89],
  metadata: {
    source: "refund-policy.md",
    type: "policy",
    section: "refunds",
  },
};

const query = {
  text: "when will I get my refund?",
  embedding: [0.13, -0.41, 0.09, 0.87],
};

// Search can filter by metadata like:
// type === "policy" && section === "refunds"
```

## 4. Vector Database

- A normal DB retrieves rows by exact values, filters, joins, and indexes.
- A vector DB retrieves records by vector similarity.
- Normal DB question: `category = "refund"`.
- Vector DB question: `which chunks are closest in meaning to this query?`
- It stores text chunks, embeddings, metadata, and source references.

```js
// Record stored in a vector DB
const vectorRecord = {
  id: "refund-policy:chunk-01",
  text: "Refunds are processed within 5-7 business days.",
  embedding: [0.14, -0.39, 0.07, 0.89],
  metadata: {
    source: "refund-policy.md",
    type: "policy",
    section: "refunds",
  },
};
```

```js
// Pseudo-code retrieval flow
const userQuery = "how long does a refund take?";

const queryEmbedding = embed(userQuery);

const results = vectorDb.search({
  vector: queryEmbedding,
  topK: 3,
  filter: {
    type: "policy",
  },
});

// results are the closest matching chunks
```

Sample flow:

```text
documents
-> split into chunks
-> create embeddings
-> store chunks + embeddings + metadata in vector DB
-> embed user query
-> retrieve nearest chunks
-> send chunks to LLM as context
```

## 5. Retrieval Types

- Keyword retrieval: finds exact words or terms.
- Semantic retrieval: finds chunks closest to the query embedding.
- Metadata-filtered retrieval: searches only matching metadata first.
- Hybrid retrieval: combines keyword + semantic search.
- Reranked retrieval: retrieves candidates, then reorders them with a stronger model.
- Parent-child retrieval: retrieves small chunks, then returns the larger parent section.

```js
// Keyword retrieval
db.searchText("refund timeline");

// Semantic retrieval
vectorDb.search({ vector: embed("when will my money come back?"), topK: 5 });

// Metadata-filtered retrieval
vectorDb.search({
  vector: embed("refund delay"),
  filter: { type: "policy", section: "refunds" },
});

// Hybrid retrieval
hybridSearch({
  keyword: "refund",
  vector: embed("money not returned yet"),
});

// Reranked retrieval
const candidates = vectorDb.search({ vector: embed("late refund"), topK: 20 });
const bestResults = rerank("late refund", candidates).slice(0, 5);
```
