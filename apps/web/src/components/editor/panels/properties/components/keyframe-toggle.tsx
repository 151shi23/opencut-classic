import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { KeyframeIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/utils/ui";

export function KeyframeToggle({
	isActive,
	isDisabled = false,
	title,
	onToggle,
}: {
	isActive: boolean;
	isDisabled?: boolean;
	title: string;
	onToggle: () => void;
}) {
	return (
		<Button
			variant="text"
			aria-pressed={isActive}
			disabled={isDisabled}
			title={title}
			onClick={onToggle}
			/*
			 * 图标只有 14px，在手机上基本点不中（旁边就是标签文字，误点还没反应）。
			 * 用一个透明的 ::after 把命中区向四周各撑 8px，视觉尺寸和排版都不变。
			 */
			className="after:absolute after:-inset-2 after:content-[''] [&>svg]:size-3.5 relative mb-0.5"
		>
			<HugeiconsIcon
				icon={KeyframeIcon}
				className={cn(isActive && "text-primary fill-primary")}
			/>
		</Button>
	);
}
