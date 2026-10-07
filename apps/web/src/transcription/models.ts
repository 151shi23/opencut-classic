import type {
	TranscriptionModel,
	TranscriptionModelId,
} from "./types";

/*
 * 手机端只有 whisper-base 的 q8 权重打在 APK 里（public/models/，约 73MB），
 * 其余模型本地取不到，会走 hf-mirror 现下载 —— 能用，但慢且吃流量。
 * 所以默认必须是 base，别让用户在手机上误下一个 200MB 的模型。
 */
export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
	{
		id: "whisper-tiny",
		name: "Tiny",
		huggingFaceId: "onnx-community/whisper-tiny",
		description: "Fastest, lower accuracy",
	},
	{
		id: "whisper-base",
		name: "Base",
		huggingFaceId: "onnx-community/whisper-base",
		description: "Bundled in the app, no download needed",
	},
	{
		id: "whisper-small",
		name: "Small",
		huggingFaceId: "onnx-community/whisper-small",
		description: "Good balance of speed and accuracy",
	},
	{
		id: "whisper-medium",
		name: "Medium",
		huggingFaceId: "onnx-community/whisper-medium",
		description: "Higher accuracy, slower",
	},
	{
		id: "whisper-large-v3-turbo",
		name: "Large v3 Turbo",
		huggingFaceId: "onnx-community/whisper-large-v3-turbo",
		description: "Best accuracy, requires WebGPU for good performance",
	},
];

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptionModelId =
	"whisper-base";
