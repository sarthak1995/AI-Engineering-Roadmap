import fs from "node:fs/promises";
import path from "node:path";

const EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
const DOCS_DIR = path.resolve("data", "docs");
const ISSUES_DIR = path.resolve("data", "issues");
const INDEX_PATH = path.resolve("data", "indexes", "semantic-index.json");
const CHUNK_WORDS = 180;
const CHUNK_OVERLAP = 35;
const DEFAULT_LIMIT = 5;

class EmbeddingsClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async embed(input, model) {
    const response = await fetch(EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embeddings error ${response.status}: ${body.slice(0, 800)}`);
    }

    const data = await response.json();
    return data.data.map((item) => item.embedding);
  }
}

function usage() {
  console.log(`
Day 3 Semantic Search

Commands:
  node src/semantic_search.js index
  node src/semantic_search.js search "missing grocery order charged already"
  node src/semantic_search.js search "refund still missing" --category refund --type issue
  node src/semantic_search.js --self-test

Environment:
  OPENAI_API_KEY                 Required for index/search.
  OPENAI_EMBEDDING_MODEL         Optional. Default: ${DEFAULT_EMBEDDING_MODEL}
`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it before indexing or searching.`);
  }
  return value;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    limit: DEFAULT_LIMIT,
    category: null,
    type: null,
  };
  const queryParts = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === "--limit") {
      options.limit = Number.parseInt(rest[index + 1], 10);
      index += 1;
    } else if (value === "--category") {
      options.category = rest[index + 1];
      index += 1;
    } else if (value === "--type") {
      options.type = rest[index + 1];
      index += 1;
    } else {
      queryParts.push(value);
    }
  }

  if (!Number.isInteger(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive integer.");
  }

  return {
    command,
    query: queryParts.join(" ").trim(),
    options,
  };
}

async function readMarkdownDocs() {
  const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });
  const docs = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const sourcePath = path.join(DOCS_DIR, entry.name);
    const text = await fs.readFile(sourcePath, "utf8");
    docs.push({
      id: `policy:${entry.name}`,
      type: "policy",
      title: titleFromMarkdown(text, entry.name),
      category: categoryFromFilename(entry.name),
      source_path: path.relative(process.cwd(), sourcePath),
      text,
    });
  }

  return docs;
}

async function readIssueDocs() {
  const entries = await fs.readdir(ISSUES_DIR, { withFileTypes: true });
  const docs = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const sourcePath = path.join(ISSUES_DIR, entry.name);
    const issue = JSON.parse(await fs.readFile(sourcePath, "utf8"));
    docs.push({
      id: `issue:${issue.issue_id}`,
      type: "issue",
      title: issue.issue_id,
      category: issue.category ?? "other",
      urgency: issue.urgency ?? "low",
      source_path: path.relative(process.cwd(), sourcePath),
      text: issueToSearchText(issue),
    });
  }

  return docs;
}

function titleFromMarkdown(text, fallback) {
  const firstHeading = text.split("\n").find((line) => line.startsWith("# "));
  return firstHeading ? firstHeading.replace(/^#\s+/, "").trim() : fallback;
}

function categoryFromFilename(filename) {
  if (filename.includes("delivery")) return "delivery";
  if (filename.includes("payment") || filename.includes("refund")) return "refund";
  if (filename.includes("account")) return "account";
  if (filename.includes("product")) return "product_quality";
  if (filename.includes("store")) return "store_experience";
  return "other";
}

function issueToSearchText(issue) {
  return [
    `Issue id: ${issue.issue_id}`,
    `Category: ${issue.category}`,
    `Urgency: ${issue.urgency}`,
    `Customer issue: ${issue.customer_issue}`,
    `Summary: ${issue.summary}`,
    `Suggested response: ${issue.suggested_response}`,
    issue.policy
      ? `Policy reason: ${issue.policy.enforcement_reason ?? ""}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function chunkDocument(doc) {
  const words = doc.text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const chunks = [];
  const step = Math.max(1, CHUNK_WORDS - CHUNK_OVERLAP);

  for (let start = 0; start < words.length; start += step) {
    const chunkWords = words.slice(start, start + CHUNK_WORDS);
    chunks.push({
      id: `${doc.id}#chunk-${chunks.length + 1}`,
      document_id: doc.id,
      chunk_index: chunks.length + 1,
      title: doc.title,
      type: doc.type,
      category: doc.category,
      urgency: doc.urgency ?? null,
      source_path: doc.source_path,
      text: chunkWords.join(" "),
    });
    if (start + CHUNK_WORDS >= words.length) break;
  }

  return chunks;
}

async function buildIndex() {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const client = new EmbeddingsClient(apiKey);
  const docs = [...(await readMarkdownDocs()), ...(await readIssueDocs())];
  const chunks = docs.flatMap(chunkDocument);
  const embeddings = await client.embed(chunks.map((chunk) => chunk.text), model);
  const records = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));

  await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await fs.writeFile(
    INDEX_PATH,
    JSON.stringify(
      {
        created_at: new Date().toISOString(),
        embedding_model: model,
        chunk_count: records.length,
        records,
      },
      null,
      2,
    ),
  );

  console.log(`Indexed ${records.length} chunks from ${docs.length} documents.`);
  console.log(`Wrote ${path.relative(process.cwd(), INDEX_PATH)}`);
}

async function searchIndex(query, options) {
  if (!query) throw new Error("Search query is required.");

  const apiKey = requireEnv("OPENAI_API_KEY");
  const index = JSON.parse(await fs.readFile(INDEX_PATH, "utf8"));
  const client = new EmbeddingsClient(apiKey);
  const [queryEmbedding] = await client.embed([query], index.embedding_model);
  const results = rankRecords(query, queryEmbedding, index.records, options);

  for (const [index, result] of results.entries()) {
    console.log(`\n${index + 1}. ${result.title}`);
    console.log(`   score: ${result.score.toFixed(3)} | type: ${result.type} | category: ${result.category}`);
    if (result.urgency) console.log(`   urgency: ${result.urgency}`);
    console.log(`   source: ${result.source_path}`);
    console.log(`   text: ${result.text.slice(0, 320)}${result.text.length > 320 ? "..." : ""}`);
  }
}

function rankRecords(query, queryEmbedding, records, options) {
  const filtered = records.filter((record) => {
    if (options.category && record.category !== options.category) return false;
    if (options.type && record.type !== options.type) return false;
    return true;
  });

  return filtered
    .map((record) => {
      const vectorScore = cosineSimilarity(queryEmbedding, record.embedding);
      const keywordScore = keywordOverlap(query, record.text);
      return {
        ...record,
        score: vectorScore * 0.85 + keywordScore * 0.15,
        vector_score: vectorScore,
        keyword_score: keywordScore,
      };
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, options.limit);
}

function cosineSimilarity(first, second) {
  let dot = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (let index = 0; index < first.length; index += 1) {
    dot += first[index] * second[index];
    firstMagnitude += first[index] ** 2;
    secondMagnitude += second[index] ** 2;
  }

  if (firstMagnitude === 0 || secondMagnitude === 0) return 0;
  return dot / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude));
}

function keywordOverlap(query, text) {
  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0) return 0;
  const textTerms = new Set(tokenize(text));
  let matches = 0;

  for (const term of queryTerms) {
    if (textTerms.has(term)) matches += 1;
  }

  return matches / queryTerms.size;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2) ?? [];
}

async function runSelfTest() {
  const records = [
    {
      title: "Delivery Support Policy",
      type: "policy",
      category: "delivery",
      text: "missing grocery order marked delivered customer charged urgent delivery",
      embedding: [0.9, 0.1, 0],
    },
    {
      title: "Account Security Policy",
      type: "policy",
      category: "account",
      text: "account takeover password suspicious unauthorized access",
      embedding: [0.1, 0.9, 0],
    },
  ];
  const results = rankRecords("missing grocery delivery", [1, 0, 0], records, {
    limit: 1,
    category: null,
    type: null,
  });

  if (results[0]?.title !== "Delivery Support Policy") {
    throw new Error("Self-test failed: delivery policy should rank first.");
  }

  console.log("Self-test passed: chunk ranking, cosine similarity, and keyword blending work.");
}

async function main() {
  const { command, query, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "--help" || command === "-h") {
    usage();
  } else if (command === "--self-test") {
    await runSelfTest();
  } else if (command === "index") {
    await buildIndex();
  } else if (command === "search") {
    await searchIndex(query, options);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
