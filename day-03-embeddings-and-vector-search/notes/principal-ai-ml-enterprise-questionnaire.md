# Principal AI/ML Engineer Enterprise Questionnaire

## Context

This questionnaire tests production knowledge for enterprise AI/RAG systems, especially ingestion, embeddings, retrieval, vector databases, queues, caching, monitoring, access control, and evaluation.

## Question 1: Scalability

You currently have this Day 3 setup:

```text
documents
-> chunks
-> embeddings
-> local JSON index
-> manual cosine similarity over every record
```

Now imagine the company grows to:

```text
5 million chunks
500K searches/day
documents updated every few minutes
```

What parts of this design will break first, and how would you redesign it for scale?

### Your Answer

Storage and indexing would break. We need to use blob storage, something like Azure Blob, to store documents. Chunking and embedding need to be async, not on startup.

Horizontal scaling of workers handling chunking and embedding.

Since this will be read-heavy, some kind of caching can be introduced, such as Redis for high retrieval chunks.

### Coaching Notes

- Blob storage is good for raw documents, but retrieval also needs a vector DB/search index for chunks and embeddings.
- Chunking and embedding should run through queue plus workers, with retries and idempotent upserts.
- Redis caching can help, but cache query embeddings, popular retrieval results, or source chunks carefully.
- Cache keys must include access scope and freshness constraints.
- For 5M chunks, manual cosine scanning will not scale. Use ANN indexing through Qdrant, Pinecone, pgvector, OpenSearch, Weaviate, etc.

Production shape:

```text
raw docs -> blob storage
metadata -> relational DB
ingestion events -> queue
workers -> parse/clean/chunk/embed
vectors + metadata -> vector DB
popular query/result cache -> Redis
retrieval API -> app/chat layer
```

## Question 2: Availability

Suppose your embedding provider has a 30-minute outage.

During that outage:

- new documents are still being uploaded
- users are still searching
- the chat app still needs to answer questions

What should happen to ingestion, retrieval, and the user experience?

### Your Answer

Failure of ingestion should go into a dead queue or at least have logs so that it can later be manually inserted if needed.

Retrieval and user search will not be updated until that dead queue is retried.

### Coaching Notes

- New document ingestion should not be lost. Put jobs in a queue and retry with backoff.
- Repeated failures should move to a dead letter queue with enough metadata to replay later.
- Existing retrieval should continue using the last healthy vector index.
- Users may not see newly uploaded documents until ingestion recovers.
- The app should expose freshness carefully, especially for high-risk domains.
- Manual insertion should be rare. Prefer replaying from DLQ after recovery.

Production behavior:

```text
Ingestion degrades, retrieval continues.
Queue buffers new/updated docs.
Workers retry embedding calls with backoff.
Repeated failures go to DLQ.
Search uses last good index.
Freshness metrics and alerts show the index is stale.
After recovery, workers drain backlog and upsert missing chunks.
```

## Question 3: Caching

You want to add Redis caching to reduce latency and cost.

What exactly would you cache in a RAG/retrieval system, and what should you avoid caching?

### Your Answer

Popular searches, which can again be time-based cached results.

### Coaching Notes

Useful cache layers:

- Query embedding cache: `query text -> query embedding`
- Retrieval result cache: `query + filters + user/access scope -> topK chunk IDs`
- Chunk/document cache: `chunk ID -> chunk text + metadata`
- Parsed document cache during ingestion
- LLM response cache, only when safe and permission-aware

Avoid:

- caching results without access-control scope
- caching forever when documents change
- globally caching sensitive user-specific answers
- serving stale chunks after source deletion
- caching only by raw query text when filters matter

Example cache key:

```text
retrieval:v1:user_role=agent:tenant=wmt:type=policy:category=refund:qhash=abc123
```

## Question 4: Monitoring

Your RAG system is live. Users complain: "answers are getting worse this week."

What metrics, logs, or traces would you check first?

### Your Answer

Primary: ingestion embedding model, if anything changed.

Secondary: prompt version, classifier if changed.

### Coaching Notes

Start with what changed, then inspect evidence across the pipeline:

- Ingestion: failed jobs, queue lag, DLQ size, indexed document count, chunk count, duplicate rate, empty chunk rate, last successful ingestion time
- Embedding/index: embedding model version, vector index version, index rebuild date, changed chunking strategy, vector DB latency/errors
- Retrieval quality: Recall@K, hit rate@K, topK score distribution, zero-result rate, metadata filter failures, reranker score changes
- Generation: prompt version, model version, context length, citation rate, groundedness score, hallucination reports
- Routing/classification: classifier version, tool-call rates, intent distribution drift, fallback/error rates
- Product signal: thumbs-down rate, escalation rate, repeated question rate, support correction rate

Investigation flow:

```text
Did ingestion/index freshness break?
Did retrieval quality degrade?
Did prompt/model/reranker change?
Did traffic/query mix change?
Did access filters remove needed context?
Did latency/cost limits truncate context?
```

## Question 5: Access Control

You have policies for public users, store employees, managers, and legal teams.

How would you ensure the RAG system never retrieves or sends restricted chunks to the LLM for the wrong user?

### Your Answer

While ingestion input access level and store it along metadata either in vector DB or separate RDB.

While retrieval, get access level of user in query orchestration layer, and add metadata filtering while retrieval to vector DB.

### Coaching Notes

Correct architecture:

```text
ingestion time -> attach access metadata
retrieval time -> enforce access filter before LLM context
```

Principal-level refinements:

- Store access metadata on every chunk if sections can differ in sensitivity.
- Enforce filters server-side in the retrieval service, not in the frontend.
- Include tenant/org/user scope, not only role.
- Never send restricted chunks to the LLM.
- Log user, query, filters applied, and returned chunk IDs.
- Handle permission changes by updating affected chunks or checking ACL from authoritative DB at retrieval time.
- Cache keys must include access scope.

Example:

```js
vectorDb.search({
  vector: queryEmbedding,
  topK: 5,
  filter: {
    tenant_id: "wmt",
    access_level: { $in: ["public", "employee"] },
    category: "refund",
  },
});
```

## Question 6: Extensibility

Today you use `text-embedding-3-small` and a local JSON index.

Tomorrow leadership asks:

```text
Move to Qdrant now.
Also keep the option to switch to pgvector later.
Also compare text-embedding-3-small vs text-embedding-3-large.
```

How would you design the code so this does not become a messy rewrite?

### Your Answer

Config-driven A/B experimentation, log experiment model along and monitor dashboards for results.

### Coaching Notes

Good experimentation layer. Also add interfaces/adapters:

```text
EmbeddingProvider interface
-> OpenAI small
-> OpenAI large
-> future provider

VectorStore interface
-> LocalJsonVectorStore
-> QdrantVectorStore
-> PgVectorStore
```

Example:

```js
const embeddingProvider = createEmbeddingProvider(config.embedding);
const vectorStore = createVectorStore(config.vectorStore);

const embedding = await embeddingProvider.embed(chunk.text);

await vectorStore.upsert({
  id: chunk.id,
  text: chunk.text,
  embedding,
  metadata: chunk.metadata,
});
```

Also:

- store `embedding_model` on every index/record
- use index namespaces per model/version
- keep migration scripts for rebuilds
- define common filter syntax internally
- run evaluation sets before switching traffic
- use feature flags or traffic splitting for A/B

## Question 7: Evaluation

You changed chunk size from `180 words` to `500 words`.

How would you decide whether that improved or hurt the retrieval system?

### Your Answer

Monitor hit rate, retrieval score, zero-result score.

### Coaching Notes

Good starting signals. Add an offline evaluation set:

```text
query -> expected relevant chunk/source
```

Compare old vs new chunking:

- Recall@K: did the correct chunk appear in top 5/top 10?
- Precision@K: how many retrieved chunks were useful?
- MRR: how high did the first relevant chunk rank?
- Answer groundedness: did the answer use retrieved evidence?
- Context noise: did larger chunks add irrelevant text?
- Latency/cost: did bigger chunks increase tokens and response time?
- User feedback: did thumbs-down/escalations improve or worsen?

Principal answer:

```text
Run A/B or offline eval between 180-word and 500-word chunks.
Compare Recall@K, Precision@K, MRR, latency, token cost, and answer groundedness.
Promote only if quality improves without unacceptable latency/cost.
```

## Question 8: Failure And Replay

An ingestion worker crashes halfway through processing a 200-page policy document.

Some chunks were embedded and upserted. Some were not.

How do you prevent duplicate chunks, partial bad indexes, or inconsistent retrieval?

### Your Answer

No idea.

### Coaching Notes

Use idempotent ingestion and versioned document processing.

Meaning:

```text
same job can run twice
without creating duplicates
or leaving mixed old/new chunks
```

Design:

- Give each document version a stable ID.
- Give each chunk a deterministic ID.
- Upsert by chunk ID, not insert blindly.
- Track job state.
- Use a staging index or staging namespace for large documents.
- Promote the new version only after validation.
- Clean up old versions after successful promotion.

Example chunk IDs:

```text
document_id = refund-policy
version = v3
chunk_id = refund-policy:v3:chunk-001
chunk_id = refund-policy:v3:chunk-002
```

Short principal answer:

```text
Make ingestion idempotent.
Use deterministic chunk IDs.
Upsert instead of insert.
Track job state.
Write new document versions to staging.
Only promote after validation.
Clean up old versions after successful promotion.
```

## Question 9: Data Deletion

A legal team requests deletion of one internal policy from search due to compliance.

What should happen across blob storage, metadata DB, vector DB, caches, and audit logs?

### Your Answer

First remove vector DB with document ID, remove metadata, remove blob storage, monitor logs that it should not be retrieved anymore.

### Coaching Notes

Good systems identified. For compliance, deletion must be ordered, auditable, and cache-aware.

Stronger flow:

```text
receive deletion request
-> mark document as deleted/tombstoned in metadata DB
-> block retrieval immediately using metadata filter
-> delete vector DB chunks by document_id/version
-> purge retrieval/cache entries
-> delete or retain blob according to legal retention policy
-> write audit log
-> verify document no longer appears in retrieval
```

Important:

- do not always delete blob first
- legal retention may require restricted archival, or it may require hard deletion
- delete all chunks derived from the document
- invalidate Redis/result caches
- remove from all search indexes
- verify with test queries
- audit who requested, who approved, when deleted, and systems affected

## Question 10: Final System Design

Design the production architecture for our Day 3 project evolving into enterprise RAG.

Include:

- ingestion
- storage
- vector DB
- queue/workers
- retrieval service
- caching
- monitoring
- access control
- evaluation

Give the architecture in text form. Keep it high-level but production realistic.

### Your Answer

High-level design:

We will have two API endpoints. One will be for ingestion and one will be for retrieval.

For ingestion, upload will call our service through an API gateway, which can check throttling limits and access level. Ideally, the ingestion service should not directly upload the file. It should return a short-lived token for Azure Blob storage or other storage so the user can directly upload there.

Once we have the ingestion API called, we can send that token with the path in the response of the API. Then we can send it to a service worker. We can send it to a Kafka queue. A worker keeps checking the queue, and once it has any item on the queue, it picks the item.

The worker will do chunking of the data from metadata provided in the queue. Then it will clean, dedupe, and embed. Metadata filters can be added during upload time as well. We can ask users to define categories if we do not want to define them ourselves.

Once embedding is created, we send it to the vector DB for upserting. We can scale workers horizontally and the queue so we can handle large traffic.

For monitoring, we can check logs of our message queue, queue lag, and failures.

For retrieval:

We can decide with product which LLM models to use. Same for retrieval DB. We can decide whether we want semantic search or hybrid search, and we will do metadata filtering because of authentication.

Users with UI or actual customers will have a separate API endpoint for retrieval or chat. The retrieval API again goes through API gateway with authentication and authorization.

The retrieval call lands in an orchestration layer. The orchestration layer will orchestrate between different systems and bring authentication and authorization for the user profile so we can have relevant metadata filtering and chunk retrieval.

The final system call goes to vector DB search. For search retrieval, we can choose a model, topK results, and metadata filtering with product input.

For queue and workers, we can rely on built-in logs and create our own logs. In case of failures, we can add retry logic up to max retries. Otherwise, we put the job in a dead queue so once the app is up and running again, it can pick from the dead queue first.

Since we add chunk IDs and document IDs, basically vector ID creation for the chunk, it should be idempotent insert.

For retrieval, we need to monitor the score of results. We need offline test evaluation of our models for topK, Precision@K, MRR, etc. We need to monitor zero-result use cases and spikes so we can modify logic if needed.

We can add a reranker module. For example, we can monitor which documents, queries, or categories people search most. During retrieval, we can have a weighted reranker based on vector DB search score, keyword search, and top results. This can improve retrieval for users.

### Coaching Notes

Strong system-design answer. Covered:

- async ingestion
- blob storage
- queues
- workers
- vector DB upsert
- auth-aware retrieval
- metadata filters
- retries and DLQ
- idempotent chunk IDs
- evaluation
- reranking

Corrections and refinements:

- Use "idempotent", not "item potent".
- Kafka can work, but it is more of an event stream. For job processing with retries/DLQ, teams often use SQS, Pub/Sub, Azure Service Bus, RabbitMQ, BullMQ, or Celery. Kafka needs extra retry/DLQ design.
- "Service worker" can be confused with browser service workers. Say background worker, ingestion worker, or embedding worker.
- Metadata filters are attached to chunks before upsert, then used during retrieval.
- Reranking should prioritize relevance and access-safe context. Popularity can help but should not dominate.

Add metadata DB:

```text
metadata DB
-> document_id
-> owner
-> access policy
-> blob path
-> ingestion status
-> version
-> created_at / updated_at
-> chunk count
```

Add retrieval service boundary:

```text
Retrieval Service
-> embeds query
-> applies ACL filters
-> searches vector DB / keyword index
-> reranks
-> returns selected chunks + scores + sources
```

Add cache carefully:

```text
Redis cache
-> query embedding cache
-> retrieval result cache by query + filters + access scope
-> chunk text cache by chunk ID
```

Add observability:

```text
ingestion:
queue lag, job failures, DLQ count, embedding latency/cost, indexed chunk count

retrieval:
p50/p95 latency, zero-result rate, Recall@K eval, score distribution, reranker latency

generation:
citation rate, groundedness, escalation/thumbs-down rate
```

Add blue/green index rebuild:

```text
old index active
-> build new index in parallel
-> run evaluation
-> switch alias to new index
-> rollback if bad
```

Stronger final architecture:

```text
Ingestion path:
Client
-> API Gateway
-> Ingestion API
-> Metadata DB creates document record
-> API returns short-lived blob upload URL
-> Client uploads file to Blob Storage
-> Blob event / ingestion API publishes job
-> Queue
-> Parser/Cleaner/Chunker workers
-> Embedding workers
-> Validation
-> Vector DB upsert
-> Metadata DB marks document indexed
-> Monitoring + DLQ + audit logs
```

```text
Retrieval/chat path:
Client
-> API Gateway
-> Chat/Retrieval API
-> Auth/Profile/ACL lookup
-> Query embedding cache or embedding provider
-> Retrieval service
-> Vector DB semantic search + metadata filters
-> Optional keyword/BM25 search
-> Merge/rerank results
-> Fetch chunk text/sources
-> LLM orchestration
-> Answer with citations
-> Logs, traces, feedback, eval pipeline
```

Interview score: around 7.5/10 to 8/10.

To push it to 9/10:

- add metadata DB as lifecycle source of truth
- enforce ACL before LLM context
- include access scope in cache keys
- add blue/green index rebuilds
- define clearer monitoring metrics
- add explicit retrieval service abstraction
- add evaluation gates before promoting chunk/model/index changes

