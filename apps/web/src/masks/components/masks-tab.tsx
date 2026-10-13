"use client";

import type { MaskableElement } from "@/timeline";
import type { Mask, MaskType, TextMask } from "@/masks/types";
import type {
	NumberParamDefinition,
	ParamValue,
	ParamValues,
	SelectParamDefinition,
} from "@/params";
import type { TimelineElement } from "@/timeline";
import {
	buildDefaultMaskInstance,
	getMaskDefinition,
	getMaskDefinitionsForMenu,
} from "@/masks";
import { useEditor } from "@/editor/use-editor";
import { useElementPreview } from "@/timeline/hooks/use-element-preview";
import { useMenuPreview } from "@/editor/use-menu-preview";
import { getVisibleElementsWithBounds } from "@/preview/element-bounds";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowExpandIcon,
	Delete02Icon,
	FeatherIcon,
	PlusSignIcon,
	RotateClockwiseIcon,
	TextFontIcon,
} from "@hugeicons/core-free-icons";
import { useContext, useMemo, useState, createContext } from "react";
import { buildMaskParamPath, resolveMaskParamsAtTime } from "@/animation/mask-param-channel";
import { useKeyframedParamProperty } from "@/components/editor/panels/properties/hooks/use-keyframed-param-property";
import { useElementPlayhead } from "@/components/editor/panels/properties/hooks/use-element-playhead";
import { KeyframeToggle } from "@/components/editor/panels/properties/components/keyframe-toggle";
import type { MediaTime } from "@/wasm";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { FontPicker } from "@/components/ui/font-picker";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NumberField } from "@/components/ui/number-field";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	clamp,
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { usePropertyDraft } from "@/components/editor/panels/properties/hooks/use-property-draft";
import {
	OcMirrorIcon,
	OcShapesIcon,
	OcTextHeightIcon,
	OcTextWidthIcon,
} from "@/components/icons";
import { cn } from "@/utils/ui";

type MasksTabProps = {
	element: MaskableElement;
	trackId: string;
};

type MaskUpdatesBuilder = ({
	key,
	value,
}: {
	key: string;
	value: ParamValue;
}) => Partial<TimelineElement>;

type MaskItemProps = {
	trackId: string;
	element: MaskableElement;
	elementId: string;
	mask: Mask;
	buildUpdates: MaskUpdatesBuilder;
	previewParam: (key: string) => (value: number | string | boolean) => void;
	onCommit: () => void;
};

/**
 * 遮罩数值参数从这里拿到"该往哪条关键帧通道写"。
 * 用 context 而不是给每个字段加 prop：这个面板里 MaskNumberField 有十几个调用点，
 * 逐个改既啰嗦又容易漏掉一两个 —— 漏掉的那几个就会变成"能显示不能动画"。
 */
type MaskKeyframeScope = {
	element: MaskableElement;
	trackId: string;
	maskId: string;
	localTime: MediaTime;
	isPlayheadWithinElementRange: boolean;
	buildUpdates: MaskUpdatesBuilder;
};

const MaskKeyframeScopeContext = createContext<MaskKeyframeScope | null>(null);

type EmptyViewProps = {
	onAddMask: () => void;
};

type PreviewParamHandler = (
	key: string,
) => (value: number | string | boolean) => void;

type RegisteredMaskDefinition = ReturnType<typeof getMaskDefinition>;

function isTextMask(mask: Mask): mask is TextMask {
	return mask.type === "text";
}

function withPreviewedMaskParam({
	mask,
	key,
	value,
}: {
	mask: Mask;
	key: string;
	value: number | string | boolean;
}): Mask {
	switch (mask.type) {
		case "split":
			return { ...mask, params: { ...mask.params, [key]: value } };
		case "cinematic-bars":
			return { ...mask, params: { ...mask.params, [key]: value } };
		case "rectangle":
			return { ...mask, params: { ...mask.params, [key]: value } };
		case "ellipse":
			return { ...mask, params: { ...mask.params, [key]: value } };
		case "heart":
			return { ...mask, params: { ...mask.params, [key]: value } };
		case "diamond":
			return { ...mask, params: { ...mask.params, [key]: value } };
		case "star":
			return { ...mask, params: { ...mask.params, [key]: value } };
		case "text":
			return { ...mask, params: { ...mask.params, [key]: value } };
		case "freeform":
			return { ...mask, params: { ...mask.params, [key]: value } };
	}
}

export function MasksTab({ element, trackId }: MasksTabProps) {
	const editor = useEditor();
	const { renderElement, previewUpdates, commit } =
		useElementPreview<MaskableElement>({
			trackId,
			elementId: element.id,
			fallback: element,
		});
	const maskDefs = getMaskDefinitionsForMenu();
	const tracks = useEditor(
		(e) => e.timeline.getPreviewTracks() ?? e.scenes.getActiveScene().tracks,
	);
	const currentTime = useEditor((e) => e.playback.getCurrentTime());
	const mediaAssets = useEditor((e) => e.media.getAssets());
	const canvasSize = useEditor(
		(e) => e.project.getActive().settings.canvasSize,
	);
	const masks = element.masks ?? [];
	const renderMasks = renderElement.masks ?? masks;
	const hasMask = masks.length > 0;
	const { onPointerLeave, onOpenChange, markCommitted } = useMenuPreview();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const elementBounds = useMemo(() => {
		const clampedTime = Math.min(
			Math.max(currentTime, element.startTime),
			element.startTime + element.duration - 1,
		);

		return (
			getVisibleElementsWithBounds({
				tracks,
				currentTime: clampedTime,
				canvasSize,
				mediaAssets,
			}).find(
				(item) => item.trackId === trackId && item.elementId === element.id,
			)?.bounds ?? null
		);
	}, [
		canvasSize,
		currentTime,
		element.duration,
		element.id,
		element.startTime,
		mediaAssets,
		trackId,
		tracks,
	]);

	const handleDropdownOpenChange = (open: boolean) => {
		if (hasMask && open) return;
		setIsDropdownOpen(open);
		onOpenChange(open);
	};

	const previewMask = ({ maskType }: { maskType: MaskType }) => {
		editor.timeline.previewElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: {
						masks: [
							buildDefaultMaskInstance({
								maskType,
								elementSize: elementBounds
									? {
											width: elementBounds.width,
											height: elementBounds.height,
										}
									: undefined,
							}),
						],
					} as Partial<MaskableElement>,
				},
			],
		});
	};

	const commitMask = ({ maskType }: { maskType: MaskType }) => {
		if (editor.timeline.isPreviewActive()) {
			editor.timeline.commitPreview();
		} else {
			editor.timeline.updateElements({
				updates: [
					{
						trackId,
						elementId: element.id,
						patch: {
							masks: [
								buildDefaultMaskInstance({
									maskType,
									elementSize: elementBounds
										? {
												width: elementBounds.width,
												height: elementBounds.height,
											}
										: undefined,
								}),
							],
						} as Partial<MaskableElement>,
					},
				],
			});
		}
		markCommitted();
		setIsDropdownOpen(false);
	};

	const previewMaskParam =
		({ index, key }: { index: number; key: string }) =>
		(value: number | string | boolean) => {
			if (!renderMasks[index]) {
				return;
			}

			const updatedMasks = renderMasks.map((existingMask, maskIndex) =>
				maskIndex !== index
					? existingMask
					: withPreviewedMaskParam({ mask: existingMask, key, value }),
			);

			previewUpdates({ masks: updatedMasks });
		};

	return (
		<div className="flex flex-col h-full">
			<div className="border-b px-3.5 h-11 shrink-0 flex items-center justify-between gap-2">
				<SectionTitle>Masks</SectionTitle>
				<DropdownMenu
					open={hasMask ? false : isDropdownOpen}
					onOpenChange={handleDropdownOpenChange}
				>
					{hasMask ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="inline-flex">
									<Button
										variant="ghost"
										size="icon"
										disabled
										aria-label="Add mask"
									>
										<HugeiconsIcon icon={PlusSignIcon} className="size-3.5!" />
									</Button>
								</span>
							</TooltipTrigger>
							<TooltipContent className="max-w-56 text-balance">
								Only one mask is supported right now. If you need more,
								duplicate the clip and apply a different mask to each copy.
							</TooltipContent>
						</Tooltip>
					) : (
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" aria-label="Add mask">
								<HugeiconsIcon icon={PlusSignIcon} className="size-3.5!" />
							</Button>
						</DropdownMenuTrigger>
					)}
					<DropdownMenuContent className="w-40" onPointerLeave={onPointerLeave}>
						{maskDefs.map((definition) => (
							<DropdownMenuItem
								key={definition.type}
								onPointerEnter={() =>
									previewMask({ maskType: definition.type })
								}
								onClick={() => commitMask({ maskType: definition.type })}
							>
								<HugeiconsIcon {...definition.icon} />
								{definition.name}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{masks.length === 0 ? (
				<EmptyView onAddMask={() => setIsDropdownOpen(true)} />
			) : (
				masks.map((mask, index) => (
					<MaskItem
						key={mask.id}
						trackId={trackId}
						element={element}
						elementId={element.id}
						mask={renderMasks[index] ?? mask}
						buildUpdates={({ key, value }) => ({
							masks: renderMasks.map((existingMask, maskIndex) =>
								maskIndex !== index
									? existingMask
									: withPreviewedMaskParam({
											mask: existingMask,
											key,
											value,
										}),
							),
						})}
						previewParam={(paramKey) =>
							previewMaskParam({ index, key: paramKey })
						}
						onCommit={commit}
					/>
				))
			)}
		</div>
	);
}

function MaskItem({
	trackId,
	element,
	elementId,
	mask,
	buildUpdates,
	previewParam,
	onCommit,
}: MaskItemProps) {
	const editor = useEditor();
	const definition = getMaskDefinition(mask.type);
	const { localTime, isPlayheadWithinElementRange } = useElementPlayhead({
		startTime: element.startTime,
		duration: element.duration,
	});
	/*
	 * 面板显示"这一帧真正生效的参数"，和渲染端 buildMaskArtifacts 用同一个解析函数。
	 * 否则动画播到一半，滑杆还停在基准值上 —— 用户一拖就把动画改了。
	 */
	const animatedMask = {
		...mask,
		params: resolveMaskParamsAtTime({
			maskId: mask.id,
			params: mask.params as unknown as ParamValues,
			animations: element.animations,
			localTime,
		}),
	} as unknown as Mask;
	const scope: MaskKeyframeScope = {
		element,
		trackId,
		maskId: mask.id,
		localTime,
		isPlayheadWithinElementRange,
		buildUpdates,
	};

	return (
		<MaskKeyframeScopeContext.Provider value={scope}>
		<Section sectionKey={`mask-item:${mask.id}`} showTopBorder={false}>
			<SectionHeader
				trailing={
					<div className="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Toggle ${definition.name} mask inversion`}
							onClick={() =>
								editor.timeline.toggleMaskInverted({
									trackId,
									elementId,
									maskId: mask.id,
								})
							}
						>
							<OcMirrorIcon
								className={cn(mask.params.inverted && "-scale-x-100")}
							/>
						</Button>
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Remove ${definition.name} mask`}
							onClick={() =>
								editor.timeline.removeMask({
									trackId,
									elementId,
									maskId: mask.id,
								})
							}
						>
							<HugeiconsIcon icon={Delete02Icon} />
						</Button>
					</div>
				}
			>
				<div className="flex items-center gap-2">
					<HugeiconsIcon {...definition.icon} size={14} />
					<SectionTitle className="capitalize font-normal">
						{definition.name}
					</SectionTitle>
				</div>
			</SectionHeader>
			<SectionContent>
				<MaskParamsFields
					mask={animatedMask}
					definition={definition}
					previewParam={previewParam}
					onCommit={onCommit}
				/>
			</SectionContent>
		</Section>
		</MaskKeyframeScopeContext.Provider>
	);
}

function MaskParamsFields({
	mask,
	definition,
	previewParam,
	onCommit,
}: {
	mask: Mask;
	definition: RegisteredMaskDefinition;
	previewParam: PreviewParamHandler;
	onCommit: () => void;
}) {
	const featherParam = getNumberParamDefinition({
		definition,
		key: "feather",
	});
	const strokeWidthParam = getNumberParamDefinition({
		definition,
		key: "strokeWidth",
	});
	const previewNumberParam = (key: string) => (value: number) =>
		previewParam(key)(value);
	const previewStrokeColor = previewParam("strokeColor");
	const strokeAlignParam = definition.params.find(
		(param): param is SelectParamDefinition<string> =>
			param.key === "strokeAlign" && param.type === "select",
	);

	return (
		<SectionFields>
			{isTextMask(mask) ? (
				<TextMaskFields
					mask={mask}
					previewParam={previewParam}
					onCommit={onCommit}
					fontSizeParam={getNumberParamDefinition({
						definition,
						key: "fontSize",
					})}
				/>
			) : null}
			{definition.features.hasPosition &&
				"centerX" in mask.params &&
				"centerY" in mask.params && (
					<SectionField label="Position">
						<div className="flex items-center gap-2">
							<MaskNumberField
								className="flex-1"
								icon="X"
								param={getNumberParamDefinition({
									definition,
									key: "centerX",
								})}
								value={getMaskNumber({
									params: mask.params,
									key: "centerX",
								})}
								onPreview={previewNumberParam("centerX")}
								onCommit={onCommit}
							/>
							<MaskNumberField
								className="flex-1"
								icon="Y"
								param={getNumberParamDefinition({
									definition,
									key: "centerY",
								})}
								value={getMaskNumber({
									params: mask.params,
									key: "centerY",
								})}
								onPreview={previewNumberParam("centerY")}
								onCommit={onCommit}
							/>
						</div>
					</SectionField>
				)}

			{definition.features.sizeMode === "width-height" &&
				"width" in mask.params &&
				"height" in mask.params && (
					<SectionField label="Size">
						<div className="flex items-center gap-2">
							<MaskNumberField
								className="flex-1"
								icon="W"
								param={getNumberParamDefinition({
									definition,
									key: "width",
								})}
								value={getMaskNumber({
									params: mask.params,
									key: "width",
								})}
								onPreview={previewNumberParam("width")}
								onCommit={onCommit}
							/>
							<MaskNumberField
								className="flex-1"
								icon="H"
								param={getNumberParamDefinition({
									definition,
									key: "height",
								})}
								value={getMaskNumber({
									params: mask.params,
									key: "height",
								})}
								onPreview={previewNumberParam("height")}
								onCommit={onCommit}
							/>
						</div>
					</SectionField>
				)}

			{definition.features.sizeMode === "height-only" &&
				"height" in mask.params && (
					<SectionField label="Height">
						<MaskNumberField
							icon="H"
							param={getNumberParamDefinition({
								definition,
								key: "height",
							})}
							value={getMaskNumber({
								params: mask.params,
								key: "height",
							})}
							onPreview={previewNumberParam("height")}
							onCommit={onCommit}
						/>
					</SectionField>
				)}

			{definition.features.sizeMode === "width-only" &&
				"width" in mask.params && (
					<SectionField label="Width">
						<MaskNumberField
							icon="W"
							param={getNumberParamDefinition({
								definition,
								key: "width",
							})}
							value={getMaskNumber({
								params: mask.params,
								key: "width",
							})}
							onPreview={previewNumberParam("width")}
							onCommit={onCommit}
						/>
					</SectionField>
				)}

			{definition.features.sizeMode === "uniform" && "scale" in mask.params && (
				<SectionField label="Scale">
					<MaskNumberField
						icon={
							isTextMask(mask) ? <HugeiconsIcon icon={ArrowExpandIcon} /> : "S"
						}
						param={getNumberParamDefinition({
							definition,
							key: "scale",
						})}
						value={getMaskNumber({
							params: mask.params,
							key: "scale",
						})}
						onPreview={previewNumberParam("scale")}
						onCommit={onCommit}
					/>
				</SectionField>
			)}

			{definition.features.hasRotation && "rotation" in mask.params && (
				<SectionField label="Rotation">
					<MaskNumberField
						icon={<HugeiconsIcon icon={RotateClockwiseIcon} />}
						param={getNumberParamDefinition({
							definition,
							key: "rotation",
						})}
						value={getMaskNumber({
							params: mask.params,
							key: "rotation",
						})}
						onPreview={previewNumberParam("rotation")}
						onCommit={onCommit}
					/>
				</SectionField>
			)}

			<SectionField label="Feather">
				<MaskNumberField
					icon={<HugeiconsIcon icon={FeatherIcon} />}
					param={featherParam}
					value={getMaskNumber({
						params: mask.params,
						key: "feather",
					})}
					onPreview={previewNumberParam("feather")}
					onCommit={onCommit}
				/>
			</SectionField>

			<SectionField label="Stroke">
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<MaskNumberField
							className="flex-1"
							icon="W"
							param={strokeWidthParam}
							value={getMaskNumber({
								params: mask.params,
								key: "strokeWidth",
							})}
							onPreview={previewNumberParam("strokeWidth")}
							onCommit={onCommit}
						/>
						<ColorPicker
							className=""
							value={mask.params.strokeColor.replace(/^#/, "").toUpperCase()}
							onChange={(color) => previewStrokeColor(`#${color}`)}
							onChangeEnd={(color) => {
								previewStrokeColor(`#${color}`);
								onCommit();
							}}
						/>
					</div>
					{strokeAlignParam ? (
						<Select
							value={mask.params.strokeAlign}
							onValueChange={(value) => {
								previewParam("strokeAlign")(value);
								onCommit();
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{strokeAlignParam.options.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : null}
				</div>
			</SectionField>
		</SectionFields>
	);
}

const LETTER_SPACING_PARAM: NumberParamDefinition = {
	key: "letterSpacing",
	label: "Letter spacing",
	type: "number",
	default: 0,
	min: -100,
	max: 500,
	step: 1,
};

const LINE_HEIGHT_PARAM: NumberParamDefinition = {
	key: "lineHeight",
	label: "Line height",
	type: "number",
	default: 1.2,
	min: 0.1,
	max: 10,
	step: 0.1,
};

function TextMaskFields({
	mask,
	previewParam,
	onCommit,
	fontSizeParam,
}: {
	mask: TextMask;
	previewParam: PreviewParamHandler;
	onCommit: () => void;
	fontSizeParam: NumberParamDefinition;
}) {
	const content = usePropertyDraft({
		displayValue: mask.params.content,
		parse: (input) => input,
		onPreview: (value) => previewParam("content")(value),
		onCommit,
	});

	const previewNumberParam = (key: string) => (value: number) =>
		previewParam(key)(value);

	return (
		<>
			<SectionField label="Content">
				<Textarea
					value={content.displayValue}
					className="min-h-20"
					onFocus={content.onFocus}
					onChange={content.onChange}
					onBlur={content.onBlur}
				/>
			</SectionField>
			<SectionField label="Font">
				<FontPicker
					defaultValue={mask.params.fontFamily}
					onValueChange={(value) => {
						previewParam("fontFamily")(value);
						onCommit();
					}}
				/>
			</SectionField>
			<SectionField label="Size">
				<MaskNumberField
					icon={<HugeiconsIcon icon={TextFontIcon} />}
					param={fontSizeParam}
					value={mask.params.fontSize}
					onPreview={previewNumberParam("fontSize")}
					onCommit={onCommit}
				/>
			</SectionField>
			<SectionField label="Spacing">
				<div className="flex items-start gap-2">
					<MaskNumberField
						className="w-1/2"
						icon={<OcTextWidthIcon size={14} />}
						param={LETTER_SPACING_PARAM}
						value={mask.params.letterSpacing ?? 0}
						onPreview={previewNumberParam("letterSpacing")}
						onCommit={onCommit}
					/>
					<MaskNumberField
						className="w-1/2"
						icon={<OcTextHeightIcon size={14} />}
						param={LINE_HEIGHT_PARAM}
						value={mask.params.lineHeight ?? 1.2}
						onPreview={previewNumberParam("lineHeight")}
						onCommit={onCommit}
					/>
				</div>
			</SectionField>
		</>
	);
}

function getNumberParamDefinition({
	definition,
	key,
}: {
	definition: RegisteredMaskDefinition;
	key: string;
}): NumberParamDefinition {
	const param = definition.params.find((candidate) => candidate.key === key);

	if (!param || param.type !== "number") {
		throw new Error(`Missing number param definition for mask key "${key}"`);
	}

	return param;
}

function getMaskNumber<
	TParams extends Mask["params"],
	TKey extends keyof TParams & string,
>({ params, key }: { params: TParams; key: TKey }): number {
	const value = params[key];

	if (typeof value !== "number") {
		throw new Error(`Expected numeric mask param for "${key}"`);
	}

	return value;
}

function MaskNumberField({
	param,
	value,
	onPreview,
	onCommit,
	icon,
	className,
}: {
	param: NumberParamDefinition;
	value: number;
	onPreview: (value: number) => void;
	onCommit: () => void;
	icon?: React.ReactNode;
	className?: string;
}) {
	/*
	 * 有 scope（= 这个字段在遮罩面板里）就走和其它属性完全同一套关键帧机制：
	 * 菱形在当前时刻打点，已有通道时拖滑杆会自动补点。
	 */
	const scope = useContext(MaskKeyframeScopeContext);
	const animated = useKeyframedParamProperty({
		param,
		trackId: scope?.trackId ?? "",
		elementId: scope?.element.id ?? "",
		animations: scope?.element.animations,
		propertyPath: scope
			? buildMaskParamPath({ maskId: scope.maskId, paramKey: param.key })
			: undefined,
		localTime: (scope?.localTime ?? 0) as MediaTime,
		isPlayheadWithinElementRange: scope?.isPlayheadWithinElementRange ?? false,
		resolvedValue: value,
		buildBaseUpdates: ({ value: nextValue }) =>
			scope?.buildUpdates({ key: param.key, value: nextValue }) ?? {},
	});
	const previewValue = scope ? animated.onPreview : onPreview;
	const commitValue = scope ? animated.onCommit : onCommit;

	const isPercent = param.unit === "percent";
	const percentMax = param.max ?? 100;
	const displayMultiplier = isPercent
		? 100 / percentMax
		: (param.displayMultiplier ?? 1);
	const min = isPercent ? 0 : param.min;
	const max = isPercent ? 100 : param.max;
	const step = isPercent ? 1 : param.step;
	const displayValue = value * displayMultiplier;
	const maxFractionDigits = getFractionDigitsForStep({ step });

	const clampDisplay = (nextDisplayValue: number) =>
		max !== undefined
			? clamp({ value: nextDisplayValue, min, max })
			: Math.max(min, nextDisplayValue);

	const previewFromDisplay = (nextDisplayValue: number) => {
		previewValue(
			clampDisplay(snapToStep({ value: nextDisplayValue, step })) /
				displayMultiplier,
		);
	};

	const draft = usePropertyDraft({
		displayValue: formatNumberForDisplay({
			value: displayValue,
			maxFractionDigits,
		}),
		parse: (input) => {
			const parsed = parseFloat(input);
			if (Number.isNaN(parsed)) return null;
			return (
				clampDisplay(snapToStep({ value: parsed, step })) / displayMultiplier
			);
		},
		onPreview: previewValue,
		onCommit: commitValue,
	});

	const field = (
		<NumberField
			className={scope ? "min-w-0 flex-1" : className}
			icon={icon}
			value={draft.displayValue}
			dragSensitivity="slow"
			onFocus={draft.onFocus}
			onChange={draft.onChange}
			onBlur={draft.onBlur}
			onScrub={previewFromDisplay}
			onScrubEnd={commitValue}
		/>
	);

	if (!scope) {
		return field;
	}

	return (
		<div className={cn("flex w-full items-center gap-1", className)}>
			{field}
			<KeyframeToggle
				isActive={animated.isKeyframedAtTime}
				isDisabled={!scope.isPlayheadWithinElementRange}
				title={`Toggle ${param.label} keyframe`}
				onToggle={animated.toggleKeyframe}
			/>
		</div>
	);
}

function EmptyView({ onAddMask }: EmptyViewProps) {
	return (
		<div className="flex flex-col h-full items-center justify-center gap-4 text-center">
			<OcShapesIcon className="size-10 text-muted-foreground" strokeWidth={1} />
			<div className="flex flex-col gap-2">
				<h3 className="font-medium text-foreground">No masks</h3>
				<p className="text-muted-foreground text-sm text-balance max-w-40">
					Add a mask to hide or reveal parts of this layer.
				</p>
			</div>
			<Button variant="default" size="sm" onClick={onAddMask}>
				Add mask
			</Button>
		</div>
	);
}
