#!/usr/bin/env node
/**
 * Drains the queue/ directory into Buffer via its GraphQL API.
 *
 * Each eligible JSON file in queue/ becomes one Buffer post. On success the
 * file is moved to posted/ with the API response appended, so the repo is the
 * source of truth for what has been scheduled.
 *
 * Environment:
 *   BUFFER_API_KEY   required (get one at https://publish.buffer.com/settings/api)
 *   BUFFER_API_URL   optional, defaults to https://api.buffer.com
 *   POST_LIMIT       optional, max posts to create this run (default: all)
 *   DRY_RUN          optional, "1" prints payloads without calling the API
 */

import { readFile, writeFile, readdir, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.join(import.meta.dirname, "..");
const QUEUE_DIR = path.join(ROOT, "queue");
const POSTED_DIR = path.join(ROOT, "posted");
const API_URL = process.env.BUFFER_API_URL || "https://api.buffer.com";
const DRY_RUN = process.env.DRY_RUN === "1";

const CREATE_POST_MUTATION = `
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess {
      post { id status dueAt text channelService }
    }
    ... on MutationError {
      message
    }
  }
}`;

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

async function loadConfig() {
  const raw = await readFile(path.join(ROOT, "buffer.config.json"), "utf8");
  return JSON.parse(raw);
}

/** Build a CreatePostInput from a queue entry + repo config. */
function buildInput(entry, config) {
  const channelKey = entry.channel || config.defaults.channel;
  const channelId = config.channels[channelKey];
  if (!channelId) {
    throw new Error(`unknown channel "${channelKey}" — add it to buffer.config.json`);
  }

  const mode = entry.mode || config.defaults.mode;
  if (mode === "customScheduled" && !entry.dueAt) {
    throw new Error(`mode is customScheduled but no "dueAt" given`);
  }

  const assets = [];
  if (entry.image) {
    assets.push({
      image: {
        url: entry.image.url,
        metadata: { altText: entry.image.altText || entry.text || "Instagram post" },
      },
    });
  }
  if (entry.video) {
    assets.push({
      video: {
        url: entry.video.url,
        ...(entry.video.thumbnailUrl ? { thumbnailUrl: entry.video.thumbnailUrl } : {}),
        ...(entry.video.title ? { metadata: { title: entry.video.title } } : {}),
      },
    });
  }

  const input = {
    channelId,
    text: entry.text || "",
    mode,
    schedulingType: entry.schedulingType || config.defaults.schedulingType,
    assets,
    source: "github-actions",
  };
  if (mode === "customScheduled") input.dueAt = entry.dueAt;
  if (entry.tagIds) input.tagIds = entry.tagIds;

  if (channelKey === "instagram") {
    if (assets.length === 0) {
      throw new Error("Instagram posts require an image or video asset");
    }
    const igType = entry.instagram?.type || config.defaults.instagram.type;
    input.metadata = {
      instagram: {
        type: igType,
        // required by the API; only meaningful for reels
        shouldShareToFeed: entry.instagram?.shouldShareToFeed ?? igType === "reel",
        ...(entry.instagram?.firstComment ? { firstComment: entry.instagram.firstComment } : {}),
        ...(entry.instagram?.link ? { link: entry.instagram.link } : {}),
      },
    };
  }

  return input;
}

async function createPost(input, apiKey) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: CREATE_POST_MUTATION, variables: { input } }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  if (body.errors?.length) {
    throw new Error(`GraphQL error: ${body.errors.map((e) => e.message).join("; ")}`);
  }

  const result = body.data.createPost;
  if (result.__typename !== "PostActionSuccess") {
    const err = new Error(`${result.__typename}: ${result.message}`);
    err.typename = result.__typename;
    throw err;
  }
  return result.post;
}

async function main() {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey && !DRY_RUN) {
    fail("BUFFER_API_KEY is not set (add it as a GitHub Actions secret or export it locally)");
  }

  const config = await loadConfig();
  await mkdir(POSTED_DIR, { recursive: true });

  const files = (await readdir(QUEUE_DIR).catch(() => []))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort();

  if (files.length === 0) {
    console.log("queue is empty — nothing to do");
    return;
  }

  const limit = process.env.POST_LIMIT ? Number(process.env.POST_LIMIT) : Infinity;
  let created = 0;
  let failed = 0;

  for (const file of files) {
    if (created >= limit) break;
    const filePath = path.join(QUEUE_DIR, file);
    const entry = JSON.parse(await readFile(filePath, "utf8"));

    let input;
    try {
      input = buildInput(entry, config);
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      failed++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`[dry-run] ${file} →`, JSON.stringify(input, null, 2));
      created++;
      continue;
    }

    try {
      const post = await createPost(input, apiKey);
      created++;
      console.log(`✓ ${file} → post ${post.id} (${post.status}${post.dueAt ? `, due ${post.dueAt}` : ""})`);
      entry.result = { postId: post.id, status: post.status, dueAt: post.dueAt };
      await writeFile(filePath, JSON.stringify(entry, null, 2) + "\n");
      await rename(filePath, path.join(POSTED_DIR, file));
    } catch (err) {
      // LimitReachedError: plan's scheduled-post cap is full; leave the file
      // queued so the next scheduled run retries after slots free up.
      if (err.typename === "LimitReachedError") {
        console.warn(`… ${file}: ${err.message} — leaving in queue for next run`);
        break;
      }
      console.error(`✗ ${file}: ${err.message}`);
      failed++;
    }
  }

  console.log(`done: ${created} created, ${failed} failed, ${files.length - created - failed} remaining`);
  if (failed > 0) process.exit(1);
}

await main();
