const admin = require('firebase-admin');
require('dotenv').config();

// Inicializar Firebase Admin
// Opción 1: Usar archivo de credenciales (recomendado para producción)
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  // Si tienes la clave como string JSON en variable de entorno
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
  });
} else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
  // Si tienes la ruta al archivo JSON de credenciales
  const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
  });
} else {
  // Opción 2: Usar credenciales por defecto (para desarrollo local)
  // Necesitas crear un archivo serviceAccountKey.json en la raíz del proyecto
  try {
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
    });
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error.message);
    console.error('💡 Asegúrate de tener configuradas las credenciales de Firebase');
    // No lanzar error para que el servidor pueda iniciar sin Firebase (modo desarrollo)
  }
}

module.exports = admin;

