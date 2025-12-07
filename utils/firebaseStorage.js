const admin = require('./firebase');
const { Readable } = require('stream');

/**
 * Sube un archivo a Firebase Storage
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} fileName - Nombre del archivo (con extensión)
 * @param {string} folder - Carpeta donde se guardará (ej: 'evidencias', 'reportes')
 * @param {string} contentType - Tipo MIME del archivo (ej: 'image/jpeg', 'application/pdf')
 * @returns {Promise<{url: string, path: string}>} URL pública y ruta del archivo
 */
async function uploadFileToFirebase(fileBuffer, fileName, folder = 'uploads', contentType = 'application/octet-stream') {
  try {
    const bucket = admin.storage().bucket();
    
    // Generar nombre único para evitar conflictos
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const fileExtension = fileName.split('.').pop();
    const baseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
    const uniqueFileName = `${timestamp}-${random}-${baseName}.${fileExtension}`;
    
    // Ruta completa en Firebase Storage
    const filePath = `${folder}/${uniqueFileName}`;
    const file = bucket.file(filePath);

    // Crear stream desde el buffer
    const stream = file.createWriteStream({
      metadata: {
        contentType: contentType,
        metadata: {
          originalName: fileName,
          uploadedAt: new Date().toISOString()
        }
      },
      public: true, // Hacer el archivo público (opcional, puedes usar signed URLs si prefieres)
    });

    // Convertir buffer a stream
    const bufferStream = new Readable();
    bufferStream.push(fileBuffer);
    bufferStream.push(null);

    // Subir el archivo
    return new Promise((resolve, reject) => {
      bufferStream
        .pipe(stream)
        .on('error', (error) => {
          console.error('Error subiendo archivo a Firebase:', error);
          reject(error);
        })
        .on('finish', async () => {
          try {
            // Hacer el archivo público (si no se configuró en createWriteStream)
            await file.makePublic();
            
            // Obtener URL pública
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
            
            resolve({
              url: publicUrl,
              path: filePath,
              fileName: uniqueFileName
            });
          } catch (error) {
            console.error('Error obteniendo URL pública:', error);
            reject(error);
          }
        });
    });
  } catch (error) {
    console.error('Error en uploadFileToFirebase:', error);
    throw error;
  }
}

/**
 * Elimina un archivo de Firebase Storage
 * @param {string} filePath - Ruta del archivo en Firebase Storage
 * @returns {Promise<void>}
 */
async function deleteFileFromFirebase(filePath) {
  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);
    
    await file.delete();
    console.log(`Archivo ${filePath} eliminado de Firebase Storage`);
  } catch (error) {
    // Si el archivo no existe, no es un error crítico
    if (error.code !== 404) {
      console.error('Error eliminando archivo de Firebase:', error);
      throw error;
    }
  }
}

/**
 * Obtiene una URL firmada (signed URL) para acceso temporal a un archivo privado
 * @param {string} filePath - Ruta del archivo en Firebase Storage
 * @param {number} expiresIn - Tiempo de expiración en milisegundos (default: 1 hora)
 * @returns {Promise<string>} URL firmada
 */
async function getSignedUrl(filePath, expiresIn = 3600000) {
  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(filePath);
    
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: new Date(Date.now() + expiresIn)
    });
    
    return url;
  } catch (error) {
    console.error('Error obteniendo URL firmada:', error);
    throw error;
  }
}

module.exports = {
  uploadFileToFirebase,
  deleteFileFromFirebase,
  getSignedUrl
};

