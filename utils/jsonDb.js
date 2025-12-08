const fs = require('fs');
const path = require('path');
const { enviarAlertaNotificacion } = require('./email.service');
const { readEncryptedJson, writeEncryptedJson } = require('./encryption');

// Ruta base a la carpeta de datos
const dataDir = path.join(__dirname, '..', 'data');

// Asegurar que la carpeta data exista
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

/**
 * Lee un archivo JSON cifrado y retorna su contenido parseado.
 * Si el archivo no existe, lo crea con un array vacío cifrado.
 */
const readJson = async (filename) => {
  const filePath = path.join(dataDir, filename);
  try {
    if (!fs.existsSync(filePath)) {
      // Crear archivo vacío cifrado
      await writeEncryptedJson(filePath, []);
      return [];
    }
    // Leer y descifrar el archivo JSON
    return await readEncryptedJson(filePath);
  } catch (error) {
    console.error(`Error leyendo ${filename}:`, error);
    return [];
  }
};

/**
 * Escribe datos en un archivo JSON cifrado.
 */
const writeJson = async (filename, data) => {
  const filePath = path.join(dataDir, filename);
  try {
    await writeEncryptedJson(filePath, data);
    return true;
  } catch (error) {
    console.error(`Error escribiendo ${filename}:`, error);
    throw error;
  }
};

/**
 * Calcula el siguiente ID disponible para una colección.
 */
const getNextId = async (filename, idField) => {
  const data = await readJson(filename);
  if (data.length === 0) return 1;
  
  // Mapeamos a números para asegurar cálculo correcto
  const ids = data.map(item => Number(item[idField]) || 0);
  const maxId = Math.max(...ids);
  return maxId + 1;
};

/**
 * Crea una notificación en el sistema Y envía un correo electrónico.
 * @param {Object} data - { id_cliente, id_auditoria, tipo, titulo, mensaje }
 */
async function crearNotificacion(data) {
  try {
    // 1. Guardar en Base de Datos (JSON)
    const notificaciones = await readJson('notificaciones.json');
    const idNotificacion = await getNextId('notificaciones.json', 'id_notificacion');

    const nueva = {
      id_notificacion: idNotificacion,
      id_cliente: Number(data.id_cliente),
      id_auditoria: data.id_auditoria ? Number(data.id_auditoria) : null,
      tipo: data.tipo, // 'mensaje_nuevo', 'evidencia_subida', 'estado_cambiado', 'reporte_subido'
      titulo: data.titulo,
      mensaje: data.mensaje,
      fecha: new Date().toISOString(),
      leida: false
    };

    notificaciones.push(nueva);
    await writeJson('notificaciones.json', notificaciones);

    // 2. Integración con Servicio de Correo (Segundo Servicio Web)
    const usuarios = await readJson('usuarios.json');
    const usuarioDestino = usuarios.find(u => u.id_usuario === Number(data.id_cliente));

    if (usuarioDestino && usuarioDestino.correo) {
      console.log(`[Notificación] Enviando correo a: ${usuarioDestino.correo}`);
      
      // Ejecutamos el envío de correo sin 'await' para no bloquear la respuesta HTTP
      // (Fire and forget)
      enviarAlertaNotificacion(
        usuarioDestino.correo,
        usuarioDestino.nombre,
        data.titulo,
        data.mensaje
      ).catch(err => console.error('[Notificación] Error al enviar correo:', err));
      
    } else {
      console.warn(`[Notificación] Usuario ${data.id_cliente} no encontrado o sin correo.`);
    }

    return nueva;
  } catch (error) {
    console.error('Error creando notificación:', error);
    // No lanzamos error para no romper el flujo principal si solo falla la notificación
    return null; 
  }
}

module.exports = { 
  readJson, 
  writeJson, 
  getNextId, 
  crearNotificacion 
};