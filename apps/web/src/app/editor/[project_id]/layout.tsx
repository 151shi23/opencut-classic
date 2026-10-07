// 安卓移植版：静态导出只为 /editor/new/ 预渲染一个壳（真实项目 id 走 ?id= 查询参数）。
// generateStaticParams 必须由服务端段（layout/page 的服务端组件）导出，所以放在这里。
export function generateStaticParams() {
	return [{ project_id: "new" }];
}

export default function EditorLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return children;
}
