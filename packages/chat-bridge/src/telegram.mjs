#!/usr/bin/env node
// 承認ゲートの通知 + ボタン承認ブリッジ（Telegram / v0）。
// 契約: docs/contract-2026-08-12-chat-approval-v0.md
//
// 設計上の要点:
//   - decisions.json を直接書かない。report-helper の HTTP API 経由でのみ更新する
//   - ポートを listen しない。送受信とも outbound（long polling）のみ
//   - 受け付けるのは登録済み chat ID からの、閉じた集合の callback_data だけ

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { credentialsPaths, readCredentials } from "../../creator-root/src/index.mjs";

import {
  ACTIONS,
  CHAT_ENV_KEY,
  TOKEN_ENV_KEY,
  buildKeyboard,
  redactToken,
  selectActions,
} from "./telegram-core.mjs";

const MAX_PHOTOS = 6;
const POLL_TIMEOUT_SECONDS = 25;

function usage() {
  return `Usage:
  node packages/chat-bridge/src/telegram.mjs --helper <URL> [options]

Required:
  --helper <URL>        report-helper base URL (for example http://127.0.0.1:8791)

Options:
  --report-url <URL>    URL for the "Open report" button (tailnet-only URL)
  --title <text>        Heading (default: Please approve)
  --summary <text>      Short summary
  --photo <path>        Image to attach (repeatable, up to ${MAX_PHOTOS})
  --max-wait <seconds>  How long to wait for approval (default 3600)
  --notify-only         Send the notice and exit without waiting

Credentials are read from ~/.akari/credentials.env (mode 600). Older locations are still read.
  ${TOKEN_ENV_KEY}=...   Token from BotFather
  ${CHAT_ENV_KEY}=...    Chat id to notify (responses from any other id are dropped)`;
}

function parseArguments(argv) {
  const options = {
    helper: null,
    reportUrl: null,
    title: "Please approve",
    summary: null,
    photos: [],
    maxWaitSeconds: 3600,
    notifyOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      index += 1;
      return value;
    };

    switch (flag) {
      case "--helper": options.helper = next(); break;
      case "--report-url": options.reportUrl = next(); break;
      case "--title": options.title = next(); break;
      case "--summary": options.summary = next(); break;
      case "--photo": options.photos.push(next()); break;
      case "--max-wait": options.maxWaitSeconds = Number(next()); break;
      case "--notify-only": options.notifyOnly = true; break;
      case "--help": case "-h": console.log(usage()); process.exit(0); break;
      default: throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (options.helper === null) throw new Error("--helper is required");
  if (!Number.isFinite(options.maxWaitSeconds) || options.maxWaitSeconds <= 0) {
    throw new Error("--max-wait must be a number of seconds greater than 0");
  }
  if (options.photos.length > MAX_PHOTOS) {
    throw new Error(`--photo accepts at most ${MAX_PHOTOS} images`);
  }

  options.helper = options.helper.replace(/\/+$/, "");
  return options;
}

async function loadCredentials() {
  const path = credentialsPaths().primary;
  const state = readCredentials();
  if (!state.primaryExists && !state.legacyExists) {
    throw new Error(
      `credentials.env is missing: ${path}\n` +
        `Create it with mode 600 and add ${TOKEN_ENV_KEY} and ${CHAT_ENV_KEY}, one per line.`,
    );
  }

  const mode = (state.primaryExists ? state.primaryMode : state.legacyMode).toString(8).padStart(3, "0");
  if (mode !== "600") {
    console.warn(`Warning: credentials.env is not mode 600 (now ${mode}). chmod 600 ${path}`);
  }

  const token = state.values.get(TOKEN_ENV_KEY) ?? null;
  const chatId = state.values.get(CHAT_ENV_KEY) ?? null;
  if (token === null) throw new Error(`${TOKEN_ENV_KEY} is missing from credentials.env: ${path}`);
  if (chatId === null) throw new Error(`${CHAT_ENV_KEY} is missing from credentials.env: ${path}`);
  return { token, chatId };
}

function apiUrl(token, method) {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function callApi(token, method, payload, { isForm = false } = {}) {
  let response;
  try {
    response = await fetch(apiUrl(token, method), {
      method: "POST",
      ...(isForm ? { body: payload } : {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    });
  } catch (error) {
    throw new Error(`Telegram API call failed (${method}): ${redactToken(error.message, token)}`);
  }

  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* 非 JSON はそのまま扱う */ }

  if (!response.ok || parsed?.ok !== true) {
    const detail = parsed?.description ?? text.slice(0, 300);
    throw new Error(`Telegram API returned an error (${method}): ${redactToken(detail, token)}`);
  }

  return parsed.result;
}

async function sendPhotos(token, chatId, photos) {
  for (const photoPath of photos) {
    let bytes;
    try {
      bytes = await readFile(photoPath);
    } catch {
      console.warn(`Warning: could not read the image, skipping send: ${photoPath}`);
      continue;
    }

    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("photo", new Blob([bytes]), basename(photoPath));
    await callApi(token, "sendPhoto", form, { isForm: true });
  }
}

function composeText(options) {
  const lines = [`🎬 ${options.title}`];
  if (options.summary !== null && options.summary !== "") lines.push("", options.summary);
  return lines.join("\n");
}

async function commitViaHelper(helper) {
  const response = await fetch(`${helper}/api/commit`, { method: "POST" });
  const body = await response.text();

  if (response.status === 409) return { ok: false, reason: "already-committed" };
  if (!response.ok) return { ok: false, reason: `helper-${response.status}: ${body.slice(0, 200)}` };
  return { ok: true };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { token, chatId } = await loadCredentials();

  await sendPhotos(token, chatId, options.photos);

  const sent = await callApi(token, "sendMessage", {
    chat_id: chatId,
    text: composeText(options),
    disable_web_page_preview: true,
    reply_markup: buildKeyboard(options.reportUrl),
  });

  console.log(`Sent the notice (message_id: ${sent?.message_id ?? "?"})`);
  if (options.notifyOnly) return;

  const seen = new Set();
  const deadline = Date.now() + options.maxWaitSeconds * 1000;
  let offset;

  while (Date.now() < deadline) {
    let updates;
    try {
      updates = await callApi(token, "getUpdates", {
        ...(offset === undefined ? {} : { offset }),
        timeout: POLL_TIMEOUT_SECONDS,
        allowed_updates: ["callback_query"],
      });
    } catch (error) {
      console.warn(`Warning: ${error.message} (retrying in 10 seconds)`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      continue;
    }

    const { actions, rejected, nextOffset } = selectActions(updates, {
      allowedChatId: chatId,
      seen,
    });

    // 破棄したものも含めて offset を進める（詰まり防止 — telegram-core.mjs 参照）
    if (nextOffset !== null) offset = nextOffset;
    for (const entry of rejected) {
      if (entry.updateId !== null) seen.add(entry.updateId);
      if (entry.reason === "chat-not-allowed") {
        console.warn("Warning: dropped a response from an unregistered chat");
      }
    }

    for (const action of actions) {
      seen.add(action.updateId);

      if (action.action === ACTIONS.LATER) {
        await callApi(token, "answerCallbackQuery", {
          callback_query_id: action.callbackQueryId,
          text: "Will check later",
        });
        console.log("Received Later. Stopping the approval wait.");
        return;
      }

      const result = await commitViaHelper(options.helper);
      await callApi(token, "answerCallbackQuery", {
        callback_query_id: action.callbackQueryId,
        text: result.ok
          ? "Confirmed"
          : result.reason === "already-committed"
            ? "Already confirmed"
            : "Confirm failed",
      });

      await callApi(token, "sendMessage", {
        chat_id: chatId,
        text: result.ok
          ? "✅ Confirmed. Continuing."
          : result.reason === "already-committed"
            ? "ℹ️ Already confirmed."
            : `⚠️ Could not confirm: ${result.reason}`,
        disable_web_page_preview: true,
      });

      console.log(result.ok ? "Confirmed." : `Could not confirm: ${result.reason}`);
      return;
    }
  }

  console.log("The approval wait reached its limit. Exiting the bridge.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
