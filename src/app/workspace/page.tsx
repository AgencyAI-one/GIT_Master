import { connection } from "next/server";
import { requireSession } from "@/lib/auth";
import { Workspace } from "@/components/workspace/workspace";

export default async function WorkspacePage() {
  await requireSession();
  await connection();
  // `connection()` above guarantees this value is created once per request, outside prerendering.
  // eslint-disable-next-line react-hooks/purity
  const initialTime = Date.now();
  return <Workspace initialTime={initialTime} />;
}
