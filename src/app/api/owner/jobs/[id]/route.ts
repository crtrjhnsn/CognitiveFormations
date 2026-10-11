import { ownerOrNull } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getJobProgress } from "@/lib/owner/jobs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: RouteContext<"/api/owner/jobs/[id]">) {
  const owner = await ownerOrNull();
  if (!owner) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const progress = await getJobProgress(db(), owner.id, id);
  if (!progress) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(
    { status: progress.status, error: progress.error, costEstimate: progress.costEstimate, done: progress.done, steps: progress.steps },
    { headers: { "Cache-Control": "no-store" } },
  );
}
