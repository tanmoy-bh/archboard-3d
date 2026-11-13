import type { Store } from "../model/store";
import { ApiError, createBoard, saveBoard } from "./api";

/**
 * Save the board on the board in the editor to the saved list: over the same saved board if it has been saved
 * before, otherwise as a new one. `shared` sets sharing; leave it out to keep whatever it was (new boards start
 * private). If the saved copy was deleted meanwhile, a new one is made.
 */
export async function saveCurrent(page: string, store: Store, shared?: boolean): Promise<{ id: string; created: boolean }> {
  const id = store.doc.boardId;
  if (id) {
    try {
      await saveBoard(page, id, store.doc, shared);
      return { id, created: false };
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e; // anything but "it is gone" is a real problem
    }
  }
  const fresh = await createBoard(page, store.doc, shared ?? false);
  store.setBoardId(fresh);
  return { id: fresh, created: true };
}
