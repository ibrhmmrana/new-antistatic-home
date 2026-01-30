/**
 * Safely consume a Response body to avoid socket leaks.
 * Use before retrying or when discarding a non-ok response.
 */
export async function consumeBody(res: Response): Promise<void> {
  try {
    await res.arrayBuffer();
  } catch {
    // ignore
  }
  if (res.body) {
    try {
      await res.body.cancel();
    } catch {
      // ignore
    }
  }
}
