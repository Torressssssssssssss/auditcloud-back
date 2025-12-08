/**
 * Script para cifrar todos los archivos JSON existentes en data/
 * 
 * Ejecutar: node cifrar-archivos-existentes.js
 */

const fs = require('fs');
const path = require('path');
const { readEncryptedJson, writeEncryptedJson, isEncrypted } = require('./utils/encryption');

async function cifrarArchivosExistentes() {
  console.log('🔐 Cifrando archivos JSON existentes...\n');

  const dataDir = path.join(__dirname, 'data');
  
  try {
    // Obtener todos los archivos JSON
    const files = await fs.promises.readdir(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('No se encontraron archivos JSON para cifrar.\n');
      return;
    }

    let cifrados = 0;
    let yaCifrados = 0;
    let errores = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      
      try {
        // Leer el archivo como Buffer para verificar si está cifrado
        const rawData = await fs.promises.readFile(filePath);
        
        if (isEncrypted(rawData)) {
          console.log(`   ✅ ${file} - Ya estaba cifrado`);
          yaCifrados++;
        } else {
          console.log(`   🔄 ${file} - Cifrando...`);
          
          // Leer el contenido (sin cifrar)
          const jsonString = rawData.toString('utf8');
          const jsonData = JSON.parse(jsonString || '[]');
          
          // Escribir cifrado
          await writeEncryptedJson(filePath, jsonData);
          
          // Verificar que se cifró correctamente
          const verifyData = await fs.promises.readFile(filePath);
          if (isEncrypted(verifyData)) {
            console.log(`   ✅ ${file} - Cifrado correctamente`);
            cifrados++;
          } else {
            console.log(`   ❌ ${file} - Error: No se cifró correctamente`);
            errores++;
          }
        }
      } catch (error) {
        console.error(`   ❌ ${file} - Error: ${error.message}`);
        errores++;
      }
    }

    console.log('\n📊 Resumen:');
    console.log(`   ✅ Cifrados: ${cifrados}`);
    console.log(`   ℹ️  Ya estaban cifrados: ${yaCifrados}`);
    console.log(`   ❌ Errores: ${errores}`);
    console.log(`   📁 Total: ${jsonFiles.length}\n`);

    if (cifrados > 0) {
      console.log('✅ Todos los archivos han sido cifrados correctamente!\n');
    } else if (yaCifrados === jsonFiles.length) {
      console.log('ℹ️  Todos los archivos ya estaban cifrados.\n');
    }

  } catch (error) {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  }
}

// Ejecutar
cifrarArchivosExistentes().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});

