/*
 * 按像素宽度给一行文字找断点。
 *
 * 中文没有空格，只能逐字断；拉丁词整词断，断在空格处。所以先把一行切成
 * 「空白 / 拉丁词 / 单个其他字符」三种段，再贪心装填：装不下就换行。
 * 单个段本身就比框还宽时（超长 URL、连续字母）再按字符硬切，否则会死循环。
 */

const SEGMENT_PATTERN =
	/(?:\s+|[0-9A-Za-zÀ-ÖØ-öø-ÿ]+(?:[-'’][0-9A-Za-zÀ-ÖØ-öø-ÿ]+)*|[^\s0-9A-Za-zÀ-ÖØ-öø-ÿ])/g;

function splitIntoSegments({ line }: { line: string }): string[] {
	return line.match(SEGMENT_PATTERN) ?? [];
}

function isWhitespace({ segment }: { segment: string }): boolean {
	return /^\s+$/.test(segment);
}

export function wrapLine({
	line,
	maxWidthPx,
	measure,
}: {
	line: string;
	maxWidthPx: number;
	measure: ({ text }: { text: string }) => number;
}): string[] {
	if (!Number.isFinite(maxWidthPx) || maxWidthPx <= 0) {
		return [line];
	}
	if (measure({ text: line }) <= maxWidthPx) {
		return [line];
	}

	const wrapped: string[] = [];
	let current = "";

	const pushCurrent = () => {
		const trimmed = current.trimEnd();
		if (trimmed) {
			wrapped.push(trimmed);
		}
		current = "";
	};

	for (const segment of splitIntoSegments({ line })) {
		const candidate = current + segment;
		// 换行处不算行尾空格：中文排版里 "，" 后面留白会把框撑破
		if (current !== "" && measure({ text: candidate.trimEnd() }) > maxWidthPx) {
			pushCurrent();
			if (isWhitespace({ segment })) {
				continue;
			}
		}
		current += segment;

		// 段本身就超宽（一个没有空格的长词）：继续按字符硬切
		if (measure({ text: current }) > maxWidthPx) {
			while (measure({ text: current }) > maxWidthPx && current.length > 1) {
				let cut = 1;
				while (
					cut < current.length &&
					measure({ text: current.slice(0, cut + 1) }) <= maxWidthPx
				) {
					cut += 1;
				}
				wrapped.push(current.slice(0, cut));
				current = current.slice(cut);
			}
		}
	}

	pushCurrent();
	return wrapped.length > 0 ? wrapped : [line];
}

export function wrapTextContent({
	content,
	maxWidthPx,
	measure,
}: {
	content: string;
	maxWidthPx: number;
	measure: ({ text }: { text: string }) => number;
}): string[] {
	const hardLines = content.split("\n");
	if (!Number.isFinite(maxWidthPx) || maxWidthPx <= 0) {
		return hardLines;
	}
	return hardLines.flatMap((line) =>
		wrapLine({ line, maxWidthPx, measure }),
	);
}
