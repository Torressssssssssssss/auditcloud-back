const fs = require('fs').promises;
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

async function readJson(fileName) {
  const filePath = path.join(dataDir, fileName);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) return [];
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function writeJson(fileName, data) {
  const filePath = path.join(dataDir, fileName);
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, 'utf8');
}

async function getNextId(fileName, idField) {
  const items = await readJson(fileName);
  if (items.length === 0) return 1;
  const maxId = items.reduce((max, item) => {
    return item[idField] > max ? item[idField] : max;
  }, 0);
  return maxId + 1;
}

/**
 * Crea una notificación para un cliente
 * @param {Object} data - Datos de la notificación
 * @param {number} data.id_cliente - ID del cliente
 * @param {number|null} data.id_auditoria - ID de la auditoría (opcional)
 * @param {string} data.tipo - Tipo de notificación: 'evidencia_subida', 'estado_cambiado', 'reporte_subido', 'mensaje_nuevo'
 * @param {string} data.titulo - Título de la notificación
 * @param {string} data.mensaje - Mensaje de la notificación
 */
async function crearNotificacion(data) {
  const { id_cliente, id_auditoria, tipo, titulo, mensaje } = data;
  
  if (!id_cliente || !tipo || !titulo || !mensaje) {
    throw new Error('id_cliente, tipo, titulo y mensaje son obligatorios');
  }

  const notificaciones = await readJson('notificaciones.json');
  const idNotificacion = await getNextId('notificaciones.json', 'id_notificacion');

  const nuevaNotificacion = {
    id_notificacion: idNotificacion,
    id_cliente: Number(id_cliente),
    id_auditoria: id_auditoria ? Number(id_auditoria) : null,
    tipo: tipo,
    titulo: titulo,
    mensaje: mensaje,
    fecha: new Date().toISOString(),
    leida: false
  };

  notificaciones.push(nuevaNotificacion);
  await writeJson('notificaciones.json', notificaciones);

  return nuevaNotificacion;
}

module.exports = {
  readJson,
  writeJson,
  getNextId,
  crearNotificacion
};
