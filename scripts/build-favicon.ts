// Renders the sunburst onto a rounded black tile and writes apps/web/public/favicon.ico.
// Dependency-free: signed-distance rasterising, PNG via zlib, ICO with embedded PNGs.
// Run: bun scripts/build-favicon.ts
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZES = [16, 32, 48, 64, 128, 256];
const CORNER = 0.24; // tile corner radius, fraction of size
const INNER = 0.16; // ray start, fraction of size from centre
const OUTER = 0.34; // ray end
const STROKE = 0.085; // ray thickness
const SS = 4; // supersamples per axis

const RAYS = Array.from({ length: 8 }, (_, i) => {
	const a = (i * Math.PI) / 4;
	return [Math.cos(a), Math.sin(a)] as const;
});

function roundRect(x: number, y: number, r: number) {
	const qx = Math.abs(x - 0.5) - (0.5 - r);
	const qy = Math.abs(y - 0.5) - (0.5 - r);
	return (
		Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
		Math.min(Math.max(qx, qy), 0) -
		r
	);
}

function capsule(x: number, y: number, [c, s]: readonly [number, number]) {
	const px = x - 0.5;
	const py = y - 0.5;
	const t = Math.min(Math.max(px * c + py * s, INNER), OUTER);
	return Math.hypot(px - c * t, py - s * t) - STROKE / 2;
}

function render(size: number) {
	const rgba = new Uint8Array(size * size * 4);
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			let tile = 0;
			let ray = 0;
			for (let sy = 0; sy < SS; sy++) {
				for (let sx = 0; sx < SS; sx++) {
					const x = (px + (sx + 0.5) / SS) / size;
					const y = (py + (sy + 0.5) / SS) / size;
					if (roundRect(x, y, CORNER) > 0) continue;
					tile++;
					if (RAYS.some((d) => capsule(x, y, d) <= 0)) ray++;
				}
			}
			const n = SS * SS;
			const i = (py * size + px) * 4;
			const v = tile ? Math.round((ray / tile) * 255) : 0;
			rgba.set([v, v, v, Math.round((tile / n) * 255)], i);
		}
	}
	return png(size, rgba);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function chunk(type: string, data: Uint8Array) {
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	let c = 0xffffffff;
	for (const b of body) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
	const out = Buffer.alloc(body.length + 8);
	out.writeUInt32BE(data.length, 0);
	body.copy(out, 4);
	out.writeUInt32BE((c ^ 0xffffffff) >>> 0, body.length + 4);
	return out;
}

function png(size: number, rgba: Uint8Array) {
	const raw = Buffer.alloc((size * 4 + 1) * size);
	for (let y = 0; y < size; y++) {
		Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(
			raw,
			y * (size * 4 + 1) + 1,
		);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr.set([8, 6, 0, 0, 0], 8);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", new Uint8Array()),
	]);
}

const images = SIZES.map(render);
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((img, i) => {
	const e = 6 + i * 16;
	const s = SIZES[i]!;
	header.writeUInt8(s >= 256 ? 0 : s, e);
	header.writeUInt8(s >= 256 ? 0 : s, e + 1);
	header.writeUInt16LE(1, e + 4);
	header.writeUInt16LE(32, e + 6);
	header.writeUInt32LE(img.length, e + 8);
	header.writeUInt32LE(offset, e + 12);
	offset += img.length;
});

const out = new URL("../apps/web/public/favicon.ico", import.meta.url);
writeFileSync(out, Buffer.concat([header, ...images]));
console.log(`wrote ${out.pathname} (${SIZES.join(", ")}px)`);
