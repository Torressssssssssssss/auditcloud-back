require('dotenv').config(); 

const express = require('express');
const path = require('path'); // Importar path
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const supervisorRoutes = require('./routes/supervisor.routes');
const clienteRoutes = require('./routes/cliente.routes');
const auditorRoutes = require('./routes/auditor.routes');
const paypalRoutes = require('./routes/paypal.routes');
const timelineRoutes = require('./routes/timeline.routes');
const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/cliente', clienteRoutes);
app.use('/api/auditor', auditorRoutes);
app.use('/api/paypal', paypalRoutes);
// Servir archivos subidos desde `back/data/uploads` en la ruta pública /uploads
app.use('/uploads', express.static(path.join(__dirname, 'data', 'uploads')));
app.use('/api/timeline', timelineRoutes); 

// Salud
app.get('/', (req, res) => {
  res.send('AuditCloud backend con JSON está vivo 🛰️');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
