export interface DbErrorEvent {
  id: string;
  context: string;
  message: string;
  stack?: string;
  timestamp: number;
}

type DbErrorListener = (errors: DbErrorEvent[]) => void;

const listeners = new Set<DbErrorListener>();
let errors: DbErrorEvent[] = [];

function emit() {
  for (const listener of listeners) {
    listener(errors);
  }
}

export function subscribeDbErrors(listener: DbErrorListener): () => void {
  listeners.add(listener);
  listener(errors);
  return () => {
    listeners.delete(listener);
  };
}

export function reportDbError(event: Omit<DbErrorEvent, "id" | "timestamp">): void {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  errors = [
    ...errors,
    {
      ...event,
      id,
      timestamp: Date.now(),
    },
  ].slice(-5);
  emit();
}

export function dismissDbError(id: string): void {
  errors = errors.filter((error) => error.id !== id);
  emit();
}
