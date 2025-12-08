/**
 * Script para gestionar el cifrado/descifrado de archivos JSON en data/
 * 
 * Ejecutar: 
 *   node gestionar-cifrado.js cifrar    -> Cifra todos los archivos JSON
 *   node gestionar-cifrado.js descifrar -> Descifra todos los archivos JSON
 */

const fs = require('fs');
const path = require('path');
const { readEncryptedJson, writeEncryptedJson, isEncrypted } = require('./utils/encryption');

async function cifrarArchivos() {
  console.log('[Cifrado] Iniciando cifrado de archivos JSON...\n');

  const dataDir = path.join(__dirname, 'data');
  
  try {
    const files = await fs.promises.readdir(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('[Cifrado] No se encontraron archivos JSON.\n');
      return;
    }

    let cifrados = 0;
    let yaCifrados = 0;
    let errores = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      
      try {
        const rawData = await fs.promises.readFile(filePath);
        
        if (isEncrypted(rawData)) {
          console.log(`[Cifrado] ${file} - Ya estaba cifrado`);
          yaCifrados++;
        } else {
          console.log(`[Cifrado] ${file} - Cifrando...`);
          
          const jsonString = rawData.toString('utf8');
          const jsonData = JSON.parse(jsonString || '[]');
          
          await writeEncryptedJson(filePath, jsonData);
          
          const verifyData = await fs.promises.readFile(filePath);
          if (isEncrypted(verifyData)) {
            console.log(`[Cifrado] ${file} - Cifrado exitosamente`);
            cifrados++;
          } else {
            console.log(`[Cifrado] ${file} - Error: No se cifró correctamente`);
            errores++;
          }
        }
      } catch (error) {
        console.error(`[Cifrado] ${file} - Error: ${error.message}`);
        errores++;
      }
    }

    console.log('\n[Cifrado] Resumen:');
    console.log(`  Cifrados: ${cifrados}`);
    console.log(`  Ya cifrados: ${yaCifrados}`);
    console.log(`  Errores: ${errores}`);
    console.log(`  Total: ${jsonFiles.length}\n`);

  } catch (error) {
    console.error('[Cifrado] Error fatal:', error);
    process.exit(1);
  }
}

async function descifrarArchivos() {
  console.log('[Descifrado] Iniciando descifrado de archivos JSON...\n');

  const dataDir = path.join(__dirname, 'data');
  
  try {
    const files = await fs.promises.readdir(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('[Descifrado] No se encontraron archivos JSON.\n');
      return;
    }

    let descifrados = 0;
    let yaDescifrados = 0;
    let errores = 0;

    for (const file of jsonFiles) {
      const filePath = path.join(dataDir, file);
      
      try {
        const rawData = await fs.promises.readFile(filePath);
        
        if (!isEncrypted(rawData)) {
          console.log(`[Descifrado] ${file} - Ya estaba descifrado`);
          yaDescifrados++;
        } else {
          console.log(`[Descifrado] ${file} - Descifrando...`);
          
          // Leer datos cifrados
          const jsonData = await readEncryptedJson(filePath);
          
          // Escribir en formato JSON plano (legible)
          const jsonString = JSON.stringify(jsonData, null, 2);
          await fs.promises.writeFile(filePath, jsonString, 'utf8');
          
          // Verificar que se descifró correctamente
          const verifyData = await fs.promises.readFile(filePath);
          if (!isEncrypted(verifyData)) {
            console.log(`[Descifrado] ${file} - Descifrado exitosamente`);
            descifrados++;
          } else {
            console.log(`[Descifrado] ${file} - Error: No se descifró correctamente`);
            errores++;
          }
        }
      } catch (error) {
        console.error(`[Descifrado] ${file} - Error: ${error.message}`);
        errores++;
      }
    }

    console.log('\n[Descifrado] Resumen:');
    console.log(`  Descifrados: ${descifrados}`);
    console.log(`  Ya descifrados: ${yaDescifrados}`);
    console.log(`  Errores: ${errores}`);
    console.log(`  Total: ${jsonFiles.length}\n`);

  } catch (error) {
    console.error('[Descifrado] Error fatal:', error);
    process.exit(1);
  }
}

function mostrarAyuda() {
  console.log('\n=== Gestor de Cifrado de Archivos JSON ===\n');
  console.log('Uso:');
  console.log('  node gestionar-cifrado.js cifrar    -> Cifra todos los archivos JSON en data/');
  console.log('  node gestionar-cifrado.js descifrar -> Descifra todos los archivos JSON en data/');
  console.log('\nNota: Los archivos ya cifrados/descifrados no se procesarán de nuevo.\n');
}

// Ejecutar según el argumento
const comando = process.argv[2];

if (!comando) {
  mostrarAyuda();
  process.exit(0);
}

switch (comando.toLowerCase()) {
  case 'cifrar':
    cifrarArchivos().catch(error => {
      console.error('[Cifrado] Error fatal:', error);
      process.exit(1);
    });
    break;
  
  case 'descifrar':
    descifrarArchivos().catch(error => {
      console.error('[Descifrado] Error fatal:', error);
      process.exit(1);
    });
    break;
  
  default:
    console.error(`\n[Error] Comando desconocido: "${comando}"`);
    mostrarAyuda();
    process.exit(1);
}
