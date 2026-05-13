/**
 * Helper to create a Server-Sent Events (SSE) stream for sync progress.
 * The `closed` flag ensures send() is a no-op after the client disconnects,
 * preventing ERR_INVALID_STATE spam in the terminal.
 */
export function createSyncStream() {
  const encoder = new TextEncoder();
  let isClosed = false;

  let controller: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      // Client disconnected — mark closed so send() stops silently
      isClosed = true;
    },
  });

  const send = (data: any) => {
    if (!controller || isClosed) return; // silent no-op after close
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch {
      // Swallow — client already disconnected
      isClosed = true;
    }
  };

  const close = () => {
    if (!controller || isClosed) return;
    isClosed = true;
    try {
      controller.close();
    } catch {
      // Already closed — ignore
    }
  };

  return { stream, send, close };
}

export const syncHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};
