/**
 * Creates the private bucket and the CORS rule that lets the browser PUT/GET directly with
 * presigned URLs. Safe to run repeatedly.  npm run storage:init
 */
import "dotenv/config";
import { CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const { s3 } = await import("@/server/storage/storage");
const { env } = await import("@/server/env");

const Bucket = env.S3_BUCKET;

try {
  await s3.send(new HeadBucketCommand({ Bucket }));
  console.log(`Bucket "${Bucket}" exists`);
} catch {
  await s3.send(new CreateBucketCommand({ Bucket }));
  console.log(`Bucket "${Bucket}" created`);
}

await s3.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [new URL(env.APP_URL).origin],
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedHeaders: ["content-type", "content-length", "range"],
          ExposeHeaders: ["etag", "content-length", "content-range", "accept-ranges"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
console.log(`CORS allows ${new URL(env.APP_URL).origin}`);
