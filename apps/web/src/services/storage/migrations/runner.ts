import {
	IndexedDBAdapter,
	deleteDatabase,
} from "@/services/storage/indexeddb-adapter";
import type { StorageMigration } from "./base";
import type { ProjectRecord } from "./transformers/types";
import { getProjectId, isRecord } from "./transformers/utils";

export interface StorageMigrationResult {
	migratedCount: number;
}

export interface MigrationProgress {
	isMigrating: boolean;
	fromVersion: number | null;
	toVersion: number | null;
	projectName: string | null;
}

let hasCleanedUpMetaDb = false;

const MIN_MIGRATION_DISPLAY_MS = 1000;

export async function runStorageMigrations({
	migrations,
	onProgress,
}: {
	migrations: StorageMigration[];
	onProgress?: (progress: MigrationProgress) => void;
}): Promise<StorageMigrationResult> {
	// One-time cleanup: delete the old global version database
	if (!hasCleanedUpMetaDb) {
		try {
			await deleteDatabase({ dbName: "video-editor-meta" });
		} catch {
			// Ignore errors - DB might not exist
		}
		hasCleanedUpMetaDb = true;
	}

	// 安卓移植补丁：classic 快照里这里用了旧的位置参数调用，与 Adapter 的对象签名不一致
	const projectsAdapter = new IndexedDBAdapter<ProjectRecord>({
		dbName: "video-editor-projects",
		storeName: "projects",
		version: 1,
	});

	const projects = await projectsAdapter.getAll();

	const orderedMigrations = [...migrations].sort((a, b) => a.from - b.from);
	let migratedCount = 0;
	const failedProjectIds: string[] = [];
	let migrationStartTime: number | null = null;

	for (const project of projects) {
		if (typeof project !== "object" || project === null) {
			continue;
		}

		let projectRecord = project as ProjectRecord;
		const projectId = getProjectId({ project: projectRecord });
		if (!projectId) {
			continue;
		}

		/*
		 * 只有"看起来像个工程"才进迁移流程。以前没有任何形状检查，一条只剩 id 的
		 * 坏记录会被 getProjectVersion 认成 v0，迁移器一路给它补出 metadata、
		 * scenes、settings —— 于是"工程损坏"被静默改写成"工程变空了"，
		 * 用户以为剪映把内容吞了，实际上我们替它伪造了一份新数据。
		 */
		if (!looksLikeProject({ project: projectRecord })) {
			console.error(
				"[migrations] Skipping record that is not a project (no version, metadata, scenes or name):",
				projectId,
			);
			failedProjectIds.push(projectId);
			continue;
		}

		let currentVersion = getProjectVersion({ project: projectRecord });
		const targetVersion = orderedMigrations.at(-1)?.to ?? currentVersion;

		if (currentVersion >= targetVersion) {
			continue;
		}

		// Track when we first showed the migration dialog
		if (migrationStartTime === null) {
			migrationStartTime = Date.now();
		}

		const projectName = getProjectName({ project: projectRecord });
		onProgress?.({
			isMigrating: true,
			fromVersion: currentVersion,
			toVersion: targetVersion,
			projectName,
		});

		try {
			for (const migration of orderedMigrations) {
				if (migration.from !== currentVersion) {
					continue;
				}

				const result = await migration.run({
					projectId,
					project: projectRecord,
				});

				if (result.skipped) {
					break;
				}

				await projectsAdapter.set({ key: projectId, value: result.project });
				migratedCount++;
				currentVersion = migration.to;
				projectRecord = result.project;
			}
		} catch (error) {
			/*
			 * 单个工程迁移失败不能把整批带走：这里 throw 出去会让上层缓存住一个
			 * rejected promise，之后所有工程加载永久失败（毒化）。记下 id、跳过它，
			 * 让其它工程正常升级。
			 */
			console.error(`Failed to migrate project ${projectId}:`, error);
			failedProjectIds.push(projectId);
		}
	}

	// Ensure dialog is visible for minimum time so users can see it
	if (migrationStartTime !== null) {
		const elapsed = Date.now() - migrationStartTime;
		if (elapsed < MIN_MIGRATION_DISPLAY_MS) {
			await new Promise((resolve) =>
				setTimeout(resolve, MIN_MIGRATION_DISPLAY_MS - elapsed),
			);
		}
	}

	onProgress?.({
		isMigrating: false,
		fromVersion: null,
		toVersion: null,
		projectName: null,
	});

	if (failedProjectIds.length > 0) {
		console.error(
			`Storage migrations skipped ${failedProjectIds.length} broken project(s):`,
			failedProjectIds,
		);
	}

	return { migratedCount };
}

/**
 * 一条记录值不值得当工程来迁移：至少要有版本号、scenes、metadata 或 v0 的顶层 name。
 * 一个都没有的（只剩 id 的坏记录、别的模块误写进同一个 store 的数据）不是工程，
 * 迁移器也不该给它凭空补出一份 —— 补出来就等于把"损坏"洗成了"空工程"。
 */
export function looksLikeProject({ project }: { project: ProjectRecord }): boolean {
	if (typeof project.version === "number") return true;
	if (Array.isArray(project.scenes)) return true;
	if (isRecord(project.metadata)) return true;
	if (typeof project.name === "string") return true;
	return false;
}

function getProjectVersion({ project }: { project: ProjectRecord }): number {
	const versionValue = project.version;

	// v2 and up - has explicit version field
	if (typeof versionValue === "number") {
		return versionValue;
	}

	// v1 - has scenes array
	const scenesValue = project.scenes;
	if (Array.isArray(scenesValue) && scenesValue.length > 0) {
		return 1;
	}

	// v0 - no scenes
	return 0;
}

function getProjectName({
	project,
}: {
	project: ProjectRecord;
}): string | null {
	const metadata = project.metadata;
	if (isRecord(metadata) && typeof metadata.name === "string") {
		return metadata.name;
	}

	// v0 had name directly on project
	if (typeof project.name === "string") {
		return project.name;
	}

	return null;
}
