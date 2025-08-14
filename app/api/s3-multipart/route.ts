 import { NextResponse } from "next/server";
 import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
 import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

 export const runtime = "nodejs";
 export const dynamic = "force-dynamic";
 export const maxDuration = 300;

 const s3 = new S3Client({
   region: process.env.REGION,
   credentials: {
     accessKeyId: process.env.ACCESS_KEY ?? "",
     secretAccessKey: process.env.SECRET_ACCESS_KEY ?? "",
   },
 });

 const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: process.env.REGION,
    credentials: {
      accessKeyId: process.env.ACCESS_KEY ?? "",
      secretAccessKey: process.env.SECRET_ACCESS_KEY ?? "",
    },
  })
);

 function safe(str: string) {
   return str.replace(/[^a-z0-9-_\.]+/gi, "_");
 }

 export async function POST(req: Request) {
   try {
     const body = await req.json();
     const action = body?.action as string;

     if (action === "create") {
       const name = safe(String(body?.name || "unknown"));
       const filename = String(body?.filename || "upload.bin");
       const fileType = String(body?.fileType || "application/octet-stream");
       const ext = filename.split(".").pop() || "bin";
       const base = safe(filename.replace(/\.[^.]+$/, ""));
       const key = `${name}/${base}-${Date.now()}.${ext}`;

       const cmd = new CreateMultipartUploadCommand({
         Bucket: process.env.BUCKET_NAME ?? '',
         Key: key,
         ContentType: fileType,
       });
       const res = await s3.send(cmd);
       return NextResponse.json({ uploadId: res.UploadId, key });
     }

     if (action === "presign") {
       const { key, uploadId, partNumber } = body as { key: string; uploadId: string; partNumber: number };
       if (!key || !uploadId || !partNumber) return NextResponse.json({ error: "Missing presign params" }, { status: 400 });
       const url = await getSignedUrl(
         s3,
         new UploadPartCommand({ Bucket: process.env.BUCKET_NAME ?? '', Key: key, UploadId: uploadId, PartNumber: partNumber }),
         { expiresIn: 60 * 10 }
       );
       return NextResponse.json({ url });
     }

     if (action === "complete") {
       const { key, uploadId, parts } = body as { key: string; uploadId: string; parts: { ETag: string; PartNumber: number }[] };
       if (!key || !uploadId || !Array.isArray(parts)) return NextResponse.json({ error: "Missing complete params" }, { status: 400 });
       const cmd = new CompleteMultipartUploadCommand({
         Bucket: process.env.BUCKET_NAME ?? '',
         Key: key,
         UploadId: uploadId,
         MultipartUpload: { Parts: parts },
       });
       await s3.send(cmd);
       const item = {
        id: randomUUID(),
        createdAt: String(Date.now()),
        videoKey: key,
      };

      await ddb.send(
        new PutCommand({
          TableName: process.env.DDB_TABLE!,
          Item: item,
        })
      );


       return NextResponse.json({ msg: `File uploaded to ${key}`,id: item.id });
     }

     if (action === "abort") {
       const { key, uploadId } = body as { key: string; uploadId: string };
       if (!key || !uploadId) return NextResponse.json({ error: "Missing abort params" }, { status: 400 });
       const cmd = new AbortMultipartUploadCommand({ Bucket: process.env.BUCKET_NAME!, Key: key, UploadId: uploadId });
       await s3.send(cmd);
       return NextResponse.json({ msg: "Aborted" });
     }

     return NextResponse.json({ error: "Unknown action" }, { status: 400 });
   } catch (err: any) {
     return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
   }
 }

/**
 * Bucket CORS (required)
 *  - Allow PUT from your app origin
 *  - Allow headers: Content-Type, x-amz-acl
 *  - Expose header: ETag (so the client can read it)
 * Example CORS JSON (S3 console → Permissions → CORS configuration):
 * [
 *   {
 *     "AllowedHeaders": ["*"],
 *     "AllowedMethods": ["PUT", "POST", "GET"],
 *     "AllowedOrigins": ["https:your.app"],
 *     "ExposeHeaders": ["ETag"],
 *     "MaxAgeSeconds": 3000
 *   }
 * ]
 */
