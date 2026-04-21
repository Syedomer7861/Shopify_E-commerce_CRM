/**
 * Helper to create a Server-Sent Events (SSE) stream for sync progress
 */
export function createSyncStream() {
  const encoder = new TextEncoder();
  
  let controller: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const send = (data: any) => {
    if (!controller) return;
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (e) {
      console.error("Stream enqueue error:", e);
    }
  };

  const close = () => {
    if (!controller) return;
    try {
      controller.close();
    } catch (e) {
      // Ignore
    }
  };

  return { stream, send, close };
}

export const syncHeaders = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};
