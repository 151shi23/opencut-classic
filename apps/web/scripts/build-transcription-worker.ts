import type { BunPlugin } from "bun";
import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/*
 * 字幕识别的 worker 不能交给 Turbopack：它把
 * `new Worker(new URL("./worker.ts", import.meta.url))` 当成静态资源，原样发出
 * 未编译的 TypeScript（out/_next/static/media/worker.*.ts），模块 worker 一加载
 * 就是 MIME 错 + 裸模块名解析不了 —— 静态导出里这功能从来没跑起来过。
 *
 * 这里用 Bun 单独打成一个自包含的 public/transcription/worker.js，并把 ORT 的
 * wasm 运行时按原样拷进同一个目录：worker 里把 env.backends.onnx.wasm.wasmPaths
 * 指到 /transcription/，运行时靠运行时算出来的动态 import 去取它，绕开打包器。
 */

const WEB_ROOT = resolve(import.meta.dirname, "..");
const OUT_DIR = join(WEB_ROOT, "public", "transcription");

/*
 * onnxruntime-web 不是本站的直接依赖，它挂在 transformers 自己的 node_modules 旁边
 * （bun 的隔离安装），所以要从 transformers 的包根去解析——打包器内联它那行裸
 * import 时走的是同一个位置，两边版本才不会错开。
 */
const transformersRoot = resolve(
	dirname(Bun.resolveSync("@huggingface/transformers", WEB_ROOT)),
	"..",
);
const ORT_DIST = dirname(Bun.resolveSync("onnxruntime-web", transformersRoot));
const ortVersion: string = JSON.parse(
	await Bun.file(join(ORT_DIST, "..", "package.json")).text(),
).version;

/*
 * @huggingface/transformers 的 Web 构建裸 import "onnxruntime-web"，默认命中
 * dist/ort.bundle.min.mjs —— 那个变体用 `new URL("ort-wasm….wasm", import.meta.url)`
 * 找 wasm，会被打包器改写成带 hash 的资源名。这里换成 ort.min.mjs（extern-wasm 变体），
 * 它运行时按 wasmPaths 拼 URL，正好对上我们拷进 public/transcription/ 的文件。
 */
const externWasm: BunPlugin = {
	name: "onnxruntime-web-extern-wasm",
	setup(build) {
		build.onResolve({ filter: /^onnxruntime-web$/ }, () => ({
			path: join(ORT_DIST, "ort.min.mjs"),
		}));
	},
};

const CANDIDATES = ["", ".ts", ".tsx", ".js", "/index.ts"];
const tsAlias: BunPlugin = {
	name: "tsconfig-paths",
	setup(build) {
		/* onResolve 里我们接管了路径，bun 不会再猜扩展名，自己补 */
		build.onResolve({ filter: /^@\// }, ({ path }) => {
			const base = resolve(WEB_ROOT, "src", path.slice(2));
			for (const suffix of CANDIDATES) {
				if (existsSync(base + suffix)) return { path: base + suffix };
			}
			throw new Error(`${path} 在 src/ 下找不到对应文件`);
		});
	},
};

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const result = await Bun.build({
	entrypoints: [join(WEB_ROOT, "src/services/transcription/worker.ts")],
	outdir: OUT_DIR,
	target: "browser",
	format: "esm",
	minify: true,
	naming: "[name].js",
	plugins: [tsAlias, externWasm],
});

if (!result.success) {
	console.error("transcription worker build failed");
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

for (const output of result.outputs) {
	const name = output.path.split(/[\\/]/).pop() ?? "";
	if (name !== "worker.js") {
		throw new Error(
			`打包器给 worker 起了别的名字（${name}）—— 改 naming 或改 service.ts 里的 URL`,
		);
	}
}

/* wasm 运行时：胶水 .mjs 由 worker 运行时动态 import，.wasm 由胶水自己取 */
const RUNTIME_FILES = [
	"ort-wasm-simd-threaded.jsep.mjs",
	"ort-wasm-simd-threaded.jsep.wasm",
];
for (const file of RUNTIME_FILES) {
	await cp(join(ORT_DIST, file), join(OUT_DIR, file));
}

const size = await Bun.file(join(OUT_DIR, "worker.js")).size;
console.log(
	`transcription worker: ${(size / 1024 / 1024).toFixed(2)} MB (+ ort ${ortVersion})`,
);
