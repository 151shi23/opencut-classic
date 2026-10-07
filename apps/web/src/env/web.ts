import { z } from "zod";

// 安卓移植版：原版在这里硬校验 8 个服务端变量（DATABASE_URL / BETTER_AUTH_SECRET /
// UPSTASH_* / MARBLE_* / FREESOUND_*），缺失会在预渲染根布局时抛错，静态导出直接失败。
// 本版本完全离线运行，这些服务端依赖全部裁掉，只保留客户端需要的两个，且全部给默认值。
const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
	NEXT_PUBLIC_MARBLE_API_URL: z.url().optional(),
	// 音效库：打包时通过环境变量注入，静态导出会把它内联进客户端 bundle。
	// 不配也能跑，只是音效面板会提示「未配置 API Key」。
	NEXT_PUBLIC_FREESOUND_API_KEY: z.string().min(1).optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const webEnv = webEnvSchema.parse(process.env);
