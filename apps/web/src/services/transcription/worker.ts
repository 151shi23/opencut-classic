import {
	env,
	pipeline,
	type AutomaticSpeechRecognitionPipeline,
	type AutomaticSpeechRecognitionOutput,
} from "@huggingface/transformers";
import type { TranscriptionSegment } from "@/transcription/types";
import { toSimplified } from "@/transcription/to-simplified";
import {
	DEFAULT_CHUNK_LENGTH_SECONDS,
	DEFAULT_STRIDE_SECONDS,
	DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
} from "@/transcription/audio";
import { findSpeechRegions } from "@/transcription/speech-regions";

/*
 * 权重和 wasm 运行时都从站内取，不碰 huggingface.co（大陆直连不通）。
 * 顺序是「先 APK 里打包到的 /models/，取不到再回落 hf-mirror」，所以没打包到的
 * 更大模型仍然能用，只是要下载。
 */
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.localModelPath = "/models/";
env.remoteHost = "https://hf-mirror.com";
/*
 * 类型上 backends.onnx 是 Partial<Env>，wasm 可省；运行时它一定在，所以宁可在这里
 * 硬失败，也不要用 `!` 骗过 typecheck —— 真缺了的话后面每次推理都会莫名其妙地挂。
 */
const wasm = env.backends.onnx.wasm;
if (!wasm) {
	throw new Error("onnxruntime-web wasm backend is unavailable");
}
wasm.wasmPaths = "/transcription/";
/*
 * 关掉 transformers 的 Cache Storage。实测本地权重加载完，77MB 的 onnx 会被原样
 * 复制进 caches 里的 transformers-cache —— 手机上白占一倍存储；更糟的是它先查缓存
 * 再查本地文件，日后 APK 里换了模型，旧的缓存还会把新文件盖掉。
 */
env.useBrowserCache = false;
// 我们本身就是 worker，再开一层 proxy 只会多一跳拷贝
wasm.proxy = false;
/*
 * 线程数只在真拿到 SharedArrayBuffer 时才有意义（没有 COOP/COEP 就一定是 1）。
 * 实测这条基本不是瓶颈：同一段音频 4 线程 22.7s、单线程 24.9s —— 解码是自回归的，
 * 并不了行。所以不去给 WebView 加隔离头冒险，省下来的力气放在少解码几个 token 上。
 */
const HARDWARE_CONCURRENCY =
	(typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2;
wasm.numThreads = self.crossOriginIsolated
	? Math.min(4, HARDWARE_CONCURRENCY)
	: 1;

/*
 * 语言写死，不再由面板决定。两件事同时成立才需要这样：
 * ① 「自动检测」在这个栈里是假的 —— 不给 language 就固定按英语解码（控制台会打
 *   "No language specified - defaulting to English"）；
 * ② 给对了 zh，碰上背景音乐/音效时解码仍会跑偏成别的语言（用户实测：波兰语）。
 * 引擎侧拦不住：`<|zh|>` 只是前缀 token，而 transformers.js 里 suppress_tokens 的
 * 处理器整段是注释掉的（`transformers.js:13576`），压不住非中文 token。
 * 所以语言约束只能落在结果层 —— 见下面 CHINESE。
 */
const LANGUAGE = "zh";

/**
 * 汉字三段：扩展 A 3400-4DBF、基本区 4E00-9FFF、兼容表意 F900-FAFF。一个都不沾
 * 就当这条不是中文。边界必须按码位而不是字形来定 —— `豈` 同时存在于 U+8C48 和
 * U+F900，看着一样但分属两段，照字形圈会把 Yi 音节、阿拉伯 Presentation Form 纳进来。
 */
const CHINESE = /[㐀-䶿一-鿿豈-﫿]/;

/**
 * 每秒音频最多生成多少个 token。Whisper 的 generation_config 写的是 max_length
 * 448，一旦进入复读（实测一段合成语音被念成「你不懂我懂你不懂…」92 字），就会把
 * 448 步全部跑满 —— 手机上就是白等几十秒。6 token/秒是 transformers.js 给
 * moonshine 用的那条经验值，正常语音到不了这个密度，只有跑飞时才会撞上。
 */
const TOKENS_PER_SECOND = 6;
const MIN_TOKENS_PER_REGION = 24;

export type WorkerMessage =
	| { type: "init"; modelId: string }
	| { type: "transcribe"; audio: Float32Array }
	| { type: "cancel" };

export type WorkerResponse =
	| { type: "init-progress"; progress: number }
	| { type: "init-complete" }
	| { type: "init-error"; error: string }
	| { type: "transcribe-progress"; progress: number }
	| {
			type: "transcribe-complete";
			text: string;
			segments: TranscriptionSegment[];
	  }
	| { type: "transcribe-error"; error: string }
	| { type: "cancelled" };

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let cancelled = false;
let lastReportedProgress = -1;
const fileBytes = new Map<string, { loaded: number; total: number }>();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			await handleInit({ modelId: message.modelId });
			break;
		case "transcribe":
			await handleTranscribe({ audio: message.audio });
			break;
		case "cancel":
			cancelled = true;
			self.postMessage({ type: "cancelled" } satisfies WorkerResponse);
			break;
	}
};

async function handleInit({ modelId }: { modelId: string }) {
	lastReportedProgress = -1;
	fileBytes.clear();

	try {
		transcriber = (await pipeline("automatic-speech-recognition", modelId, {
			/*
			 * q8（仓库里的 *_quantized.onnx）而不是 q4：onnx-community 的 q4 把
			 * Whisper 那张 5 万词的嵌入表留在 fp32，结果比 q8 还大（whisper-base
			 * q4 要 117MB，q8 只要 51MB），CPU/WASM 上跑起来也更慢。
			 */
			dtype: "q8",
			device: "auto",
			progress_callback: (progressInfo: {
				status?: string;
				file?: string;
				loaded?: number;
				total?: number;
			}) => {
				const file = progressInfo.file;
				if (!file) return;

				const loaded = progressInfo.loaded ?? 0;
				const total = progressInfo.total ?? 0;

				if (progressInfo.status === "progress" && total > 0) {
					fileBytes.set(file, { loaded, total });
				} else if (progressInfo.status === "done") {
					const existing = fileBytes.get(file);
					if (existing) {
						fileBytes.set(file, {
							loaded: existing.total,
							total: existing.total,
						});
					}
				}

				// sum all bytes
				let totalLoaded = 0;
				let totalSize = 0;
				for (const { loaded, total } of fileBytes.values()) {
					totalLoaded += loaded;
					totalSize += total;
				}

				if (totalSize === 0) return;

				const overallProgress = (totalLoaded / totalSize) * 100;
				const roundedProgress = Math.floor(overallProgress);

				if (roundedProgress !== lastReportedProgress) {
					lastReportedProgress = roundedProgress;
					self.postMessage({
						type: "init-progress",
						progress: roundedProgress,
					} satisfies WorkerResponse);
				}
			},
		})) as unknown as AutomaticSpeechRecognitionPipeline;

		self.postMessage({ type: "init-complete" } satisfies WorkerResponse);
	} catch (error) {
		self.postMessage({
			type: "init-error",
			error: error instanceof Error ? error.message : "Failed to load model",
		} satisfies WorkerResponse);
	}
}

async function handleTranscribe({ audio }: { audio: Float32Array }) {
	if (!transcriber) {
		self.postMessage({
			type: "transcribe-error",
			error: "Model not initialized",
		} satisfies WorkerResponse);
		return;
	}

	cancelled = false;

	try {
		/*
		 * 先按能量切段：Whisper 的编码器固定吃满 30 秒窗口，一分钟时间轴里只有
		 * 十秒人声时，不切段就要跑满两三个窗口。切完之后只有真有人声的部分参与
		 * 推理，段与段之间还能回推进度（不然手机上按钮会干亮着不动）。
		 */
		const regions = findSpeechRegions({
			samples: audio,
			sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
		});

		const segments: TranscriptionSegment[] = [];

		reportTranscribeProgress(0);
		for (const [index, region] of regions.entries()) {
			if (cancelled) return;

			const from = Math.floor(region.start * DEFAULT_TRANSCRIPTION_SAMPLE_RATE);
			const to = Math.min(
				audio.length,
				Math.ceil(region.end * DEFAULT_TRANSCRIPTION_SAMPLE_RATE),
			);
			const seconds = (to - from) / DEFAULT_TRANSCRIPTION_SAMPLE_RATE;

			const rawResult = await transcriber(audio.subarray(from, to), {
				chunk_length_s: DEFAULT_CHUNK_LENGTH_SECONDS,
				stride_length_s: DEFAULT_STRIDE_SECONDS,
				language: LANGUAGE,
				return_timestamps: true,
				max_new_tokens: Math.max(
					MIN_TOKENS_PER_REGION,
					Math.ceil(seconds * TOKENS_PER_SECOND),
				),
			});

			const result: AutomaticSpeechRecognitionOutput = Array.isArray(rawResult)
				? rawResult[0]
				: rawResult;

			for (const chunk of result.chunks ?? []) {
				// Whisper 的 zh 输出是繁体，引擎侧同样干预不了，只能在落字幕前折一次
				const text = toSimplified(chunk.text).trim();
				if (!text || !chunk.timestamp || chunk.timestamp.length < 2) continue;
				// 背景音乐/音效段会整条解码成外文，压不住 token，就只能按结果文字拦
				if (!CHINESE.test(text)) continue;
				const last = segments.at(-1);
				// 复读是另一类跑飞：同一条文字连着出来两次以上，后一份是噪声不是台词
				if (last && last.text === text) continue;
				segments.push({
					text,
					start: region.start + (chunk.timestamp[0] ?? 0),
					end: region.start + (chunk.timestamp[1] ?? chunk.timestamp[0] ?? 0),
				});
			}

			reportTranscribeProgress(((index + 1) / regions.length) * 100);
		}

		if (cancelled) return;

		self.postMessage({
			type: "transcribe-complete",
			text: segments.map((segment) => segment.text).join(" "),
			segments,
		} satisfies WorkerResponse);
	} catch (error) {
		if (cancelled) return;
		self.postMessage({
			type: "transcribe-error",
			error: error instanceof Error ? error.message : "Transcription failed",
		} satisfies WorkerResponse);
	}
}

let lastTranscribeProgress = -1;
function reportTranscribeProgress(progress: number) {
	const rounded = Math.floor(progress);
	if (rounded === lastTranscribeProgress) return;
	lastTranscribeProgress = rounded;
	self.postMessage({
		type: "transcribe-progress",
		progress: rounded,
	} satisfies WorkerResponse);
}
