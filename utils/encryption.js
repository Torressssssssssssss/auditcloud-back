const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Clave de cifrado - Debería estar en una variable de entorno
// Por defecto, usamos una clave derivada de una semilla
// IMPORTANTE: En producción, usa process.env.ENCRYPTION_KEY
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto
  .createHash('sha256')
  .update('default-secret-key-change-in-production')
  .digest();

// Algoritmo de cifrado
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes para AES
const SALT_LENGTH = 64; // 64 bytes para el salt
const TAG_LENGTH = 16; // 16 bytes para el tag de autenticación GCM

/**
 * Cifra datos usando AES-256-GCM
 * @param {Buffer|string} data - Datos a cifrar
 * @returns {Buffer} - Datos cifrados con formato: [salt(64)][iv(16)][tag(16)][encrypted_data]
 */
function encrypt(data) {
  try {
    // Convertir a Buffer si es string
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    
    // Generar salt único para cada cifrado
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Derivar clave usando PBKDF2 con el salt
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, 'sha256');
    
    // Generar IV único
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Crear cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Cifrar datos
    const encrypted = Buffer.concat([
      cipher.update(dataBuffer),
      cipher.final()
    ]);
    
    // Obtener tag de autenticación
    const tag = cipher.getAuthTag();
    
    // Combinar: salt + iv + tag + encrypted
    return Buffer.concat([salt, iv, tag, encrypted]);
  } catch (error) {
    console.error('Error en encrypt:', error);
    throw new Error('Error al cifrar datos: ' + error.message);
  }
}

/**
 * Descifra datos usando AES-256-GCM
 * @param {Buffer} encryptedData - Datos cifrados con formato: [salt(64)][iv(16)][tag(16)][encrypted_data]
 * @returns {Buffer} - Datos descifrados
 */
function decrypt(encryptedData) {
  try {
    if (!Buffer.isBuffer(encryptedData)) {
      throw new Error('Los datos cifrados deben ser un Buffer');
    }
    
    // Extraer componentes
    const salt = encryptedData.slice(0, SALT_LENGTH);
    const iv = encryptedData.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = encryptedData.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = encryptedData.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derivar clave usando el mismo salt
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, 'sha256');
    
    // Crear decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    // Descifrar
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted;
  } catch (error) {
    console.error('Error en decrypt:', error);
    throw new Error('Error al descifrar datos: ' + error.message);
  }
}

/**
 * Cifra un archivo completo
 * @param {string} filePath - Ruta del archivo a cifrar
 * @returns {Promise<void>}
 */
async function encryptFile(filePath) {
  try {
    const data = await fs.promises.readFile(filePath);
    const encrypted = encrypt(data);
    await fs.promises.writeFile(filePath, encrypted);
  } catch (error) {
    console.error(`Error cifrando archivo ${filePath}:`, error);
    throw error;
  }
}

/**
 * Descifra un archivo completo
 * Si el archivo no está cifrado, lo retorna tal cual (para migración)
 * @param {string} filePath - Ruta del archivo a descifrar
 * @returns {Promise<Buffer>} - Contenido descifrado
 */
async function decryptFile(filePath) {
  try {
    const fileData = await fs.promises.readFile(filePath);
    
    // Si el archivo no está cifrado, retornarlo tal cual
    if (!isEncrypted(fileData)) {
      console.log(`Archivo ${filePath} no está cifrado, retornando sin descifrar`);
      return fileData;
    }
    
    // Descifrar el archivo
    return decrypt(fileData);
  } catch (error) {
    console.error(`Error descifrando archivo ${filePath}:`, error);
    throw error;
  }
}

/**
 * Verifica si un archivo está cifrado
 * @param {Buffer} data - Datos del archivo
 * @returns {boolean} - true si está cifrado, false si no
 */
function isEncrypted(data) {
  if (!Buffer.isBuffer(data) || data.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    return false;
  }
  // Un archivo JSON sin cifrar generalmente comienza con [ o {
  // Un archivo cifrado tiene al menos 96 bytes (salt + iv + tag)
  const firstByte = data[0];
  // Si comienza con [ o {, probablemente no está cifrado
  if (firstByte === 0x5B || firstByte === 0x7B) { // [ o {
    return false;
  }
  // Si tiene el tamaño mínimo y no comienza con caracteres JSON, asumimos que está cifrado
  return data.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
}

/**
 * Lee un archivo JSON cifrado y lo descifra
 * Si el archivo no está cifrado, lo lee directamente (para migración)
 * @param {string} filePath - Ruta del archivo JSON cifrado
 * @returns {Promise<any>} - Objeto JSON parseado
 */
async function readEncryptedJson(filePath) {
  try {
    const fileData = await fs.promises.readFile(filePath);
    
    // Si el archivo no está cifrado, leerlo directamente y cifrarlo
    if (!isEncrypted(fileData)) {
      console.log(`Archivo ${filePath} no está cifrado, migrando a cifrado...`);
      try {
        const jsonData = JSON.parse(fileData.toString('utf8') || '[]');
        // Cifrar el archivo para la próxima vez
        await writeEncryptedJson(filePath, jsonData);
        return jsonData;
      } catch (parseError) {
        // Si no es JSON válido, intentar descifrarlo de todas formas
        console.warn(`No se pudo parsear como JSON sin cifrar, intentando descifrar...`);
      }
    }
    
    // Intentar descifrar
    const decrypted = decrypt(fileData);
    const jsonString = decrypted.toString('utf8');
    return JSON.parse(jsonString || '[]');
  } catch (error) {
    // Si el archivo no existe, retornar array vacío
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error(`Error leyendo JSON cifrado ${filePath}:`, error);
    throw error;
  }
}

/**
 * Escribe un objeto JSON cifrado en un archivo
 * @param {string} filePath - Ruta del archivo donde guardar
 * @param {any} data - Objeto a serializar y cifrar
 * @returns {Promise<void>}
 */
async function writeEncryptedJson(filePath, data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const encrypted = encrypt(jsonString);
    await fs.promises.writeFile(filePath, encrypted);
  } catch (error) {
    console.error(`Error escribiendo JSON cifrado ${filePath}:`, error);
    throw error;
  }
}

module.exports = {
  encrypt,
  decrypt,
  encryptFile,
  decryptFile,
  readEncryptedJson,
  writeEncryptedJson,
  isEncrypted
};

