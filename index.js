
class Fastcache {
	/**
	 * Simple node memory cache
	 * Clears all keys for a
	 * */
	constructor(timer) {
		this.flushCache();
		if (timer) this.setCheckTime(timer);
		this.setTimer();
	}
	cache = {};
	mappedCache = {};
	databases = {};
	collections = {};
	backgroundUpdate = [];
	timer = undefined;
	seconds = 10;
	/**
	 * get ttl check time in seconds
	 * */
	getCheckTime() {
		return this.seconds * 1000;
	}
	
	/**
	 * set ttl check time in seconds
	 * @param {number} checkTime
	 * */
	setCheckTime(checkTime) {
		if (typeof checkTime === "number") {
			if (checkTime === checkTime) {
				// check for isnan
				if (checkTime > 0.1) {
					// allow only values bigger than 100ms
					this.seconds = checkTime
				}
			}
		}
	}
	
	/**
	 * @param {string} key to remove updates from
	 * */
	removeBackgroundUpdate(key) {
		this.backgroundUpdate = this.backgroundUpdate.filter(x => x.key !== key);
	}
	
	runBackgroundUpdates() {
		const updateable = this.backgroundUpdate;
		const now = performance.now();
		
		for (const config of updateable) {
			const {key, ttl, reload, queryFunction} = config;
			const cache = this.getFull(key);
			if (cache.reload < now) {
				queryFunction()
					.then(x => x === null || x === undefined ? this.del(key) : this.setReadThrough(key, x, reload, ttl))
			}
		}
	}
	
	intervalFunction() {
		this.runBackgroundUpdates();
		this.clearTtl();
	}
	
	/**
	 * set timer, may be used to reset the timer
	 * */
	setTimer() {
		if (this.timer) clearInterval(this.timer);
		const seconds = this.getCheckTime();
		this.timer = setInterval(() => this.clearTtl(), seconds * 1000);
	}
	
	clearEmptyDatabases() {
		const dbs = Object.keys(this.databases);
	}
	
	/**
	 * Clears old entries
	 * */
	clearTtl() {
		const cachedKeys = this.getKeys();
		const cacheSize = this.getKeyCount();
		const now = performance.now();
		
		for (let i = 0; i < cacheSize.length; i += 1) {
			const key = this.cache[cachedKeys[i]];
			if (this.cache[key].ttl < now) this.del(key);
		}
	}
	
	/**
	 * Remove background updates
	 * */
	clearUpdates() {
		this.backgroundUpdate = [];
	}
	
	/**
	 * Empty cache
	 * */
	flushCache() {
		this.cache = {};
		this.mappedCache = {};
	}
	/**
	 * Empty databases
	 * */
	flushDatabases() {
		this.databases = {};
	}
	/**
	 * Empty collections
	 * */
	flushCollections() {
		this.collections = {};
	}
	
	/**
	 * Returns all cache entries
	 * @returns {object} cache
	 * */
	getFullCache() {
		return this.cache;
	}
	/**
	 * Returns all cache keys
	 * @returns {object} cache
	 * */
	getKeys() {
		return Object.keys(this.cache);
	}
	/**
	 * Returns cache key count
	 * @returns {number}
	 * */
	getKeyCount() {
		return this.getKeys().length;
	}
	/**
	 * Extract cache with ttl and value
	 * @param {string} key
	 * @returns {object} cache
	 * @returns {value} cache.value
	 * @returns {ttl} cache.ttl
	 * */
	getFull(key) {
		return this.cache[key];
	}
	/**
	 * Check if a key exists
	 * @param {string} key
	 * @returns {boolean} exists
	 * */
	exists(key) {
		return !!this.getFull(key);
	}
	/**
	 * Get cached value if ttl expired, key gets deleted
	 * @param {string} key
	 * @returns {any} cachedValue
	 * */
	get(key) {
		const cache = this.getFull(key);
		
		if (cache) {
			const now = performance.now();
			if (cache.ttl < now) {
				this.del(key);
			} else {
				return cache.value;
			}
		}
		
		return null;
	}
	/**
	 * Get cached ttl
	 * @param {string} key
	 * @returns {number} ttl
	 * */
	getTtl(key) {
		const cache = this.getFull(key);
		
		let ttl;
		if (cache) {
			ttl = cache.ttl;
		}
		
		return ttl;
	}
	/**
	 *
	 * Set cache
	 * @param {string} key
	 * @param {any} value
	 * @param {number} maxAge
	 * */
	set(key, value, maxAge = 20) {
		const now = performance.now();
		this.cache[key] = {
			ttl: now + maxAge * 1000,
			value,
		};
	}
	/**
	 * Set read through cache accepts reload age and max age
	 * if reload age is exceeded, a new value gets loaded
	 * if max age exceeds, it will get deleted automatically
	 * @param {string} key
	 * @param {any} value
	 * @param {number} reload
	 * @param {number} maxAge
	 * */
	setReadThrough(key, value, reload=10, maxAge = 20) {
		const now = performance.now();
		this.cache[key] = {
			ttl: now + maxAge * 1000,
			reload: now + reload * 1000,
			value,
		};
	}
	/**
	 * Set ttl of key if it exists
	 * @param {string} key
	 * @param {number} maxAge
	 * */
	setTtl(key, maxAge) {
		const now = performance.now();
		if (this.cache[key]) {
			this.cache[key].ttl = now + maxAge * 1000;
		}
	}
	/**
	 * Set value of key if it exists, keeps ttl unchanged
	 * @param {string} key
	 * @param {any} value
	 * */
	setValue(key, value) {
		const now = performance.now();
		if (this.cache[key]) {
			this.cache[key].value = value;
		}
	}
	/**
	 * Delete value of key if it exists
	 * @param {string} key
	 * */
	del(key) {
		this.cache[key] = null;
		delete this.cache[key];
		this.delPropagate(key)
	}
	/**
	 * Delete value of mapping of the key
	 * @param {string} key
	 * */
	delPropagate(key) {
		const mapping = this.mappedCache[key];
		if (mapping) {
			const {owner, collection} = mapping;
			
			delete this.collections[collection][key];
			delete this.mappedCache[key];
			
			const remainingCollections = Object.keys(this.collections[collection])
			
			if (remainingCollections.length === 0) {
				
				delete this.databases[owner][collection]
				delete this.collections[collection];
				
				const dbKeys = Object.keys(this.databases[owner]);
				
				if (dbKeys.length === 0) {
					delete this.databases[owner];
				}
			}
		}
	}
	
	/**
	 *
	 * @param {string} key
	 * @param {number} reload ttl where key gets reloaded
	 * @param {number} ttl ttl where key gets deleted
	 * @param {function} queryFunction function executed
	 */
	registerBackgroundUpdate(key, reload, ttl, queryFunction) {
		this.backgroundUpdate.push({key, reload, ttl, queryFunction});
	}
	
	/**
	 * Uses read through cache
	 * always returns the cached value and if ttl is exceeded reloads
	 * its value in background, if no value exits it is deleted
	 * @param {string} key
	 * @param {function} queryFunction async function which returns the value to cache null/undefined will empty the cache
	 * @param {number} reload ttl where key gets reloaded
	 * @param {number} ttl ttl where key gets deleted
	 * @param {boolean} registerBackgroundUpdates add key to list of periodically updated backgroundupdates
	 * */
	async getReadThrough(key, queryFunction=async () => null, reload=20, ttl=40, registerBackgroundUpdates=false) {
		const cache = this.getFull(key);
		const now = performance.now();
		
		let value;
		if (cache) {
			// ignore key is dead and reload cache afterwards
			if (cache.reload < now) {
				queryFunction()
					.then(x => x === null || x === undefined ? this.del(key) : this.setReadThrough(key, x, reload, ttl))
			}
			value = cache.value;
		} else {
			if (registerBackgroundUpdates) {
				this.registerBackgroundUpdate(key, reload, queryFunction);
			}
			// initialize cache async if value exists
			value = await queryFunction();
			if (value) this.setReadThrough(key, value, reload, ttl)
		}
		
		return value;
	}
	/**
	 * delete read through key and cleanup function
	 * @param {string} key
	 * @param {function} deleteFunction async function which returns the value to cache null/undefined will empty the cache
	 * @returns {any} the result of the return function
	 * */
	async deleteReadThrough(key, deleteFunction=async () => null) {
		this.del(key);
		return await deleteFunction();
	}
	
	mapCacheToDb(key, queryFunction, owner, collection) {
		this.mappedCache[key] = {owner, collection, queryFunction};
		
		if (this.collections[collection]) {
			this.collections[collection][key] = this.mappedCache[key];
		}
		else {
			this.collections[collection] = {[key]: this.mappedCache[key]};
		}
		
		if (this.databases[owner]) {
			this.databases[owner][collection] = this.collections[collection];
		}
		else {
			this.databases[owner] = {[collection]: this.collections[collection]}
		}
		
	}
	
	/**
	 *
	 * @param key {string} cache key
	 * @param value {object} query function results
	 * @param dInfo {object} dataInfo object
	 * @param queryFunction {function}
	 * @param maxAge {number} ttl
	 */
	registerReadQuery(key, value, dInfo, queryFunction, maxAge = 20) {
		const owner = dInfo.owner;
		const collection = dInfo.collectionName;
		this.set(key, value, maxAge);
		this.mapCacheToDb(key, queryFunction, owner, collection);
	}
	
	/**
	 *
	 * @param _id {string} mongo id
	 * @param type {string} create || update || delete
	 * @param values {object} record update, mey be omitted for deltion
	 * @param dInfo {object} dataInfo object
	 * @return {Promise<void>}
	 */
	async updateCache(_id, type, values, dInfo) {
		const mongo_id = typeof _id === "string" ? _id : _id.toString();
		const owner = dInfo.owner;
		const collection = dInfo.collectionName;
		if (this.databases[owner]) {
			if (this.databases[owner][collection]) {
				const keys = Object.keys(this.databases[owner][collection]);
				if (type === "update") {
					for (let i = 0; i < keys.length; i += 1) {
						const key = keys[i];
						const cached = this.cache[key].value;
						const {data} = cached;
						
						for (let j = 0; j < data.length; j += 1) {
							const record = data[j];
							if (record._id.toString() === mongo_id) {
								this.cache[key].value.data[j] = {...record, ...values}
								break;
							}
						}
					}
				}
				else if (type === "delete") {
					for (let i = 0; i < keys.length; i += 1) {
						const key = keys[i];
						this.cache[key].value.data = this.cache[key].value.data.filter(x => x._id.toString() !== mongo_id);
					}
				}
				else if (type === "create") {
					for (let i = 0; i < keys.length; i += 1) {
						const key = keys[i];
						this.cache[key].value.data.unshift(values);
					}
				}
				else {
					for (let i = 0; i < keys.length; i += 1) {
						const key = keys[i];
						const cached = this.cache[key].value;
						const {queryFunction} = this.databases[owner][collection][key];
						const newData = await queryFunction(cached);
						this.set(key, newData)
					}
				}
			}
		}
	}
}


module.exports = Fastcache
