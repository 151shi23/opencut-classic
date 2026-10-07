/*
 * 极简能量 VAD：把整条音频切成「有声音的区段」，静音段整段不喂给 Whisper。
 *
 * 为什么值得做：Whisper 的编码器固定吃满 30 秒窗口，一分钟时间轴里哪怕只有
 * 十秒人声，不做切分也要跑满两三个窗口；手机端一个窗口就是十几秒。切完之后
 * 只有真正有人声的区段参与推理，时间还顺便变成了可汇报进度的离散单位。
 *
 * 不做词级/句级判断，也不追求切得准：宁可多留一点边界（PAD / MERGE_GAP 都偏宽），
 * 也不要把一句话说断——切错一句的代价比多算半秒大得多。
 */

export interface SpeechRegion {
	start: number;
	end: number;
}

const BLOCK_SECONDS = 0.5;
/** 短于这个时长的块直接丢掉（咳嗽、爆音、单字噪声） */
const MIN_REGION_SECONDS = 0.4;
/*
 * 两个块之间静音不超过这个秒数就并成同一段。1.5 → 3.0 的依据是成本结构：每段都要
 * 跑满一次 30 秒编码器前向，实测稀疏素材 4 段花 15.6s（≈每段 3.9s），跟段长几乎无关，
 * 所以「少切几刀」比「切得准」更值钱 —— 2 秒停顿的素材从 4 段并成 1 段就是约 4 倍。
 * 代价是被并进来的静音也在窗口里，Whisper 对纯静音会幻觉；这两处由 worker 里的
 * 汉字占比拦截和重复句丢弃兜住，不是靠这里保证的。
 * 最短段仍然保持 0.4s：它是加完前后余量之后判的，抬高就会把「开始」这种短但真实的
 * 台词整条丢掉，切错一句的代价比多算三秒大得多。
 */
const MERGE_GAP_SECONDS = 3;
/** 每段前后各留一点余量，避免把首尾半个字切掉 */
const PAD_SECONDS = 0.25;
/** 绝对地板：约 -54 dBFS，低于它一律当静音 */
const ABSOLUTE_FLOOR = 0.002;
/** 相对地板：整段最响块的这个比例以下当静音（适应音量很小的素材） */
const RELATIVE_FLOOR = 0.12;

export function findSpeechRegions({
	samples,
	sampleRate,
}: {
	samples: Float32Array;
	sampleRate: number;
}): SpeechRegion[] {
	const blockLength = Math.max(1, Math.round(BLOCK_SECONDS * sampleRate));
	const blockCount = Math.ceil(samples.length / blockLength);
	if (blockCount === 0) return [];

	const levels = new Float32Array(blockCount);
	let peak = 0;
	for (let block = 0; block < blockCount; block++) {
		const from = block * blockLength;
		const to = Math.min(samples.length, from + blockLength);
		let sum = 0;
		for (let i = from; i < to; i++) sum += samples[i] * samples[i];
		const rms = Math.sqrt(sum / Math.max(1, to - from));
		levels[block] = rms;
		if (rms > peak) peak = rms;
	}

	const threshold = Math.max(ABSOLUTE_FLOOR, peak * RELATIVE_FLOOR);

	const regions: SpeechRegion[] = [];
	let openStart = -1;
	let lastLoudBlock = -1;

	const close = (endBlock: number) => {
		if (openStart < 0) return;
		const start = Math.max(0, openStart * BLOCK_SECONDS - PAD_SECONDS);
		const end = Math.min(
			samples.length / sampleRate,
			(endBlock + 1) * BLOCK_SECONDS + PAD_SECONDS,
		);
		if (end - start >= MIN_REGION_SECONDS) regions.push({ start, end });
		openStart = -1;
	};

	for (let block = 0; block < blockCount; block++) {
		if (levels[block] < threshold) {
			if (openStart >= 0 && block - lastLoudBlock > MERGE_GAP_SECONDS / BLOCK_SECONDS) {
				close(lastLoudBlock);
			}
			continue;
		}
		if (openStart < 0) openStart = block;
		lastLoudBlock = block;
	}
	close(lastLoudBlock);

	return regions;
}
