import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processImage } from "@/lib/media/service";

describe("Artwork image quality", () => {
  it("uses the requested resolution limits and lossless decoded detail pixels", async () => {
    const width = 2800;
    const height = 1680;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 3;
        pixels[offset] = (x * 7 + y * 3) % 256;
        pixels[offset + 1] = (x + y * 5) % 256;
        pixels[offset + 2] = (x * 2 + y) % 256;
      }
    }
    const source = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .jpeg({ quality: 95 })
      .toBuffer();
    const result = await processImage(source);
    const expectedWidths = { thumb: 320, room: 1536, detail: 2560 };
    for (const output of result.outputs) {
      const metadata = await sharp(output.buffer).metadata();
      expect(metadata.width).toBe(expectedWidths[output.variant]);
      expect(metadata.height).toBe(Math.round(expectedWidths[output.variant] * height / width));
      expect(metadata.space).toBe("srgb");
    }
    const detail = result.outputs.find((output) => output.variant === "detail")!;
    const actual = await sharp(detail.buffer).raw().toBuffer();
    const expected = await sharp(source)
      .rotate()
      .toColourspace("srgb")
      .resize({ width: 2560, withoutEnlargement: true })
      .raw()
      .toBuffer();
    expect(actual.equals(expected)).toBe(true);
  });

  it("applies EXIF orientation without enlarging or recompressing the detail", async () => {
    const source = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#b35a8c" } })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 95 })
      .toBuffer();
    const result = await processImage(source);
    expect(result.width).toBe(80);
    expect(result.height).toBe(120);
    for (const output of result.outputs) {
      const metadata = await sharp(output.buffer).metadata();
      expect(metadata.width).toBe(80);
      expect(metadata.height).toBe(120);
      expect(metadata.orientation).toBeUndefined();
    }
    const detail = result.outputs.find((output) => output.variant === "detail")!;
    const actual = await sharp(detail.buffer).raw().toBuffer();
    const expected = await sharp(source).rotate().toColourspace("srgb").raw().toBuffer();
    expect(actual.equals(expected)).toBe(true);
  });
});
