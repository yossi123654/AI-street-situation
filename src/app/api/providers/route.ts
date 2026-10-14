import { apiHandler, json } from "@/lib/api";
import { getProviderStatuses } from "@/providers/registry";

export const dynamic = "force-dynamic";

/** GET /api/providers → which providers exist and which are enabled (no secrets). */
export const GET = apiHandler(async () => json({ providers: getProviderStatuses() }));
