import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

const nextConfig: NextConfig = {
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	// 安卓移植：关闭 source map（省体积），全静态导出（WebViewAssetLoader 直接吃 out/ 目录）
	productionBrowserSourceMaps: false,
	output: "export",
	trailingSlash: true,
	images: {
		unoptimized: true,
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
	/*
	 * 字幕 worker 由 `bun run build:transcription-worker` 单独打进 public/，
	 * 不交给 Turbopack —— 它会把 `new Worker(new URL("./worker.ts", import.meta.url))`
	 * 当成静态资源原样发出未编译的 TypeScript，这功能在静态导出里从来没跑起来过。
	 */
};

export default withContentCollections(withBotId(nextConfig));
