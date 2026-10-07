import { readFileSync } from "node:fs";

import { findSpeechRegions } from "../src/transcription/speech-regions";

function pcm16ToFloat32(path: string): {
	samples: Float32Array;
	sampleRate: number;
} {
	const bytes = readFileSync(path);
	/*
	 * 采样率必须从 fmt 块读，不能假定 16k —— zh-sample.wav 是 TTS 出的 22.05kHz，
	 * 按 16k 解析会把时间轴整体拉长 1.377 倍，段边界全是错的。
	 */
	const fmtIndex = bytes.indexOf("fmt ");
	const sampleRate = bytes.readUInt32LE(fmtIndex + 12);
	const dataIndex = bytes.indexOf("data");
	const size = bytes.readUInt32LE(dataIndex + 4);
	const start = dataIndex + 8;
	const raw = new Float32Array(size / 2);
	for (let i = 0; i < raw.length; i++) {
		raw[i] = bytes.readInt16LE(start + i * 2) / 32768;
	}
	if (sampleRate === 16000) return { samples: raw, sampleRate };
	// 应用喂进 worker 前一定重采样到 16k，这里做同样的最近邻抽样，量的是运行时看到的信号
	const out = new Float32Array(Math.round((raw.length * 16000) / sampleRate));
	for (let i = 0; i < out.length; i++) {
		out[i] = raw[Math.min(raw.length - 1, Math.round((i * sampleRate) / 16000))];
	}
	return { samples: out, sampleRate: 16000 };
}

for (const name of ["zh-sample", "bgm-0.55", "bgm-1.6", "sparse", "gappy"]) {
	const path = new URL(`../public/${name}.wav`, import.meta.url).pathname.replace(
		/^\/([A-Za-z]:)/,
		"$1",
	);
	const { samples, sampleRate } = pcm16ToFloat32(path);
	const regions = findSpeechRegions({ samples, sampleRate });
	const speech = regions.reduce((a, r) => a + (r.end - r.start), 0);
	const seconds = samples.length / sampleRate;
	console.log(
		`${name.padEnd(10)} 音频 ${seconds.toFixed(1).padStart(5)}s  段数 ${String(regions.length).padStart(2)}  ` +
			`有声 ${speech.toFixed(1).padStart(5)}s  覆盖 ${(100 * speech / seconds).toFixed(0)}%`,
	);
	console.log(
		`           ${regions.map((r) => `${r.start.toFixed(1)}-${r.end.toFixed(1)}`).join(" ")}`,
	);
}
