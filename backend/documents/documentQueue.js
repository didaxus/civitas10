const { Queue, Worker } = require("bullmq");
const { createRedisConnection, getBullMqPrefix } = require("../queues/config");

const QUEUE_NAME = "document_generation";
const jobId = (operationId) => `document-generation-${operationId}`;

function createDocumentProducer({ connection = createRedisConnection() } = {}) {
  const queue = new Queue(QUEUE_NAME, { connection, prefix: getBullMqPrefix(), defaultJobOptions: {
    attempts: Number(process.env.DOCUMENT_JOB_ATTEMPTS || 3),
    backoff: { type: "exponential", delay: Number(process.env.DOCUMENT_JOB_BACKOFF_MS || 1000) },
    removeOnComplete: 1000, removeOnFail: 5000,
  } });
  return { queue, async enqueue(operation) { return queue.add("documents.generate", { operationId: operation.id, organizationId: operation.organizationId }, { jobId: jobId(operation.id) }); } };
}

function createDocumentWorker({ service, render, connection = createRedisConnection(), workerId = `documents-${process.pid}` }) {
  if (!service || !render) throw new Error("service and render are required");
  const worker = new Worker(QUEUE_NAME, async (job) => service.runGeneration({ ...job.data, render, workerId }), {
    connection, prefix: getBullMqPrefix(), concurrency: Number(process.env.DOCUMENT_WORKER_CONCURRENCY || 2),
  });
  // BullMQ will recover stalled locks; the persisted claim makes execution idempotent after a process crash.
  worker.on("failed", (job, error) => console.warn(JSON.stringify({ component: "document-worker", operationId: job?.data?.operationId, state: "failed", attempts: job?.attemptsMade, errorCode: error.code || "document_generation_failed" })));
  return worker;
}

async function recoverDocumentOperations({ repository, producer, staleAfterMs = 60_000, clock = () => new Date() }) {
  const stale = await repository.recoverStale(new Date(clock().getTime() - staleAfterMs));
  await Promise.all(stale.map((operation) => producer.enqueue(operation)));
  return stale.map((operation) => operation.id);
}

module.exports = { QUEUE_NAME, createDocumentProducer, createDocumentWorker, jobId, recoverDocumentOperations };
