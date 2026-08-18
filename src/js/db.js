/* ==========================================================================
   GeoLimp - IndexedDB Data Access Layer Wrapper
   ========================================================================== */

const DB_NAME = 'GeoLimpDB';
const DB_VERSION = 1;

let dbInstance = null;

export const db = {
  /**
   * Initializes the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  init() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // Store for channels/stretches
        if (!database.objectStoreNames.contains('trechos')) {
          database.createObjectStore('trechos', { keyPath: 'id' });
        }

        // Store for daily logs
        if (!database.objectStoreNames.contains('diarios')) {
          database.createObjectStore('diarios', { keyPath: 'id', autoIncrement: true });
        }

        // Store for geo-referenced photos (Base64 images)
        if (!database.objectStoreNames.contains('fotos')) {
          database.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
        }

        // Store for operational goals/configurations
        if (!database.objectStoreNames.contains('metas')) {
          database.createObjectStore('metas', { keyPath: 'id' });
        }

        // Store for settings/system configurations
        if (!database.objectStoreNames.contains('config')) {
          database.createObjectStore('config', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('IndexedDB initialization failed:', event.target.error);
        reject(event.target.error);
      };
    });
  },

  /**
   * Get all records from a store.
   * @param {string} storeName 
   * @returns {Promise<Array>}
   */
  getAll(storeName) {
    return this.init().then((database) => {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  },

  /**
   * Get a single record by key.
   * @param {string} storeName 
   * @param {any} key 
   * @returns {Promise<any>}
   */
  get(storeName, key) {
    return this.init().then((database) => {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  },

  /**
   * Insert or update a record in a store.
   * @param {string} storeName 
   * @param {any} value 
   * @returns {Promise<any>}
   */
  put(storeName, value) {
    return this.init().then((database) => {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(value);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
  },

  /**
   * Delete a record by key.
   * @param {string} storeName 
   * @param {any} key 
   * @returns {Promise<void>}
   */
  delete(storeName, key) {
    return this.init().then((database) => {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  },

  /**
   * Clear all records in a store.
   * @param {string} storeName 
   * @returns {Promise<void>}
   */
  clear(storeName) {
    return this.init().then((database) => {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  },

  /**
   * Export all IndexedDB stores as a unified JSON object.
   * @returns {Promise<Object>}
   */
  async exportFullBackup() {
    const trechos = await this.getAll('trechos');
    const diarios = await this.getAll('diarios');
    const fotos = await this.getAll('fotos');
    const metas = await this.getAll('metas');
    const config = await this.getAll('config');

    return {
      appName: 'GeoLimp',
      version: '1.2.0',
      exportedAt: new Date().toISOString(),
      data: {
        trechos,
        diarios,
        fotos,
        metas,
        config
      }
    };
  },

  /**
   * Import and restore database from a JSON backup object.
   * @param {Object} backupData 
   * @returns {Promise<void>}
   */
  async importFullBackup(backupData) {
    if (!backupData || !backupData.data) {
      throw new Error('Formato de arquivo de backup inválido.');
    }

    const { trechos, diarios, fotos, metas, config } = backupData.data;

    // Clear existing stores
    await Promise.all([
      this.clear('trechos'),
      this.clear('diarios'),
      this.clear('fotos'),
      this.clear('metas'),
      this.clear('config')
    ]);

    // Restore items
    if (Array.isArray(trechos)) {
      for (const item of trechos) await this.put('trechos', item);
    }
    if (Array.isArray(diarios)) {
      for (const item of diarios) await this.put('diarios', item);
    }
    if (Array.isArray(fotos)) {
      for (const item of fotos) await this.put('fotos', item);
    }
    if (Array.isArray(metas)) {
      for (const item of metas) await this.put('metas', item);
    }
    if (Array.isArray(config)) {
      for (const item of config) await this.put('config', item);
    }
  }
};

