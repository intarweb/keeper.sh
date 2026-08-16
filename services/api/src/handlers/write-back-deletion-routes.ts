import type { WriteBackDeletionRecord } from "@/queries/list-write-back-deletions";

interface WriteBackDeletionReader {
  listWriteBackDeletions: (userId: string, now: Date) => Promise<WriteBackDeletionRecord[]>;
  now?: () => Date;
}

const handleGetWriteBackDeletionsRoute = async (
  context: { userId: string },
  reader: WriteBackDeletionReader,
): Promise<Response> => {
  const readNow = reader.now ?? (() => new Date());
  const deletions = await reader.listWriteBackDeletions(context.userId, readNow());

  return Response.json({ deletions });
};

export { handleGetWriteBackDeletionsRoute };
export type { WriteBackDeletionReader };
