
// Apps Script: simple contacts API backed by a Google Sheet
const SHEET_NAME = 'contacts';

function _getSheet(){
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if(!sheet) sheet = ss.insertSheet(SHEET_NAME);
    return sheet;
}

function _ensureHeader(){
    const sheet = _getSheet();
    const headers = ['id','nombre','telefono','imagen','updated_at'];
    const first = sheet.getRange(1,1,1,sheet.getLastColumn() || headers.length).getValues()[0] || [];
    if(first.slice(0,headers.length).join(',') !== headers.join(',')){
        sheet.clear();
        sheet.getRange(1,1,1,headers.length).setValues([headers]);
    }
}

function _readAll(){
    _ensureHeader();
    const sheet = _getSheet();
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    return rows.map(r => ({id: String(r[0]), nombre: r[1], telefono: r[2], imagen: r[3], updated_at: r[4]}));
}

function doGet(e){
    try{
        const action = e.parameter.action || 'list';
        const since = e.parameter.since || null;
        const contacts = _readAll();
        let out = contacts;
        if(since){
            out = contacts.filter(c => c.updated_at && new Date(c.updated_at) > new Date(since));
        }
        return ContentService.createTextOutput(JSON.stringify({ok:true, data: out})).setMimeType(ContentService.MimeType.JSON);
    }catch(err){
        return ContentService.createTextOutput(JSON.stringify({ok:false, error: String(err)})).setMimeType(ContentService.MimeType.JSON);
    }
}

function _generateId(){
    return 'c_' + (new Date().getTime()) + '_' + Math.floor(Math.random()*10000);
}

function doPost(e){
    try{
        const payload = JSON.parse(e.postData.contents || '{}');
        // payload expected: { action: 'create'|'update'|'delete', contact: {id?, nombre, telefono, imagen}, client_ts }
        const lock = LockService.getScriptLock();
        lock.waitLock(30000);
        _ensureHeader();
        const sheet = _getSheet();
        const contacts = _readAll();

        const act = payload.action;
        const c = payload.contact || {};
        let result = null;

        if(act === 'create'){
            const id = c.id || _generateId();
            const updated_at = new Date().toISOString();
            sheet.appendRow([id, c.nombre || '', c.telefono || '', c.imagen || '', updated_at]);
            result = {id, nombre: c.nombre, telefono: c.telefono, imagen: c.imagen, updated_at};
        } else if(act === 'update'){
            const idx = contacts.findIndex(x => x.id === c.id);
            if(idx >= 0){
                const row = idx + 2;
                const updated_at = new Date().toISOString();
                sheet.getRange(row,2,1,4).setValues([[c.nombre||'', c.telefono||'', c.imagen||'', updated_at]]);
                result = {id: c.id, nombre: c.nombre, telefono: c.telefono, imagen: c.imagen, updated_at};
            } else {
                // not found -> create
                const id = c.id || _generateId();
                const updated_at = new Date().toISOString();
                sheet.appendRow([id, c.nombre || '', c.telefono || '', c.imagen || '', updated_at]);
                result = {id, nombre: c.nombre, telefono: c.telefono, imagen: c.imagen, updated_at};
            }
        } else if(act === 'delete'){
            const idx = contacts.findIndex(x => x.id === c.id);
            if(idx >= 0){
                sheet.deleteRow(idx + 2);
            }
            result = {id: c.id};
        } else {
            // unknown action
            lock.releaseLock();
            return ContentService.createTextOutput(JSON.stringify({ok:false, error:'unknown action'})).setMimeType(ContentService.MimeType.JSON);
        }

        lock.releaseLock();
        return ContentService.createTextOutput(JSON.stringify({ok:true, contact: result})).setMimeType(ContentService.MimeType.JSON);
    }catch(err){
        return ContentService.createTextOutput(JSON.stringify({ok:false, error: String(err)})).setMimeType(ContentService.MimeType.JSON);
    }
}
}

