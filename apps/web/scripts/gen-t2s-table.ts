import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/*
 * 从 OpenCC 的 TSCharacters.txt 生成逐字繁→简表。
 * 表不能手写 —— 手写查找表等于凭记忆编数据，出错时没人看得出来。
 */
const SRC = resolve(
	process.argv[2] ??
		"C:/Users/admin/Downloads/MinewaysMobile-完整打包-含内置插件/scratch/t2s/TSCharacters.txt",
);
const OUT = resolve(
	process.cwd(),
	"src/transcription/generated/t2s-characters.ts",
);

const entries: Array<[string, string]> = [];
for (const line of readFileSync(SRC, "utf8").split("\n")) {
	if (line.startsWith("#") || line.trim() === "") continue;
	const [key, values] = line.split("\t");
	if (!key || !values) continue;
	// 一行可能有多个候选简体字，取第一个就是 OpenCC 自己的默认值
	const target = values.trim().split(/\s+/)[0];
	if (!target || target === key) continue;
	entries.push([key, target]);
}

const seen = new Map<string, string>();
for (const [key, target] of entries) {
	if (seen.has(key) && seen.get(key) !== target) {
		throw new Error(`conflicting simplified form for ${key}`);
	}
	seen.set(key, target);
}

const pairs = [...seen.entries()];
if (pairs.length < 3000) {
	throw new Error(`only ${pairs.length} mappings parsed — source looks wrong`);
}

const header = `/*
 * 生成文件，不要手改：\`bun scripts/gen-t2s-table.ts <TSCharacters.txt>\`
 *
 * 数据来源：OpenCC（https://github.com/BYVoid/OpenCC）data/dictionary/TSCharacters.txt
 * 许可证：Apache-2.0 © BYVoid
 * 用途：Whisper 的中文输出是繁体，逐字映射到简体。繁→简是多对一，
 * 单字映射本身就无歧义（有歧义的是反方向简→繁，这里用不到）。
 */
`;

const body = `export const TRADITIONAL_CHARS = ${JSON.stringify(
	pairs.map(([t]) => t).join(""),
)};

export const SIMPLIFIED_CHARS = ${JSON.stringify(
	pairs.map(([, s]) => s).join(""),
)};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${header}\n${body}`);
console.log(`wrote ${pairs.length} mappings -> ${OUT}`);
