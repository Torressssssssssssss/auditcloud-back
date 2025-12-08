require('dotenv').config(); 

const express = require('express');
const path = require('path'); // Importar path
const cors = require('cors');
const fs = require('fs');
const { decryptFile } = require('./utils/encryption');

const authRoutes = require('./routes/auth.routes');
const supervisorRoutes = require('./routes/supervisor.routes');
const clienteRoutes = require('./routes/cliente.routes');
const auditorRoutes = require('./routes/auditor.routes');
const paypalRoutes = require('./routes/paypal.routes');
const timelineRoutes = require('./routes/timeline.routes');
const app = express();
const PORT = 3000;

// Middlewares
app.use(cors({
  origin: [
    'http://localhost:4200', 
    'http://10.187.164.6',      // Si sirves el front en puerto 80
    'http://10.187.164.6:4200'  // Si sirves el front en puerto 4200
  ],
  credentials: true
}));
app.use(express.json());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/cliente', clienteRoutes);
app.use('/api/auditor', auditorRoutes);
app.use('/api/paypal', paypalRoutes);

// Middleware personalizado para servir archivos cifrados desde /uploads
// Descifra los archivos antes de servirlos
app.use('/uploads', async (req, res, next) => {
  try {
    const fileName = req.path.split('/').pop();
    if (!fileName) {
      return next();
    }
    
    const filePath = path.join(__dirname, 'data', 'uploads', fileName);
    
    // Verificar que el archivo existe
    try {
      await fs.promises.access(filePath);
    } catch (err) {
      return res.status(404).json({ message: 'Archivo no encontrado' });
    }
    
    // Descifrar el archivo
    const decrypted = await decryptFile(filePath);
    
    // Determinar el tipo de contenido basado en la extensión
    const ext = path.extname(fileName).toLowerCase();
    const contentTypeMap = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    const contentType = contentTypeMap[ext] || 'application/octet-stream';
    
    // Enviar el archivo descifrado
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(decrypted);
  } catch (error) {
    console.error('Error sirviendo archivo cifrado:', error);
    res.status(500).json({ message: 'Error al procesar el archivo' });
  }
});

app.use('/api/timeline', timelineRoutes); 

// Salud
app.get('/', (req, res) => {
  res.send('AuditCloud backend con JSON está vivo 🛰️');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
