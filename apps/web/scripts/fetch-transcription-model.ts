import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

/*
 * 把 Whisper 权重预取到 public/models/，让静态导出（以及打进 APK 的 assets）自带模型，
 * 运行时 env.localModelPath 直接命中，不依赖网络。
 *
 *   bun scripts/fetch-transcription-model.ts [onnx-community/whisper-base] [q8]
 *
 * 文件名规则来自 @huggingface/transformers：seq2seq 模型取 onnx/encoder_model*.onnx 和
 * onnx/decoder_model_merged*.onnx，dtype 后缀见 src/utils/dtypes.js（q8 = "_quantized"）。
 *
 * 域名按顺序试：hf-mirror 优先（快、稳时有节流），但它 2026-10-07 一整天出现过多次
 * ConnectionRefused，而 huggingface.co 实测直连可通（206 续传也能用），所以留作兜底。
 */

const MODEL_ID = process.argv[2] ?? "onnx-community/whisper-base";
const DTYPE = process.argv[3] ?? "q8";

const DTYPE_SUFFIX: Record<string, string> = {
	fp32: "",
	fp16: "_fp16",
	q8: "_quantized",
	int8: "_int8",
	q4: "_q4",
	q4f16: "_q4f16",
};

const suffix = DTYPE_SUFFIX[DTYPE];
if (suffix === undefined) {
	throw new Error(
		`未知 dtype：${DTYPE}（可选 ${Object.keys(DTYPE_SUFFIX).join("/")}）`,
	);
}

/*
 * 顺序按实测吞吐排：2026-10-07 这台机器上 huggingface.co 直连 3.8 MB/s、hf-mirror
 * 0.9 MB/s，而且镜像当天多次直接 ConnectionRefused、还会挂着不死。每次抓取带停顿
 * 超时，卡住就立刻换下一个域名，而不是等整条命令挂掉。
 */
const HOSTS = ["https://huggingface.co", "https://hf-mirror.com"];
const STALL_TIMEOUT_MS = 300_000; // 覆盖整条响应体：149MB 慢镜像上就要 160s+
const OUT_ROOT = resolve(import.meta.dirname, "..", "public", "models");

const FILES = [
	"config.json",
	"generation_config.json",
	"preprocessor_config.json",
	"tokenizer.json",
	"tokenizer_config.json",
	"special_tokens_map.json",
	"added_tokens.json",
	"normalizer.json",
	"vocab.json",
	"merges.txt",
	`onnx/encoder_model${suffix}.onnx`,
	`onnx/decoder_model_merged${suffix}.onnx`,
];

async function download(file: string, target: string): Promise<number> {
	let lastError = "";
	for (const host of HOSTS) {
		const url = `${host}/${MODEL_ID}/resolve/main/${file}`;
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				const res = await fetch(url, {
					signal: AbortSignal.timeout(STALL_TIMEOUT_MS),
				});
				if (!res.ok) {
					lastError = `HTTP ${res.status} ${url}`;
					break;
				}
				const bytes = new Uint8Array(await res.arrayBuffer());
				await Bun.write(target, bytes);
				return bytes.byteLength;
			} catch (error) {
				lastError = `${String(error).slice(0, 80)} ${url}`;
				await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
			}
		}
	}
	throw new Error(`${file} 全部主机都失败：${lastError}`);
}

let totalBytes = 0;
for (const file of FILES) {
	const target = resolve(OUT_ROOT, MODEL_ID, file);
	if (existsSync(target)) {
		console.log(`已存在 ${file}`);
		totalBytes += Bun.file(target).size;
		continue;
	}
	await mkdir(resolve(target, ".."), { recursive: true });

	const bytes = await download(file, target);
	totalBytes += bytes;
	console.log(`${file} ${(bytes / 1048576).toFixed(1)} MB`);
}

console.log(
	`${MODEL_ID} (${DTYPE}) 合计 ${(totalBytes / 1048576).toFixed(1)} MB → public/models/${MODEL_ID}`,
);
