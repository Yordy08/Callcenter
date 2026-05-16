/* Client sync: IndexedDB storage + outbox + periodic sync with Apps Script backend */

const API_BASE = "https://script.google.com/macros/s/AKfycbxCOhWQ4FkMckemEFyKaR6WLyJEXcHafbhyGdBXixL5s28DkuHMkK29jiGKG0jeybm9/exec";
const DB_NAME = 'callcenter-db';
const DB_VERSION = 1;
const CONTACTS_STORE = 'contacts';
const OUTBOX_STORE = 'outbox';
const META_STORE = 'meta';

function openDb(){
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(CONTACTS_STORE)) db.createObjectStore(CONTACTS_STORE, { keyPath: 'id' });
      if(!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { autoIncrement: true });
      if(!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'k' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function putContactsArray(contacts){
  const db = await openDb();
  const tx = db.transaction(CONTACTS_STORE, 'readwrite');
  const store = tx.objectStore(CONTACTS_STORE);
  // clear existing
  const clearReq = store.clear();
  await new Promise((r, e) => { clearReq.onsuccess = r; clearReq.onerror = e; });
  contacts.forEach(c => store.put(c));
  return new Promise((r) => { tx.oncomplete = r; });
}

async function getAllContacts(){
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(CONTACTS_STORE, 'readonly');
    const req = tx.objectStore(CONTACTS_STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

async function addOutbox(op){
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const req = tx.objectStore(OUTBOX_STORE).add(op);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function getOutboxItems(){
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const req = tx.objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  });
}

async function clearOutbox(){
  const db = await openDb();
  const tx = db.transaction(OUTBOX_STORE, 'readwrite');
  tx.objectStore(OUTBOX_STORE).clear();
  return new Promise((r) => { tx.oncomplete = r; });
}

async function saveLastSync(ts){
  const db = await openDb();
  const tx = db.transaction(META_STORE, 'readwrite');
  tx.objectStore(META_STORE).put({k:'lastSync', v: ts});
  return new Promise((r) => { tx.oncomplete = r; });
}

async function getLastSync(){
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const req = tx.objectStore(META_STORE).get('lastSync');
    req.onsuccess = () => res(req.result ? req.result.v : null);
    req.onerror = () => rej(req.error);
  });
}

async function renderContactsFromDB(){
  let data = [];
  try{ data = await getAllContacts(); }catch(e){ data = []; }
  // fallback to localStorage for quick boot if needed
  if(!data || data.length === 0){
    try{ const cached = localStorage.getItem('contacts_cache_v1'); if(cached) data = JSON.parse(cached); }catch(e){}
  }
  renderContacts(data);
}

function renderContacts(data){
  try{ localStorage.setItem('contacts_cache_v1', JSON.stringify(data)); }catch(e){}
  const contenedor = document.getElementById('contenedor');
  if(!contenedor) return;
  contenedor.innerHTML = '';
  data.forEach(c => {
    contenedor.innerHTML += `
      <div class="card">
        <img src="${c.imagen}">
        <div class="info">
          <div class="nombre">${c.nombre}</div>
          <div class="telefono">${c.telefono}</div>
          <a class="btn" href="tel:+57${c.telefono}">📞 Llamar</a>
        </div>
      </div>
    `;
  });
}

async function syncWithServer(){
  if(!navigator.onLine) return;

  try{
    // 1) push local outbox
    const outbox = await getOutboxItems();
    for(const item of outbox){
      try{
        await fetch(API_BASE, {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
      }catch(e){
        // stop processing outbox if one fails to avoid data loss
        throw e;
      }
    }
    if(outbox.length) await clearOutbox();

    // 2) pull full list (simple strategy). Could be optimized with since timestamp.
    const url = `${API_BASE}?action=list&nocache=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const payload = await res.json();
    let contacts = [];
    if(payload && payload.ok && payload.data) contacts = payload.data;
    else if(Array.isArray(payload)) contacts = payload;

    if(contacts.length){
      await putContactsArray(contacts);
      await saveLastSync(new Date().toISOString());
      renderContacts(contacts);
    } else {
      // if server returned empty, still render local
      await renderContactsFromDB();
    }
  }catch(err){
    // offline or server error, fallback to local DB
    await renderContactsFromDB();
  }
}

// Inicializar: mostrar inmediato desde indexedDB/localStorage y arrancar sync
(async function init(){
  await renderContactsFromDB();
  // try sync a few times after load
  setTimeout(syncWithServer, 1000);
  setTimeout(syncWithServer, 3000);
  setTimeout(syncWithServer, 7000);

  // periodic sync while online
  setInterval(syncWithServer, 30000);

  window.addEventListener('online', () => syncWithServer());
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') syncWithServer(); });

  // Register service worker if available (already in index but safe)
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(()=>{});
})();

// Expose helper for admin pages to queue ops
window.enqueueOutboxOp = async function(op){
  // op example: { action: 'create'|'update'|'delete', contact: {...}, client_ts: ISO }
  op.client_ts = op.client_ts || new Date().toISOString();
  await addOutbox(op);
  // try immediate sync
  syncWithServer();
};
