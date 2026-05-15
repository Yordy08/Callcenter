// --- Pega este código en Google Apps Script (Código.gs) ---
// Requiere una hoja con nombre exacto (Hoja1) y columnas:
// id, nombre, telefono, imagen

const SHEET_ID = "1ltF4owBR9St41GbYR3cQbyFGJO6UM5TyWwcFHqbQT9c";
const SHEET_NAME = "Hoja1";

function doGet(e) {
  try {
    e = e || { parameter: {} };
    const params = (e && e.parameter) ? e.parameter : {};
    const action = (params.action || "").toLowerCase();

    if (!action) return json({ ok: false, error: "Acción faltante" });


    if (action === "list") return listContacts();
    if (action === "create") return createContact(e);
    if (action === "update") return updateContact(e);
    if (action === "delete") return deleteContact(e);

    return json({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return json({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function listContacts() {
  const { sheet, headers } = getSheet();
  const values = sheet.getDataRange().getValues();

  // Asumimos header en fila 1
  const rows = values.slice(1);
  const idIdx = headers.indexOf("id");
  const nombreIdx = headers.indexOf("nombre");
  const telefonoIdx = headers.indexOf("telefono");
  const imagenIdx = headers.indexOf("imagen");

  const data = rows
    .filter(r => r[idIdx] !== "")
    .map(r => ({
      id: String(r[idIdx]),
      nombre: String(r[nombreIdx] || ""),
      telefono: String(r[telefonoIdx] || ""),
      imagen: String(r[imagenIdx] || ""),
    }));

  return json({ ok: true, data });
}

function createContact(e) {
  const nombre = e.parameter.nombre;
  const telefono = e.parameter.telefono;
  const imagen = e.parameter.imagen;

  if (!nombre || !telefono) return json({ ok: false, error: "Missing nombre/telefono" });

  const { sheet, headers } = getSheet();

  const idIdx = headers.indexOf("id");
  const nextId = getNextId(sheet, idIdx);

  sheet.appendRow([nextId, nombre, telefono, imagen]);

  return json({ ok: true, id: String(nextId) });
}

function updateContact(e) {
  const id = String(e.parameter.id || "");
  const nombre = e.parameter.nombre;
  const telefono = e.parameter.telefono;
  const imagen = e.parameter.imagen;

  if (!id) return json({ ok: false, error: "Missing id" });

  const { sheet, headers, values } = getSheetWithValues();
  const idIdx = headers.indexOf("id");

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idIdx]) === id) {
      // fila real en sheet = i+1
      const rowNumber = i + 1;
      // actualizamos columnas por índice
      setRowCells_(sheet, rowNumber, headers, { nombre, telefono, imagen });
      return json({ ok: true });
    }
  }

  return json({ ok: false, error: "ID not found" });
}

function deleteContact(e) {
  const id = String(e.parameter.id || "");
  if (!id) return json({ ok: false, error: "Missing id" });

  const { sheet, headers, values } = getSheetWithValues();
  const idIdx = headers.indexOf("id");

  // borramos la fila (desde abajo para no desalinear)
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][idIdx]) === id) {
      const rowNumber = i + 1;
      sheet.deleteRow(rowNumber);
      return json({ ok: true });
    }
  }

  return json({ ok: false, error: "ID not found" });
}

function setRowCells_(sheet, rowNumber, headers, data) {
  const colNombre = headers.indexOf("nombre") + 1;
  const colTelefono = headers.indexOf("telefono") + 1;
  const colImagen = headers.indexOf("imagen") + 1;

  if (data.nombre !== undefined) sheet.getRange(rowNumber, colNombre).setValue(data.nombre);
  if (data.telefono !== undefined) sheet.getRange(rowNumber, colTelefono).setValue(data.telefono);
  if (data.imagen !== undefined) sheet.getRange(rowNumber, colImagen).setValue(data.imagen);
}

function getNextId(sheet, idIdx) {
  const values = sheet.getDataRange().getValues();
  // header fila 1
  const ids = values.slice(1).map(r => r[idIdx]).filter(Boolean).map(x => Number(x));
  const max = ids.length ? Math.max(...ids) : 0;
  return max + 1;
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet not found: " + SHEET_NAME);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers.indexOf("id") === -1) {
    // si no existen, forzamos columnas
    sheet.getRange(1, 1, 1, 4).setValues([["id", "nombre", "telefono", "imagen"]]);
  }

  const finalHeaders = sheet.getRange(1, 1, 1, 4).getValues()[0];
  return { sheet, headers: finalHeaders };
}

function getSheetWithValues() {
  const { sheet, headers } = getSheet();
  const values = sheet.getDataRange().getValues();
  return { sheet, headers, values };
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

