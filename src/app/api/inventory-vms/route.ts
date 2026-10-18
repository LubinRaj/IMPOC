import { requireSession } from "@/server/services/auth";
export const dynamic = "force-dynamic";
import { pageSchema } from "@/lib/contracts";
import { listInventory, listScopes } from "@/server/services/sources";
import { NetBoxDestination } from "@/server/destinations/netbox";
import { errorResponse } from "@/server/services/errors";
import { requireLocalTestAdapter } from "@/server/services/local-test-adapter";
export async function GET(req: Request) {
  try {
    await requireSession();
    const query = new URL(req.url).searchParams;
    const opts = pageSchema.parse(Object.fromEntries(query));
    if (query.get("destination") === "local") {
      requireLocalTestAdapter();
      return Response.json(await listInventory(opts));
    }
    const [all, scopeRows] = await Promise.all([
      new NetBoxDestination().listAll(),
      listScopes(),
    ]);
    const names = new Map(scopeRows.map((scope) => [scope.id, scope.name]));
    const filtered = all
      .filter(
        (vm) =>
          (!opts.scopeId || vm.scopeId === opts.scopeId) &&
          (!opts.status || vm.lifecycleStatus === opts.status) &&
          (!opts.q ||
            vm.hostname.toLowerCase().includes(opts.q.toLowerCase()) ||
            vm.externalId.toLowerCase().includes(opts.q.toLowerCase())),
      )
      .sort(
        (a, b) =>
          a.provider.localeCompare(b.provider) ||
          a.externalId.localeCompare(b.externalId),
      );
    return Response.json({
      items: filtered
        .slice((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize)
        .map((vm) => ({
          ...vm,
          scopeName: names.get(vm.scopeId) ?? vm.scopeId,
        })),
      total: filtered.length,
      page: opts.page,
      pageSize: opts.pageSize,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
