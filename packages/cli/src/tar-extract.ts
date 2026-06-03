import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createGunzip } from 'node:zlib';
/**
 * Minimal tar.gz extractor for GitHub archive layout (ustar).
 */
export async function extract(tarGzPath: string, destDir: string): Promise<void> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    createReadStream(tarGzPath)
      .pipe(createGunzip())
      .on('data', (c: Buffer) => chunks.push(c))
      .on('end', () => resolve())
      .on('error', reject);
  });
  const buf = Buffer.concat(chunks);
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0/g, '').trim();
    const sizeOct = header.subarray(124, 136).toString('utf8').replace(/\0/g, '').trim();
    const size = parseInt(sizeOct, 8) || 0;
    const type = header[156];
    offset += 512;
    const data = buf.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;
    if (!name || name === './' || name === '.') continue;
    const outPath = join(destDir, name);
    if (type === 0x35 || name.endsWith('/')) {
      await mkdir(outPath, { recursive: true });
      continue;
    }
    if (type === 0 || type === 0x30 || type === 0) {
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, data);
    }
  }
}
