"use client";

import { useRef, useState, ChangeEvent, FormEvent, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { UploadCloud, Loader2, CheckCircle2, X, AlertTriangle } from "lucide-react";

export default function S3MultipartForm() {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [overallPct, setOverallPct] = useState(0);
  const [currentStep, setCurrentStep] = useState<"idle" | "creating" | "uploading" | "completing">("idle");

  const xhrsRef = useRef<Record<number, XMLHttpRequest>>({});
  const abortingRef = useRef(false);

  const partSize = 10 * 1024 * 1024; // 10MB (S3 min is 5MB except last part)
  const maxConcurrency = 3; // tune to your user bandwidth

  const partCount = useMemo(() => (file ? Math.ceil(file.size / partSize) : 0), [file]);

  const reset = () => {
    setUploading(false);
    setSuccessMsg(null);
    setErrorMsg(null);
    setOverallPct(0);
    setCurrentStep("idle");
    abortingRef.current = false;
    // abort any straggler XHRs
    Object.values(xhrsRef.current).forEach((x) => x?.abort());
    xhrsRef.current = {};
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setErrorMsg("Please choose a video file.");
      return;
    }
    setFile(f);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const cancelUpload = async () => {
    abortingRef.current = true;
    Object.values(xhrsRef.current).forEach((x) => x?.abort());
    setErrorMsg("Upload canceled.");
    setUploading(false);
    setCurrentStep("idle");
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMsg(null);

    if (!file) return setErrorMsg("Select a file first.");
    if (!name.trim()) return setErrorMsg("Enter your name.");

    reset();
    setUploading(true);
    setCurrentStep("creating");

    try {
      const createRes = await fetch("/api/s3-multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", filename: file.name, fileType: file.type, name }),
      });
      if (!createRes.ok) throw new Error(`Create failed (${createRes.status})`);
      const { uploadId, key } = (await createRes.json()) as { uploadId: string; key: string };

      setCurrentStep("uploading");
      const totalSize = file.size;
      let uploadedSoFar = 0; 
      const etags: { ETag: string; PartNumber: number }[] = [];

      const perPartLoaded = new Map<number, number>();

      const uploadPart = async (partNumber: number) => {
        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, file.size);
        const blob = file.slice(start, end);

        const presignRes = await fetch("/api/s3-multipart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "presign", key, uploadId, partNumber }),
        });
        if (!presignRes.ok) throw new Error(`Presign failed (${presignRes.status})`);
        const { url } = (await presignRes.json()) as { url: string };

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrsRef.current[partNumber] = xhr;
          xhr.open("PUT", url);
          xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

          xhr.upload.onprogress = (evt) => {
            if (!evt.lengthComputable) return;
            const prev = perPartLoaded.get(partNumber) || 0;
            perPartLoaded.set(partNumber, evt.loaded);
            const delta = evt.loaded - prev;
            // Update global overall progress incrementally
            const newPct = Math.min(100, Math.round(((uploadedSoFar + Array.from(perPartLoaded.values()).reduce((a, b) => a + b, 0)) / totalSize) * 100));
            setOverallPct(newPct);
          };

          xhr.onload = () => {
            const etag = xhr.getResponseHeader("ETag");
            if (xhr.status >= 200 && xhr.status < 300 && etag) {
              uploadedSoFar += blob.size;
              perPartLoaded.delete(partNumber);
              etags.push({ ETag: etag, PartNumber: partNumber });
              setOverallPct(Math.min(100, Math.round((uploadedSoFar / totalSize) * 100)));
              resolve();
            } else {
              reject(new Error(`Part ${partNumber} failed (${xhr.status})`));
            }
          };

          xhr.onerror = () => reject(new Error(`Network error on part ${partNumber}`));
          xhr.onabort = () => reject(new Error(`Aborted part ${partNumber}`));

          xhr.send(blob);
        });
      };

      const queue: number[] = Array.from({ length: partCount }, (_, i) => i + 1);
      const workers = Array.from({ length: Math.min(maxConcurrency, queue.length) }, async () => {
        while (queue.length && !abortingRef.current) {
          const n = queue.shift()!;
          await uploadPart(n);
        }
      });
      await Promise.all(workers);

      if (abortingRef.current) return; 

  
      setCurrentStep("completing");
      const completeRes = await fetch("/api/s3-multipart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", key, uploadId, parts: etags.sort((a,b)=>a.PartNumber-b.PartNumber) }),
      });
      if (!completeRes.ok) throw new Error(`Complete failed (${completeRes.status})`);
      const data = await completeRes.json();

      setSuccessMsg(data?.msg || `Upload complete: ${key}`);
      setOverallPct(100);
      setUploading(false);
      setCurrentStep("idle");
    } catch (err: any) {
      if (!abortingRef.current) {
        setErrorMsg(String(err?.message || err));
      }
      setUploading(false);
      setCurrentStep("idle");
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Upload a Large Video (Multipart → S3)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Real S3 progress via presigned multipart uploads. You can cancel anytime.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" placeholder="Jane Doe" value={name} onChange={(e) => setName(e.target.value)} disabled={uploading} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">Video file</Label>
              <Input id="file" type="file" accept="video/*" onChange={handleFileChange} disabled={uploading} />
              {file && (
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium">{file.name}</span> ({(file.size / (1024 * 1024)).toFixed(1)} MB), parts: {partCount}
                </p>
              )}
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={uploading || !file || !name.trim()} className="gap-2">
                <UploadCloud className="h-4 w-4" />
                {uploading ? "Uploading…" : "Start upload"}
              </Button>
              {uploading && (
                <Button type="button" variant="ghost" onClick={cancelUpload} className="gap-2">
                  <X className="h-4 w-4" /> Cancel
                </Button>
              )}
            </div>

            <AnimatePresence>
              {uploading && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {currentStep === "creating" && "Creating multipart…"}
                    {currentStep === "uploading" && `Uploading parts… ${overallPct}%`}
                    {currentStep === "completing" && "Finalizing…"}
                  </div>
                  <Progress value={overallPct} className="h-2" />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {successMsg && !uploading && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="rounded-lg border bg-green-50 p-3 text-sm text-green-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Success:</span> {successMsg}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {errorMsg && !uploading && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="rounded-lg border bg-red-50 p-3 text-sm text-red-900">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    {errorMsg}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Please do not close this page untill upload is finished.
        </CardFooter>
      </Card>
    </div>
  );
}
