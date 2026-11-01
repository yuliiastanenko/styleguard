import { uploadImage, pingR2 } from "../src/storage/r2.js";

const pixel = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

await pingR2();
console.log("bucket ok");

const { url } = await uploadImage("healthcheck/pixel.png", pixel);
console.log("uploaded:", url);
