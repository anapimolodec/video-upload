import { Suspense } from "react";
import AdminUploadsTable from './table'

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminUploadsPage() {
  // TODO: protect this route (e.g., NextAuth, middleware, etc.)
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Uploads Admin</h1>
      <p className="mb-6 text-sm text-muted-foreground">Review form submissions and download uploaded files.</p>
      <Suspense fallback={<div>Loading…</div>}>
        <AdminUploadsTable />
      </Suspense>
    </div>
  );
}