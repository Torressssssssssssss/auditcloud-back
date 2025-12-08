/**
 * Script rápido para verificar que los archivos están cifrados
 * 
 * Ejecutar: node verificar-cifrado.js
 */

const fs = require('fs');
const path = require('path');
const { isEncrypted } = require('./utils/encryption');

async function verificarCifrado() {
  console.log('🔍 Verificando cifrado de archivos...\n');

  const dataDir = path.join(__dirname, 'data');
  const uploadsDir = path.join(__dirname, 'data', 'uploads');

  // Verificar archivos JSON
  console.log('📄 Archivos JSON en data/:');
  try {
    const files = await fs.promises.readdir(dataDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('   No hay archivos JSON\n');
    } else {
      for (const file of jsonFiles) {
        const filePath = path.join(dataDir, file);
        const rawData = await fs.promises.readFile(filePath);
        
        if (isEncrypted(rawData)) {
          console.log(`   ✅ ${file} - CIFRADO`);
        } else {
          console.log(`   ⚠️  ${file} - NO CIFRADO (se cifrará en la próxima escritura)`);
        }
      }
      console.log('');
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  // Verificar archivos en uploads
  console.log('📁 Archivos en data/uploads/:');
  try {
    if (!fs.existsSync(uploadsDir)) {
      console.log('   Directorio no existe aún\n');
    } else {
      const files = await fs.promises.readdir(uploadsDir);
      
      if (files.length === 0) {
        console.log('   No hay archivos subidos aún\n');
      } else {
        for (const file of files) {
          const filePath = path.join(uploadsDir, file);
          const rawData = await fs.promises.readFile(filePath);
          
          if (isEncrypted(rawData)) {
            console.log(`   ✅ ${file} - CIFRADO`);
          } else {
            console.log(`   ⚠️  ${file} - NO CIFRADO`);
          }
        }
        console.log('');
      }
    }
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }

  console.log('💡 Para probar el cifrado completo, ejecuta: node test-encryption.js');
}

verificarCifrado().catch(console.error);

