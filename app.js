const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const supervisorRoutes = require('./routes/supervisor.routes');
const clienteRoutes = require('./routes/cliente.routes');
const auditorRoutes = require('./routes/auditor.routes');

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

// Salud
app.get('/', (req, res) => {
  res.send('AuditCloud backend con JSON está vivo 🛰️');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
