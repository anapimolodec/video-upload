"use client";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, RefreshCw, Search } from "lucide-react";

interface UploadRow {
  key: string;
  size: number;
  lastModified: string;
  name: string; // parsed from key prefix
}

export default function AdminUploadsTable() {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    if (!v) return rows;
    return rows.filter((r) => r.key.toLowerCase().includes(v) || r.name.toLowerCase().includes(v));
  }, [q, rows]);

  const fetchPage = async (token?: string | null, append = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/uploads${token ? `?token=${encodeURIComponent(token)}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to fetch");
      setRows((prev) => (append ? [...prev, ...data.items] : data.items));
      setNextToken(data.nextToken || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(undefined, false);
  }, []);

  const onRefresh = () => fetchPage(undefined, false);
  const onLoadMore = () => fetchPage(nextToken, true);

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-2 p-4">
          <div className="flex min-w-0 items-center gap-2">
            <Search className="h-4 w-4 shrink-0" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or key…" className="w-64" />
          </div>
          <Button variant="outline" onClick={onRefresh} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36%]">Key</TableHead>
                <TableHead className="w-[16%]">Name</TableHead>
                <TableHead className="w-[12%] text-right">Size</TableHead>
                <TableHead className="w-[20%]">Last modified</TableHead>
                <TableHead className="w-[16%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="truncate font-mono text-xs">{r.key}</TableCell>
                  <TableCell className="truncate">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{(r.size / (1024 * 1024)).toFixed(1)} MB</TableCell>
                  <TableCell>{new Date(r.lastModified).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" asChild className="gap-2">
                      <a href={`/api/admin/download?key=${encodeURIComponent(r.key)}`}>
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!filtered.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    No uploads found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between p-4">
          <div className="text-xs text-muted-foreground">Showing {filtered.length} item(s)</div>
          <Button variant="outline" onClick={onLoadMore} disabled={!nextToken || loading}>
            {nextToken ? "Load more" : "End of list"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}