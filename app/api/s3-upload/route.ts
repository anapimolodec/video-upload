import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
    region: process.env.REGION,
    credentials: {
        accessKeyId: process.env.ACCESS_KEY ?? '',
        secretAccessKey: process.env.SECRET_ACCESS_KEY ?? ''
    }
});

async function uploadFileToS3(file: Buffer<any>, fileName: string) {
    try {
        const fileBuffer = file;
        console.log("filename -> ", fileName);
        const params = {
            Bucket: process.env.BUCKET_NAME,
            Key: `${fileName}-${Date.now}`,
            Body: fileBuffer,
            ContentType: "image/png"
        }
    
        const command = new PutObjectCommand(params);
        await s3.send(command);
        return fileName;
    } catch (error) {
        console.log("ERROR => ", error)
        return ''

    }
   
}

export async function POST(request: Request) {
    try {
      const formData = await request.formData();
      const file = formData.get("file");

      console.log("here1");
  
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "File is required" },
          { status: 400 }
        );
      }
  
      console.log("here2");
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name;
      console.log("here3");
      const uploadedFileName = await uploadFileToS3(buffer, fileName);
      console.log("here4");
      return NextResponse.json({
        success: true,
        msg: `File uploaded ${uploadedFileName}`,
      });
    } catch (error) {
      return NextResponse.json({ error: `ERROR working ${error}` });
    }
  }
  