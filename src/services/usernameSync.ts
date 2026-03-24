import type { BackupPayload } from "../data/backupRepo";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;
const RAW_SYNC_BASE_URL = (import.meta.env.VITE_USERNAME_SYNC_BASE_URL ?? "").trim();
const SYNC_BASE_URL = RAW_SYNC_BASE_URL.replace(/\/+$/, "");

type SyncJsonResponse = {
  username?: string;
  createdAt?: string;
  updatedAt?: string;
  sizeBytes?: number;
  contentEncoding?: string | null;
  exportedAt?: string | null;
  error?: string;
  message?: string;
};

export type UsernameSyncMetadata = {
  username: string;
  createdAt?: string;
  updatedAt?: string;
  sizeBytes?: number;
  contentEncoding?: string | null;
  exportedAt?: string | null;
};

export function isUsernameSyncConfigured(): boolean {
  return SYNC_BASE_URL.length > 0;
}

export function normalizeSyncUsername(input: string): string {
  const normalized = input.trim().toLowerCase();
  if (!USERNAME_RE.test(normalized)) {
    throw new Error(
      "Username must be 3-32 characters and use only lowercase letters, numbers, '-' or '_'.",
    );
  }
  return normalized;
}

function requireSyncBaseUrl(): string {
  if (!isUsernameSyncConfigured()) {
    throw new Error("Username sync is not configured. Set VITE_USERNAME_SYNC_BASE_URL.");
  }
  return SYNC_BASE_URL;
}

function buildSyncUrl(path: string): string {
  return `${requireSyncBaseUrl()}${path}`;
}

function toFetchErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return (
      "Unable to reach the username sync service. Check VITE_USERNAME_SYNC_BASE_URL, " +
      "restart the dev server after editing .env.local, and verify the worker URL is live."
    );
  }
  return error instanceof Error ? error.message : "Unable to reach the username sync service.";
}

async function fetchSync(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    throw new Error(toFetchErrorMessage(error));
  }
}

function toMetadata(username: string, response: SyncJsonResponse): UsernameSyncMetadata {
  return {
    username,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
    sizeBytes: response.sizeBytes,
    contentEncoding: response.contentEncoding ?? null,
    exportedAt: response.exportedAt ?? null,
  };
}

async function readResponseError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text.trim()) {
    return `Request failed with status ${response.status}.`;
  }

  try {
    const payload = JSON.parse(text) as SyncJsonResponse;
    const message = payload.error ?? payload.message;
    if (message) return message;
  } catch {
    // Fall through to plain text.
  }

  return text.length > 400 ? `Request failed with status ${response.status}.` : text;
}

async function maybeCompressJson(text: string): Promise<{
  body: ArrayBuffer;
  contentEncoding?: "gzip";
}> {
  const plain = new TextEncoder().encode(text);
  if (typeof CompressionStream === "undefined") {
    return { body: plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) };
  }

  const compressed = await new Response(
    new Blob([plain]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  return {
    body: compressed,
    contentEncoding: "gzip",
  };
}

async function readBackupText(response: Response): Promise<string> {
  const body = await response.arrayBuffer();
  const bytes = new Uint8Array(body);
  const contentEncoding =
    response.headers.get("x-backup-content-encoding")?.toLowerCase() ??
    response.headers.get("content-encoding")?.toLowerCase();

  if (contentEncoding === "gzip") {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("This browser cannot import compressed backups.");
    }
    return await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
  }

  return new TextDecoder().decode(bytes);
}

export async function createUsernameProfile(rawUsername: string): Promise<UsernameSyncMetadata> {
  const username = normalizeSyncUsername(rawUsername);
  const response = await fetchSync(buildSyncUrl(`/usernames/${encodeURIComponent(username)}`), {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const payload = (await response.json()) as SyncJsonResponse;
  return toMetadata(username, payload);
}

export async function publishBackupToUsername(
  rawUsername: string,
  payload: BackupPayload,
): Promise<UsernameSyncMetadata> {
  const username = normalizeSyncUsername(rawUsername);
  const serialized = JSON.stringify(payload);
  const upload = await maybeCompressJson(serialized);
  const response = await fetchSync(
    buildSyncUrl(`/usernames/${encodeURIComponent(username)}/backup`),
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(upload.contentEncoding ? { "content-encoding": upload.contentEncoding } : {}),
        "x-backup-exported-at": payload.exportedAt,
      },
      body: upload.body,
    },
  );

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const result = (await response.json()) as SyncJsonResponse;
  return toMetadata(username, result);
}

export async function importBackupFromUsername(rawUsername: string): Promise<{
  username: string;
  payload: unknown;
}> {
  const username = normalizeSyncUsername(rawUsername);
  const response = await fetchSync(buildSyncUrl(`/usernames/${encodeURIComponent(username)}/backup`), {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const text = await readBackupText(response);
  return {
    username,
    payload: JSON.parse(text),
  };
}
