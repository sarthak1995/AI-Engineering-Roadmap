# 2-Week AI Enterprise Engineering Roadmap

This roadmap is for a total beginner who wants to understand how AI systems are built, deployed, monitored, and governed in enterprise environments.

The goal after two weeks is not mastery. The goal is to understand the major architectures, know the tooling landscape, and build one small enterprise-style AI application.

## Core Mental Model

Enterprise AI engineering is not just calling an LLM API. A production system usually looks like this:

```text
User / App
  -> API Gateway / Auth
  -> AI Gateway / Model Router
  -> Orchestration Layer
  -> Tools / RAG / Agents
  -> Model Provider or Self-hosted Model
  -> Observability, Evaluation, Security, Cost Controls
  -> Feedback Loop
```

Important areas to learn:

| Area | What It Means |
|---|---|
| LLM APIs | Calling OpenAI, Anthropic, Gemini, Bedrock, Azure OpenAI |
| Prompt engineering | System prompts, few-shot examples, structured output |
| RAG | Connecting LLMs to enterprise documents and databases |
| Agents | LLMs using tools, APIs, memory, and workflows |
| AI gateways | Routing, rate limits, budgets, logging, fallbacks |
| Model serving | Hosting open-source models with vLLM, Ray Serve, KServe |
| Evaluation | Measuring hallucination, retrieval quality, correctness |
| Observability | Logs, traces, latency, cost, token usage |
| Security | PII, access control, prompt injection, data isolation |
| MLOps / LLMOps | Versioning prompts, datasets, models, deployments |

Useful docs to revisit:

- LiteLLM: https://docs.litellm.ai/docs/
- LangChain: https://docs.langchain.com/oss/python/langchain/overview
- LlamaIndex: https://developers.llamaindex.ai/python/framework/
- vLLM: https://docs.vllm.ai/
- Ray Serve: https://docs.ray.io/en/latest/serve/index.html
- KServe: https://www.kubeflow.org/docs/components/kserve/
- OpenTelemetry: https://opentelemetry.io/docs/what-is-opentelemetry/
- Ragas: https://docs.ragas.io/en/stable/

## Week 1: Foundations And App Architecture

### Day 1: AI Engineering Basics

Learn:

- What is an LLM?
- Tokens, context windows, embeddings
- Chat completion APIs
- System/user/assistant messages
- Temperature, max tokens, streaming
- JSON / structured output
- Function calling / tool calling

Build:

- A simple Python script that calls an LLM.
- Add streaming output.
- Add structured JSON output.

Tools:

- OpenAI / Anthropic / Gemini / Azure OpenAI
- Python
- FastAPI basics

### Day 2: Prompting And Reliability

Learn:

- System prompts
- Few-shot prompting
- Chain-of-thought vs hidden reasoning
- Output schemas
- Retry strategies
- Prompt versioning
- Prompt injection basics

Build:

- A support ticket classifier that returns:
  - category
  - urgency
  - summary
  - suggested response

Enterprise concept:

- Prompts are production assets. They need versioning, testing, review, and monitoring.

### Day 3: Embeddings And Vector Search

Learn:

- Embeddings
- Semantic search
- Chunking
- Vector databases
- Metadata filtering
- Hybrid search: keyword + vector
- Reranking

Frameworks and databases to know:

- FAISS
- Chroma
- Pinecone
- Weaviate
- Milvus
- Qdrant
- Elasticsearch / OpenSearch vector search
- pgvector

Build:

- Upload 5-10 documents.
- Chunk them.
- Embed them.
- Search by semantic similarity.

### Day 4: RAG Architecture

Learn the standard RAG pipeline:

```text
Documents
  -> Load
  -> Clean
  -> Chunk
  -> Embed
  -> Store in Vector DB
  -> Retrieve
  -> Rerank
  -> Build Prompt
  -> Generate Answer
  -> Cite Sources
```

Learn variants:

- Naive RAG
- Hybrid RAG
- Reranked RAG
- Parent-child chunk retrieval
- Multi-query retrieval
- Graph RAG
- Agentic RAG
- Corrective RAG
- Self-query retrieval

Build:

- A small company handbook Q&A bot.
- It must answer only from documents.
- It must cite sources.
- It must say "I don't know" when context is missing.

### Day 5: LangChain And LlamaIndex

Learn:

- Why frameworks exist
- Chains
- Retrievers
- Tools
- Agents
- Memory
- Document loaders
- Vector store integrations

Compare:

| Framework | Best For |
|---|---|
| LangChain | General LLM apps, agents, chains |
| LangGraph | Stateful, multi-step, durable agents |
| LlamaIndex | RAG-heavy apps, document indexing, retrieval |
| Haystack | Search/RAG pipelines |
| Semantic Kernel | Microsoft ecosystem, enterprise orchestration |
| DSPy | Optimizing prompts/programs systematically |

Build:

- Rebuild your RAG app once with LangChain or LlamaIndex.
- Keep the architecture simple.

### Day 6: Agents And Tool Use

Learn:

- What agents are
- Tool calling
- Planning
- ReAct pattern
- Router agents
- Multi-agent workflows
- Human-in-the-loop approvals
- Agent memory
- Agent failure modes

Architectures:

```text
Single Agent:
User -> Agent -> Tools -> Answer
```

```text
Workflow Agent:
User -> Planner -> Tool Executor -> Verifier -> Final Answer
```

```text
Multi-Agent:
User -> Supervisor -> Specialist Agents -> Synthesizer
```

Build:

- An agent that can:
  - search documents
  - call a calculator
  - create a ticket payload
  - ask for clarification when needed

Important warning:

- In enterprise systems, prefer controlled workflows over fully autonomous agents at first.

### Day 7: Build A Mini Enterprise AI App

Build one complete beginner project:

**Internal Policy Assistant**

Features:

- FastAPI backend
- `/chat` endpoint
- RAG over policy documents
- Source citations
- Basic auth mock
- Logging of:
  - question
  - retrieved chunks
  - model used
  - latency
  - token usage
- Refusal when answer is not in docs

Architecture:

```text
Frontend / API Client
  -> FastAPI
  -> Retriever
  -> Vector DB
  -> Prompt Builder
  -> LLM
  -> Response + Sources
  -> Logs
```

## Week 2: Enterprise Deployment, Governance, And Scale

### Day 8: AI Gateways

Learn why enterprises use gateways:

- Central model access
- API key management
- Rate limits
- Cost tracking
- Provider routing
- Fallback models
- Audit logs
- Guardrails
- Caching
- Team budgets

Tools:

- LiteLLM
- Portkey
- Kong AI Gateway
- AWS Bedrock gateway patterns
- Azure API Management
- OpenRouter-style routing
- Custom gateway with FastAPI

Architecture:

```text
Apps
  -> AI Gateway
  -> Policy Engine
  -> Model Router
  -> OpenAI / Anthropic / Bedrock / Azure / Local vLLM
```

Build:

- Put LiteLLM in front of your app.
- Route requests through a local gateway endpoint.
- Add fallback from one model to another.

### Day 9: Model Serving And Deployment

Learn deployment options:

| Deployment Type | Example |
|---|---|
| API model | OpenAI, Anthropic, Gemini |
| Cloud managed | Azure OpenAI, Bedrock, Vertex AI |
| Self-hosted inference | vLLM, TGI, SGLang, Ollama |
| Kubernetes serving | KServe, Ray Serve, BentoML, Seldon |
| Edge/local | llama.cpp, Ollama |

Learn:

- GPU basics
- Batching
- Quantization
- Latency vs throughput
- Autoscaling
- Cold starts
- Model replicas
- Load balancing

Tools:

- vLLM
- Hugging Face TGI
- Ray Serve
- KServe
- BentoML
- Triton Inference Server
- SGLang
- llama.cpp / Ollama

### Day 10: Observability And Monitoring

Learn:

- Logs
- Metrics
- Traces
- Token usage
- Cost per request
- Latency
- Error rates
- Retrieval quality
- User feedback
- Model drift
- Prompt regressions

Tools:

- OpenTelemetry
- Prometheus
- Grafana
- Langfuse
- LangSmith
- Arize Phoenix
- Helicone
- MLflow Tracing
- Weights & Biases

Build:

- Add request IDs.
- Log latency and token usage.
- Track retrieved documents.
- Add thumbs-up/thumbs-down feedback.

### Day 11: Evaluation And Testing

Learn evaluation types:

| Eval Type | Measures |
|---|---|
| Unit tests | Prompt/output format stability |
| Retrieval eval | Did we retrieve the right chunks? |
| Answer eval | Is answer correct and grounded? |
| Safety eval | PII, toxicity, jailbreak resistance |
| Regression eval | Did new prompt/model break old behavior? |
| Human eval | Expert review |

Tools:

- Ragas
- DeepEval
- Promptfoo
- OpenAI Evals
- LangSmith
- Arize Phoenix
- MLflow
- TruLens

Build:

- Create 20 test questions for your RAG app.
- For each, store expected source document.
- Measure:
  - answer correctness
  - source correctness
  - hallucination rate

### Day 12: Security, Compliance, And Governance

Learn:

- Authentication
- Authorization
- RBAC
- Tenant isolation
- PII detection
- Data retention
- Audit logs
- Prompt injection
- Data exfiltration
- Secrets management
- Model access policies
- Human approval workflows

Enterprise pattern:

```text
User Query
  -> Auth
  -> Permission Filter
  -> RAG Retriever with ACLs
  -> PII Redaction
  -> LLM
  -> Output Guardrail
  -> Audit Log
```

Important concepts:

- Never retrieve documents the user is not allowed to see.
- Do not rely on the LLM for access control.
- Put permissions before retrieval.
- Log enough for audit, but avoid storing sensitive prompts unnecessarily.

### Day 13: LLMOps And Production Architecture

Learn:

- CI/CD for AI apps
- Prompt registry
- Model registry
- Dataset versioning
- Evaluation gates
- Canary deployments
- A/B testing
- Rollbacks
- Cost budgets
- Incident response

Tools:

- MLflow
- DVC
- GitHub Actions
- ArgoCD
- Kubernetes
- Docker
- Terraform
- LangSmith
- Langfuse
- Weights & Biases

Production architecture:

```text
Client App
  -> API Gateway
  -> Auth Service
  -> AI Gateway
  -> Orchestrator
  -> RAG Service
  -> Vector DB
  -> Model Provider / vLLM
  -> Observability
  -> Evaluation Pipeline
  -> Feedback Store
```

### Day 14: Final Capstone

Build and document this:

**Enterprise RAG Assistant**

Minimum features:

- FastAPI backend
- RAG over internal docs
- Vector DB
- LLM gateway
- Source citations
- Auth mock
- Logging
- Evaluation dataset
- Basic dashboard or logs
- Dockerfile
- README architecture diagram

Stretch features:

- LiteLLM gateway
- Langfuse or LangSmith tracing
- Ragas evaluation
- Guardrail for PII
- Multi-model fallback
- Admin config for model choice
- Deploy locally with Docker Compose

Final architecture:

```text
User
  -> Web / API Client
  -> FastAPI App
  -> Auth + Tenant Check
  -> LiteLLM Gateway
  -> RAG Orchestrator
  -> Vector DB
  -> LLM Provider / vLLM
  -> Guardrails
  -> Observability
  -> Evaluation + Feedback
```

## Frameworks To Know

### Application Frameworks

- LangChain
- LangGraph
- LlamaIndex
- Haystack
- Semantic Kernel
- DSPy

### Model APIs

- OpenAI
- Anthropic
- Google Gemini
- Azure OpenAI
- AWS Bedrock
- Vertex AI
- Cohere
- Mistral

### Vector Databases

- Pinecone
- Weaviate
- Milvus
- Qdrant
- Chroma
- FAISS
- pgvector
- Elasticsearch / OpenSearch

### Serving And Deployment

- vLLM
- Ray Serve
- KServe
- BentoML
- Hugging Face TGI
- Triton
- Seldon
- Docker
- Kubernetes

### Gateways

- LiteLLM
- Portkey
- Kong AI Gateway
- Azure API Management
- AWS API Gateway
- NGINX / Envoy-based custom gateway

### Evaluation And Observability

- Ragas
- DeepEval
- Promptfoo
- LangSmith
- Langfuse
- Arize Phoenix
- MLflow
- OpenTelemetry
- Prometheus
- Grafana

### Guardrails And Safety

- Guardrails AI
- NeMo Guardrails
- Llama Guard
- Presidio
- Lakera
- Prompt injection filters
- Custom policy engine

## Beginner Priority Order

If you only have two weeks, prioritize this order:

1. Python + FastAPI basics
2. LLM API calls
3. Prompting and structured output
4. Embeddings and vector search
5. RAG architecture
6. LangChain or LlamaIndex
7. AI gateway basics with LiteLLM
8. Observability and evaluation
9. Security and access control
10. Deployment with Docker

Do not start with fine-tuning. For most enterprise use cases, RAG + tools + good evaluation gets you further faster.

Best final outcome: one working enterprise-style RAG app, one architecture diagram, one evaluation file, and one short README explaining how you would deploy it in production.
