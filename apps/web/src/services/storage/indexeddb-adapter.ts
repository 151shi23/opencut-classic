import type { StorageAdapter } from "./types";

export class IndexedDBAdapter<T> implements StorageAdapter<T> {
	private dbName: string;
	private storeName: string;
	private version: number;
	private dbPromise: Promise<IDBDatabase> | null = null;

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
		// 以前每个 get/set 都 open 一次且从不 close：加载一个工程的媒体就是几十次
		// open，连接挂在 IDB 上不放，工程一大就先在这里炸。
		if (this.dbPromise) return await this.dbPromise;

		const promise = new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.version);

			request.onerror = () => {
				this.dbPromise = null;
				reject(request.error);
			};
			request.onsuccess = () => {
				const db = request.result;
				// 缓存连接后必须让路：不响应 versionchange 会永久卡住任何升级，
				// 表现是"改了版本号之后这个库再也打不开"
				db.onversionchange = () => {
					db.close();
					this.dbPromise = null;
				};
				db.onclose = () => {
					this.dbPromise = null;
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

		this.dbPromise = promise;
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
}

export async function deleteDatabase({
	dbName,
}: {
	dbName: string;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(dbName);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}
