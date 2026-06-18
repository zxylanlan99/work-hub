let app = null;
let db = null;

async function initCloudbase() {
  if (app) return app;

  try {
    // 如果 DOM 已加载完成，直接初始化，避免无限等待
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        const handler = () => {
          document.removeEventListener('DOMContentLoaded', handler);
          resolve();
        };
        document.addEventListener('DOMContentLoaded', handler);
      });
    }

    if (!window.cloudbase) {
      console.error('CloudBase SDK not loaded');
      return null;
    }

    app = window.cloudbase.init({
      env: CONFIG.cloudbase.env,
      region: CONFIG.cloudbase.region
    });

    db = app.database();

    await app.auth().anonymousAuthProvider().signIn();

    console.log('CloudBase initialized successfully');
    return app;
  } catch (error) {
    console.error('CloudBase initialization failed:', error);
    return null;
  }
}

async function getDb() {
  if (db) return db;
  await initCloudbase();
  return db;
}

async function addData(collection, data) {
  const database = await getDb();
  return database.collection(collection).add(data);
}

async function getData(collection, query = {}) {
  const database = await getDb();
  return database.collection(collection).where(query).get();
}

async function updateData(collection, id, data) {
  const database = await getDb();
  return database.collection(collection).doc(id).update(data);
}

async function deleteData(collection, id) {
  const database = await getDb();
  return database.collection(collection).doc(id).remove();
}

async function callFunction(name, data) {
  await initCloudbase();
  return app.callFunction({ name, data });
}
