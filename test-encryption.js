/**
 * Script de prueba para verificar que el cifrado funciona correctamente
 * 
 * Ejecutar: node test-encryption.js
 */

const fs = require('fs');
const path = require('path');
const { readJson, writeJson } = require('./utils/jsonDb');
const { encrypt, decrypt, isEncrypted, decryptFile } = require('./utils/encryption');

async function testEncryption() {
  console.log('🔐 Iniciando pruebas de cifrado...\n');

  // ==========================================
  // 1. Prueba de cifrado/descifrado de JSON
  // ==========================================
  console.log('1️⃣  Probando cifrado de archivos JSON...');
  try {
    const testFile = 'test_encryption.json';
    const testData = [
      { id: 1, nombre: 'Test', fecha: new Date().toISOString() },
      { id: 2, nombre: 'Otro Test', activo: true }
    ];

    // Escribir datos (debería cifrarse automáticamente)
    await writeJson(testFile, testData);
    console.log('   ✅ Archivo JSON escrito (debería estar cifrado)');

    // Leer el archivo directamente como Buffer para verificar que está cifrado
    const filePath = path.join(__dirname, 'data', testFile);
    const rawData = await fs.promises.readFile(filePath);
    
    if (isEncrypted(rawData)) {
      console.log('   ✅ Archivo está cifrado (verificado)');
    } else {
      console.log('   ❌ ERROR: Archivo NO está cifrado!');
      return;
    }

    // Intentar leer como texto (debería fallar o ser ilegible)
    try {
      const textContent = rawData.toString('utf8');
      if (textContent.startsWith('[') || textContent.startsWith('{')) {
        console.log('   ❌ ERROR: Archivo se puede leer como texto plano!');
        return;
      } else {
        console.log('   ✅ Archivo no es legible como texto plano');
      }
    } catch (e) {
      console.log('   ✅ Archivo no es texto válido (esperado)');
    }

    // Leer usando readJson (debería descifrar automáticamente)
    const readData = await readJson(testFile);
    if (JSON.stringify(readData) === JSON.stringify(testData)) {
      console.log('   ✅ Datos descifrados correctamente');
    } else {
      console.log('   ❌ ERROR: Datos no coinciden después de descifrar');
      return;
    }

    // Limpiar archivo de prueba
    await fs.promises.unlink(filePath);
    console.log('   ✅ Archivo de prueba eliminado\n');

  } catch (error) {
    console.error('   ❌ ERROR en prueba de JSON:', error.message);
    return;
  }

  // ==========================================
  // 2. Verificar archivos JSON existentes
  // ==========================================
  console.log('2️⃣  Verificando archivos JSON existentes en data/...');
  try {
    const dataDir = path.join(__dirname, 'data');
    const files = await fs.promises.readdir(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let encryptedCount = 0;
    let unencryptedCount = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      const rawData = await fs.promises.readFile(filePath);
      
      if (isEncrypted(rawData)) {
        encryptedCount++;
        console.log(`   ✅ ${file} - CIFRADO`);
      } else {
        unencryptedCount++;
        console.log(`   ⚠️  ${file} - NO CIFRADO (se cifrará en la próxima escritura)`);
      }
    }

    console.log(`\n   Resumen: ${encryptedCount} cifrados, ${unencryptedCount} sin cifrar\n`);

  } catch (error) {
    console.error('   ❌ ERROR verificando archivos:', error.message);
  }

  // ==========================================
  // 3. Prueba de cifrado de archivos binarios (uploads)
  // ==========================================
  console.log('3️⃣  Probando cifrado de archivos binarios (simulando upload)...');
  try {
    const testUploadFile = 'test_upload.txt';
    const testContent = 'Este es un archivo de prueba para verificar el cifrado de uploads.';
    const uploadDir = path.join(__dirname, 'data', 'uploads');
    
    // Asegurar que el directorio existe
    if (!fs.existsSync(uploadDir)) {
      await fs.promises.mkdir(uploadDir, { recursive: true });
    }

    const testFilePath = path.join(uploadDir, testUploadFile);
    
    // Escribir archivo de prueba
    await fs.promises.writeFile(testFilePath, testContent);
    console.log('   ✅ Archivo de prueba creado');

    // Cifrar el archivo (simulando lo que hace encryptAfterUpload)
    const { encryptFile } = require('./utils/encryption');
    await encryptFile(testFilePath);
    console.log('   ✅ Archivo cifrado');

    // Verificar que está cifrado
    const rawData = await fs.promises.readFile(testFilePath);
    if (isEncrypted(rawData)) {
      console.log('   ✅ Archivo está cifrado (verificado)');
    } else {
      console.log('   ❌ ERROR: Archivo NO está cifrado!');
      return;
    }

    // Descifrar y verificar contenido
    const decrypted = await decryptFile(testFilePath);
    if (decrypted.toString('utf8') === testContent) {
      console.log('   ✅ Archivo descifrado correctamente');
    } else {
      console.log('   ❌ ERROR: Contenido no coincide después de descifrar');
      return;
    }

    // Limpiar
    await fs.promises.unlink(testFilePath);
    console.log('   ✅ Archivo de prueba eliminado\n');

  } catch (error) {
    console.error('   ❌ ERROR en prueba de uploads:', error.message);
  }

  // ==========================================
  // 4. Verificar archivos en uploads
  // ==========================================
  console.log('4️⃣  Verificando archivos en data/uploads/...');
  try {
    const uploadDir = path.join(__dirname, 'data', 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      console.log('   ℹ️  Directorio uploads no existe aún\n');
    } else {
      const files = await fs.promises.readdir(uploadDir);
      
      if (files.length === 0) {
        console.log('   ℹ️  No hay archivos en uploads aún\n');
      } else {
        let encryptedCount = 0;
        let unencryptedCount = 0;

        for (const file of files) {
          const filePath = path.join(uploadDir, file);
          const rawData = await fs.promises.readFile(filePath);
          
          if (isEncrypted(rawData)) {
            encryptedCount++;
            console.log(`   ✅ ${file} - CIFRADO`);
          } else {
            unencryptedCount++;
            console.log(`   ⚠️  ${file} - NO CIFRADO`);
          }
        }

        console.log(`\n   Resumen: ${encryptedCount} cifrados, ${unencryptedCount} sin cifrar\n`);
      }
    }
  } catch (error) {
    console.error('   ❌ ERROR verificando uploads:', error.message);
  }

  // ==========================================
  // 5. Prueba de funciones de cifrado básicas
  // ==========================================
  console.log('5️⃣  Probando funciones básicas de cifrado/descifrado...');
  try {
    const testString = 'Este es un texto de prueba para cifrado';
    const encrypted = encrypt(testString);
    
    if (!isEncrypted(encrypted)) {
      console.log('   ❌ ERROR: Datos cifrados no se detectan como cifrados');
      return;
    }
    console.log('   ✅ Datos cifrados correctamente');

    const decrypted = decrypt(encrypted);
    if (decrypted.toString('utf8') === testString) {
      console.log('   ✅ Datos descifrados correctamente');
    } else {
      console.log('   ❌ ERROR: Datos no coinciden después de descifrar');
      return;
    }

    console.log('   ✅ Funciones básicas funcionan correctamente\n');

  } catch (error) {
    console.error('   ❌ ERROR en prueba básica:', error.message);
  }

  console.log('✅ Todas las pruebas completadas!\n');
  console.log('💡 Nota: Los archivos existentes sin cifrar se cifrarán automáticamente');
  console.log('   cuando se escriban por primera vez usando writeJson o cuando se suban nuevos archivos.\n');
}

// Ejecutar pruebas
testEncryption().catch(error => {
  console.error('❌ Error fatal en las pruebas:', error);
  process.exit(1);
});

