export interface Env {
  SYNC_BUCKET: R2Bucket;
  ALLOWED_ORIGIN?: string;
}

type UsernameMetadata = {
  username: string;
  createdAt: string;
  updatedAt: string;
  sizeBytes?: number;
  contentEncoding?: string | null;
  exportedAt?: string | null;
};

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;

function normalizeUsername(input: string): string | null {
  const normalized = input.trim().toLowerCase();
  return USERNAME_RE.test(normalized) ? normalized : null;
}

function metadataKey(username: string): string {
  return `usernames/${username}/meta.json`;
}

function backupKey(username: string): string {
  return `usernames/${username}/latest.json`;
}

function resolveOrigin(request: Request, env: Env): string {
  const configured = env.ALLOWED_ORIGIN?.trim();
  if (!configured || configured === "*") {
    return "*";
  }
  const requestOrigin = request.headers.get("origin");
  return requestOrigin === configured ? configured : configured;
}

function withCorsHeaders(headers: Headers, origin: string): Headers {
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,content-encoding,x-backup-exported-at");
  headers.set(
    "access-control-expose-headers",
    "content-length,content-type,x-backup-content-encoding,x-backup-exported-at",
  );
  headers.set("access-control-max-age", "86400");
  return headers;
}

function jsonResponse(payload: Record<string, unknown>, status: number, origin: string): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: withCorsHeaders(
      new Headers({
        "content-type": "application/json; charset=utf-8",
      }),
      origin,
    ),
  });
}

function emptyResponse(status: number, origin: string): Response {
  return new Response(null, {
    status,
    headers: withCorsHeaders(new Headers(), origin),
  });
}

function routeSegments(url: URL): string[] {
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const usernamesIndex = parts.lastIndexOf("usernames");
  return usernamesIndex === -1 ? [] : parts.slice(usernamesIndex);
}

async function readMetadata(env: Env, username: string): Promise<UsernameMetadata | null> {
  const object = await env.SYNC_BUCKET.get(metadataKey(username));
  if (!object) {
    return null;
  }

  try {
    return (await object.json()) as UsernameMetadata;
  } catch {
    return null;
  }
}

async function writeMetadata(env: Env, metadata: UsernameMetadata): Promise<void> {
  await env.SYNC_BUCKET.put(metadataKey(metadata.username), JSON.stringify(metadata), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
    },
  });
}

async function handleCreateUsername(username: string, env: Env, origin: string): Promise<Response> {
  const existing = await readMetadata(env, username);
  if (existing) {
    return jsonResponse({ error: "Username already exists." }, 409, origin);
  }

  const now = new Date().toISOString();
  const metadata: UsernameMetadata = {
    username,
    createdAt: now,
    updatedAt: now,
    sizeBytes: 0,
    contentEncoding: null,
    exportedAt: null,
  };
  await writeMetadata(env, metadata);
  return jsonResponse(metadata, 201, origin);
}

async function handlePublishBackup(
  request: Request,
  username: string,
  env: Env,
  origin: string,
): Promise<Response> {
  const metadata = await readMetadata(env, username);
  if (!metadata) {
    return jsonResponse({ error: "Username not found." }, 404, origin);
  }
  if (!request.body) {
    return jsonResponse({ error: "Backup body is required." }, 400, origin);
  }

  const contentType = request.headers.get("content-type") ?? "application/json";
  const contentEncoding = request.headers.get("content-encoding");
  const exportedAt = request.headers.get("x-backup-exported-at");

  await env.SYNC_BUCKET.put(backupKey(username), request.body, {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      username,
      exportedAt: exportedAt ?? "",
      contentEncoding: contentEncoding ?? "",
    },
  });

  const head = await env.SYNC_BUCKET.head(backupKey(username));
  const nextMetadata: UsernameMetadata = {
    username,
    createdAt: metadata.createdAt,
    updatedAt: new Date().toISOString(),
    sizeBytes: head?.size,
    contentEncoding: contentEncoding ?? null,
    exportedAt: exportedAt ?? null,
  };
  await writeMetadata(env, nextMetadata);
  return jsonResponse(nextMetadata, 200, origin);
}

async function handleDownloadBackup(username: string, env: Env, origin: string): Promise<Response> {
  const metadata = await readMetadata(env, username);
  if (!metadata) {
    return jsonResponse({ error: "Username not found." }, 404, origin);
  }

  const object = await env.SYNC_BUCKET.get(backupKey(username));
  if (!object || !object.body) {
    return jsonResponse({ error: "Backup not found for that username." }, 404, origin);
  }

  const headers = withCorsHeaders(new Headers(), origin);
  if (object.httpMetadata?.contentType) {
    headers.set("content-type", object.httpMetadata.contentType);
  }
  if (metadata.contentEncoding) {
    headers.set("x-backup-content-encoding", metadata.contentEncoding);
  }
  if (typeof object.size === "number") {
    headers.set("content-length", String(object.size));
  }
  if (metadata.exportedAt) {
    headers.set("x-backup-exported-at", metadata.exportedAt);
  }

  return new Response(object.body, {
    status: 200,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = resolveOrigin(request, env);

    if (request.method === "OPTIONS") {
      return emptyResponse(204, origin);
    }

    const segments = routeSegments(new URL(request.url));
    if (segments.length < 2) {
      return jsonResponse({ error: "Not found." }, 404, origin);
    }

    const username = normalizeUsername(segments[1] ?? "");
    if (!username) {
      return jsonResponse({ error: "Invalid username." }, 400, origin);
    }

    if (segments.length === 2 && request.method === "POST") {
      return handleCreateUsername(username, env, origin);
    }

    if (segments.length === 3 && segments[2] === "backup") {
      if (request.method === "PUT") {
        return handlePublishBackup(request, username, env, origin);
      }
      if (request.method === "GET") {
        return handleDownloadBackup(username, env, origin);
      }
    }

    return jsonResponse({ error: "Not found." }, 404, origin);
  },
};
