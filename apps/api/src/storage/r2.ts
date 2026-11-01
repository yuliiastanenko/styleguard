import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { env } from "../env.js";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export function publicUrl(key: string): string {
  return `${env.R2_PUBLIC_URL}/${key}`;
}

// same id -> same key, so a retried upload just overwrites
export function imageKeyFor(generationId: string, ext = "png"): string {
  return `generations/${generationId}.${ext}`;
}

export async function uploadImage(
  key: string,
  body: Uint8Array,
  contentType = "image/png",
): Promise<{ key: string; url: string }> {
  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return { key, url: publicUrl(key) };
}

export async function pingR2(): Promise<void> {
  await r2.send(new HeadBucketCommand({ Bucket: env.R2_BUCKET }));
}
