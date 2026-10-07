import { resolve } from "node:path";

/*
 * 字幕识别的本地探针：起一个静态服务器，页面直接拉起 public/transcription/worker.js，
 * 走「加载权重 → 推理」，用来在真机之前确认打包链路（worker.js / ort 胶水 / wasm /
 * 站内权重）对得上，并且拿得到可复现的耗时数字。
 *
 *   bun scripts/asr-probe.ts                                   # 带 COOP/COEP（多线程可用）
 *   PROBE_ISOLATE=0 bun scripts/asr-probe.ts                    # 不带隔离头，复现 WebView 单线程
 *   PROBE_ISOLATE=0 PROBE_MODEL=onnx-community/whisper-small bun scripts/asr-probe.ts
 *
 * 测试素材放 public/（都是临时的，正式构建前必须删）：
 *   zh-sample.wav  真人 TTS 中文 15.4s
 *   bgm-0.55.wav   同一段语音 + 中等强度合成音乐床（三正弦和弦 + 粉噪）
 *   bgm-1.6.wav    同上一档更强音乐床 —— 就是「一有背景音乐就翻车」那个场景
 */

const ROOT = resolve(import.meta.dirname, "..", "public");
const PORT = Number(process.env.PROBE_PORT ?? 4599);
const MODEL_ID = process.env.PROBE_MODEL ?? "onnx-community/whisper-base";
const ISOLATE = process.env.PROBE_ISOLATE === "0" ? false : true;

const PROBE_HTML = /* html */ `<!doctype html>
<meta charset="utf-8"><title>ASR probe</title>
<body style="font:14px/1.6 monospace;padding:16px;background:#111;color:#eee">
<p>model=<b>${MODEL_ID}</b> crossOriginIsolated=<b id="iso"></b> cores=<b id="cores"></b></p>
<button id="load">1 加载模型</button>
<button id="tone">2 合成音 6 秒</button>
<button id="speech">3 真人语音样本</button>
<button id="speech4">4 样本拼接 4 份</button>
<button id="gap">5 样本+12秒静音+样本</button>
<button id="bgm1">6 语音+BGM 中</button>
<button id="bgm2">7 语音+BGM 强</button>
<button id="sparse">8 稀疏 48 秒</button>
<button id="gappy">9 间隙2秒 ×4（合并杠杆）</button>
<pre id="log" style="white-space:pre-wrap"></pre>
<script>
const log = (m) => { document.getElementById("log").textContent += m + "\\n"; console.log("[probe]", m); };
document.getElementById("iso").textContent = String(self.crossOriginIsolated);
document.getElementById("cores").textContent = String(navigator.hardwareConcurrency);
let worker, ready = false, busy = false;
worker = new Worker("/transcription/worker.js", { type: "module" });
worker.onmessage = (e) => {
  const d = e.data;
  if (d.type === "init-progress" && d.progress % 25 === 0) log("init " + d.progress + "%");
  if (d.type === "init-complete") { ready = true; log("模型就绪"); }
  if (d.type === "init-error") log("模型失败: " + d.error);
  if (d.type === "transcribe-complete") {
    busy = false;
    const text = d.text || "";
    const chars = text.trim().length;
    const secs = (performance.now() - runT0) / 1000;
    const last = d.segments[d.segments.length - 1];
    const audio = last ? last.end : 0;
    log("文本[" + chars + "字]: " + text);
    log("段数 " + d.segments.length + " 用时 " + secs.toFixed(1) + "s → " +
        (audio > 0 ? (secs / audio).toFixed(2) : "?") + " 秒/秒音频");
    // 语言跑偏的量化：汉字占比（码位区间用数字写，理由见 worker.ts 里 CHINESE 的注释）
    const cjk = [...text].filter((c) => {
      const p = c.codePointAt(0);
      return (p >= 0x3400 && p <= 0x4dbf) || (p >= 0x4e00 && p <= 0x9fff) || (p >= 0xf900 && p <= 0xfaff);
    }).length;
    log("汉字占比 " + (chars ? Math.round(100 * cjk / chars) : 0) + "%");
  }
  if (d.type === "transcribe-error") { busy = false; log("推理失败: " + d.error); }
};
worker.onerror = (e) => { busy = false; log("worker 崩了: " + (e.message || "未知")); };
document.getElementById("load").onclick = () => {
  const t0 = performance.now();
  worker.postMessage({ type: "init", modelId: "${MODEL_ID}" });
  worker.addEventListener("message", function once(e) {
    if (e.data.type === "init-complete" || e.data.type === "init-error") {
      worker.removeEventListener("message", once);
      log("加载耗时 " + ((performance.now() - t0) / 1000).toFixed(1) + "s");
    }
  });
};
let runT0 = 0;
function run(samples) {
  if (!ready) return log("模型还没好");
  if (busy) return log("上一次还没跑完");
  busy = true;
  runT0 = performance.now();
  const seconds = samples.length / 16000;
  log("推理 " + seconds.toFixed(1) + " 秒音频…");
  worker.postMessage({ type: "transcribe", audio: samples });
}
function tone(seconds) {
  const n = 16000 * seconds, a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = 0.02 * Math.sin(2 * Math.PI * 220 * i / 16000);
  return a;
}
async function load16k(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " → " + res.status);
  const buf = await res.arrayBuffer();
  const ctx = new AudioContext({ sampleRate: 16000 });
  const decoded = await ctx.decodeAudioData(buf);
  const src = decoded.getChannelData(0);
  const out = new Float32Array(src.length);
  out.set(src);
  await ctx.close();
  return out;
}
const cache = {};
async function sample(name) {
  cache[name] = cache[name] || (await load16k(name));
  return cache[name];
}
document.getElementById("tone").onclick = () => run(tone(6));
document.getElementById("speech").onclick = async () => run(await sample("/zh-sample.wav"));
document.getElementById("speech4").onclick = async () => {
  const cached = await sample("/zh-sample.wav");
  const joined = new Float32Array(cached.length * 4);
  for (let i = 0; i < 4; i++) joined.set(cached, i * cached.length);
  run(joined);
};
/* 中间塞 12 秒纯静音：VAD 生效的话，耗时应接近跑两遍样本而不是一遍半 */
document.getElementById("gap").onclick = async () => {
  const cached = await sample("/zh-sample.wav");
  const gap = new Float32Array(16000 * 12);
  const joined = new Float32Array(cached.length * 2 + gap.length);
  joined.set(cached, 0);
  joined.set(gap, cached.length);
  joined.set(cached, cached.length + gap.length);
  run(joined);
};
document.getElementById("bgm1").onclick = async () => run(await sample("/bgm-0.55.wav"));
document.getElementById("bgm2").onclick = async () => run(await sample("/bgm-1.6.wav"));
/* 48 秒里只有约 18 秒有声：段与段之间的静音最能体现「每次编码器前向划不划算」 */
document.getElementById("sparse").onclick = async () => run(await sample("/sparse.wav"));
/* 24 秒、四段语音之间夹 2 秒停顿：合并间隙这条杠杆的专用素材 */
document.getElementById("gappy").onclick = async () => run(await sample("/gappy.wav"));
</script>
`;

const ISOLATION_HEADERS: Record<string, string> = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "require-corp",
	"Cross-Origin-Resource-Policy": "same-origin",
};

Bun.serve({
	port: PORT,
	async fetch(req) {
		const path = new URL(req.url).pathname;
		const headers: Record<string, string> = {
			...(ISOLATE ? ISOLATION_HEADERS : {}),
			"Cache-Control": "no-store",
		};
		if (path === "/") {
			return new Response(PROBE_HTML, {
				headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
			});
		}
		const file = Bun.file(joinPath(path));
		if (!(await file.exists())) {
			return new Response("not found: " + path, {
				status: 404,
				headers: { ...headers, "Content-Type": "text/plain" },
			});
		}
		return new Response(file, { headers });
	},
});

function joinPath(path: string): string {
	/* 只允许 public/ 里的相对路径，挡掉 .. 跳出 */
	const target = resolve(ROOT, "." + path);
	if (!target.startsWith(ROOT)) {
		throw new Error(`越界路径：${path}`);
	}
	return target;
}

console.log(
	`ASR probe: http://localhost:${PORT} root=${ROOT} isolate=${ISOLATE ? "on" : "off"} model=${MODEL_ID}`,
);
