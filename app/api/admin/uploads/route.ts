import { NextResponse } from "next/server";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s3 = new S3Client({
  region: process.env.REGION,
  credentials: {
    accessKeyId: process.env.ACCESS_KEY ?? "",
    secretAccessKey: process.env.SECRET_ACCESS_KEY ?? "",
  },
});

export async function GET(req: Request) {
  try {
    // TODO: auth check for admin
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || undefined;

    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.BUCKET_NAME!,
        ContinuationToken: token,
        MaxKeys: 50,
      })
    );

    const items = (res.Contents || []).map((o) => ({
      key: o!.Key!,
      size: Number(o!.Size || 0),
      lastModified: (o!.LastModified || new Date()).toISOString(),
      name: (o!.Key || "").split("/")[0] || "",
    }));

    return NextResponse.json({
      items,
      nextToken: res.IsTruncated ? res.NextContinuationToken : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
