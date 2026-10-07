import type { StorageAdapter } from "./types";

/**
 * 连接按库名缓存在类上。
 * 必须按库名而不是按实例：storageService 里每访问一次工程媒体就 new 一个
 * IndexedDBAdapter（见 getProjectMediaAdapters），按实例缓存等于没缓存 ——
 * 加载一个工程的媒体就是几十次 open，连接全挂在 IDB 上不放。
 */
const CONNECTIONS = new Map<string, Promise<IDBDatabase>>();

export class IndexedDBAdapter<T> implements StorageAdapter<T> {
	private dbName: string;
	private storeName: string;
	private version: number;

	constructor({
		dbName,
		storeName,
		version = 1,
	}: {
		dbName: string;
		storeName: string;
		version?: number;
	}) {
		this.dbName = dbName;
		this.storeName = storeName;
		this.version = version;
	}

	private async getDB(): Promise<IDBDatabase> {
		const cached = CONNECTIONS.get(this.dbName);
		if (cached) return await cached;

		const promise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onerror = () => {
				CONNECTIONS.delete(this.dbName);
				reject(request.error);
			};
			request.onsuccess = () => {
				const db = request.result;
				// 缓存连接后必须让路：不响应 versionchange 会永久卡住升级和删除，
				// 表现是"改了版本号之后这个库再也打不开"
				db.onversionchange = () => {
					CONNECTIONS.delete(this.dbName);
					db.close();
				};
				db.onclose = () => {
					CONNECTIONS.delete(this.dbName);
				};
				resolve(db);
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName, { keyPath: "id" });
				}
			};
		});

		CONNECTIONS.set(this.dbName, promise);
		return await promise;
	}

	async get(key: string): Promise<T | null> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.get(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || null);
		});
	}

	async set({
		key,
		value,
	}: {
		key: string;
		value: T;
	}): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readwrite");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.put({ id: key, ...value });
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async remove(key: string): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readwrite");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.delete(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async list(): Promise<string[]> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.getAllKeys();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result as string[]);
		});
	}

	async getAll(): Promise<T[]> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || []);
		});
	}

	async clear(): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readwrite");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.clear();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	/**
	 * 整库删除。工程级媒体是每个工程单独建库的（video-editor-media-<id>），
	 * 只 clear() 会留下一堆空库名占着不放。
	 */
	async deleteDatabase(): Promise<void> {
		await deleteDatabase({ dbName: this.dbName });
	}
}

export async function deleteDatabase({
	dbName,
}: {
	dbName: string;
}): Promise<void> {
	// 先放掉自己的缓存连接：连接还开着的话 deleteDatabase 会一直 blocked，
	// 而原来这里连 onblocked 都没有，于是永久挂着不返回
	const cached = CONNECTIONS.get(dbName);
	if (cached) {
		CONNECTIONS.delete(dbName);
		try {
			(await cached).close();
		} catch {
			/* 已经关了就算了 */
		}
	}

	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(dbName);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () =>
			reject(new Error(`deleteDatabase blocked by another tab: ${dbName}`));
	});
}

/** 列出某个前缀下的所有库名，用来清历史遗留的孤儿工程库。 */
export async function listDatabaseNames({
	prefix,
}: {
	prefix: string;
}): Promise<string[]> {
	if (typeof indexedDB.databases !== "function") {
		return [];
	}
	const databases = await indexedDB.databases();
	return databases
		.map((entry) => entry.name)
		.filter((name): name is string => typeof name === "string" && name.startsWith(prefix));
}
