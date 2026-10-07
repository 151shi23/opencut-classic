import type { StorageAdapter } from "./types";

export class OPFSAdapter implements StorageAdapter<File> {
	private directoryName: string;

	constructor(directoryName = "media") {
		this.directoryName = directoryName;
	}

	private async getDirectory(): Promise<FileSystemDirectoryHandle> {
		const opfsRoot = await navigator.storage.getDirectory();
		return await opfsRoot.getDirectoryHandle(this.directoryName, {
			create: true,
		});
	}

	async get(key: string): Promise<File | null> {
		try {
			const directory = await this.getDirectory();
			const fileHandle = await directory.getFileHandle(key);
			return await fileHandle.getFile();
		} catch (error) {
			if ((error as Error).name === "NotFoundError") {
				return null;
			}
			throw error;
		}
	}

	async set({
		key,
		value: file,
	}: {
		key: string;
		value: File;
	}): Promise<void> {
		const directory = await this.getDirectory();
		const fileHandle = await directory.getFileHandle(key, { create: true });
		const writable = await fileHandle.createWritable();

		await writable.write(file);
		await writable.close();
	}

	async remove(key: string): Promise<void> {
		try {
			const directory = await this.getDirectory();
			await directory.removeEntry(key);
		} catch (error) {
			if ((error as Error).name !== "NotFoundError") {
				throw error;
			}
		}
	}

	async list(): Promise<string[]> {
		const directory = await this.getDirectory();
		const keys: string[] = [];

		for await (const name of directory.keys()) {
			keys.push(name);
		}

		return keys;
	}

	async clear(): Promise<void> {
		const directory = await this.getDirectory();

		for await (const name of directory.keys()) {
			await directory.removeEntry(name);
		}
	}

	/**
	 * 删掉整个目录。素材字节是按工程一个目录存的
	 * （`media-files-<projectId>`），只 clear() 会留下空目录；
	 * 而且历史版本根本没删过，所以还需要按前缀扫孤儿。
	 */
	static async removeDirectory(name: string): Promise<void> {
		if (!OPFSAdapter.isSupported()) return;
		const root = await navigator.storage.getDirectory();
		try {
			await root.removeEntry(name, { recursive: true });
		} catch (error) {
			if ((error as Error).name !== "NotFoundError") throw error;
		}
	}

	static async listDirectoryNames({ prefix }: { prefix: string }): Promise<string[]> {
		if (!OPFSAdapter.isSupported()) return [];
		const root = await navigator.storage.getDirectory();
		const names: string[] = [];
		for await (const [key, handle] of (
			root as FileSystemDirectoryHandle & {
				entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
			}
		).entries()) {
			if (handle.kind === "directory" && key.startsWith(prefix)) names.push(key);
		}
		return names;
	}

	// Helper method to check OPFS support
	static isSupported(): boolean {
		return "storage" in navigator && "getDirectory" in navigator.storage;
	}
}
