import { NextResponse } from "next/server";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const s3d = new S3Client({
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
    const key = searchParams.get("key");
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    const url = await getSignedUrl(
      s3d,
      new GetObjectCommand({ Bucket: process.env.BUCKET_NAME!, Key: key }),
      { expiresIn: 60 } // 1 minute
    );
    return NextResponse.redirect(url);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}