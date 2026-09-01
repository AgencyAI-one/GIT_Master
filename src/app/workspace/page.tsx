import { requireSession } from "@/lib/auth";
import { Workspace } from "@/components/workspace/workspace";

export default async function WorkspacePage() {
  await requireSession();
  return <Workspace />;
}
