"use client";

// 安卓移植版：原落地页是服务端组件（构建期要联网拉 Marble CMS / 遥测），
// 离线静态版用不到官网 —— 直接进项目列表。
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
	const router = useRouter();

	useEffect(() => {
		router.replace("/projects/");
	}, [router]);

	return (
		<div className="bg-background flex h-screen w-screen items-center justify-center">
			<p className="text-muted-foreground text-sm">Loading OpenCut…</p>
		</div>
	);
}
