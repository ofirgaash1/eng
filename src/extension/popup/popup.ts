import type {
  ExtensionRequest,
  ExtensionResponse,
  SyncStatus,
} from "../shared/messages";

const usernameInput = document.getElementById("username") as HTMLInputElement;
const wordCountNode = document.getElementById("word-count") as HTMLDivElement;
const syncStateNode = document.getElementById("sync-state") as HTMLDivElement;
const statusNode = document.getElementById("status") as HTMLDivElement;
const saveUsernameButton = document.getElementById("save-username") as HTMLButtonElement;
const createUsernameButton = document.getElementById("create-username") as HTMLButtonElement;
const syncNowButton = document.getElementById("sync-now") as HTMLButtonElement;

function isExtensionSuccess<T>(response: ExtensionResponse<T>): response is { ok: true; data: T } {
  return response.ok;
}

async function sendMessage<T>(message: ExtensionRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as ExtensionResponse<T>;
  if (!response || !isExtensionSuccess(response)) {
    throw new Error(response?.error || "Extension request failed.");
  }
  return response.data;
}

function formatLastSync(value: number | undefined): string {
  if (!value) {
    return "never";
  }
  return new Date(value).toLocaleString();
}

function renderStatus(status: SyncStatus) {
  usernameInput.value = status.username;
  wordCountNode.textContent = `Words: ${status.wordCount.toLocaleString()}`;
  syncStateNode.textContent = status.configured
    ? `Sync: ${status.username || "username not set"} · last publish ${formatLastSync(status.lastPublishedAt)}`
    : "Sync: VITE_USERNAME_SYNC_BASE_URL is not configured";
  statusNode.textContent = status.message ?? "";
}

async function refreshStatus(message?: string) {
  const status = await sendMessage<SyncStatus>({ type: "GET_SYNC_STATUS" });
  renderStatus({ ...status, message: message ?? status.message });
}

async function withBusy(buttons: HTMLButtonElement[], action: () => Promise<void>) {
  buttons.forEach((button) => {
    button.disabled = true;
  });
  try {
    await action();
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

saveUsernameButton.addEventListener("click", () => {
  void withBusy([saveUsernameButton, createUsernameButton, syncNowButton], async () => {
    const status = await sendMessage<SyncStatus>({
      type: "SET_SYNC_USERNAME",
      username: usernameInput.value,
    });
    renderStatus(status);
  });
});

createUsernameButton.addEventListener("click", () => {
  void withBusy([saveUsernameButton, createUsernameButton, syncNowButton], async () => {
    const status = await sendMessage<SyncStatus>({
      type: "CREATE_SYNC_USERNAME",
      username: usernameInput.value,
    });
    renderStatus(status);
  });
});

syncNowButton.addEventListener("click", () => {
  void withBusy([saveUsernameButton, createUsernameButton, syncNowButton], async () => {
    const status = await sendMessage<SyncStatus>({ type: "SYNC_NOW" });
    renderStatus(status);
  });
});

void refreshStatus();
