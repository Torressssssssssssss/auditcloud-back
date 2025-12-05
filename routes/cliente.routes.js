const express = require('express');
const router = express.Router();
const { readJson, writeJson, getNextId } = require('../utils/jsonDb');
const { authenticate, authorize } = require('../utils/auth');

// GET /api/cliente/conversaciones/:idCliente
// Lista conversaciones del cliente
router.get('/conversaciones/:idCliente', authenticate, authorize([3]), async (req, res) => {
  const idCliente = Number(req.params.idCliente);
  const conversaciones = await readJson('conversaciones.json');
  const resultado = conversaciones.filter(c => c.id_cliente === idCliente);
  res.json(resultado);
});

// POST /api/cliente/conversaciones
// Crea una conversación nueva entre cliente y empresa auditora
router.post('/conversaciones', authenticate, authorize([3]), async (req, res) => {
  const { id_cliente, id_empresa_auditora, asunto, primer_mensaje } = req.body;
  if (!id_cliente || !id_empresa_auditora || !asunto || !primer_mensaje) {
    return res.status(400).json({ message: 'id_cliente, id_empresa_auditora, asunto y primer_mensaje son obligatorios' });
  }

  const conversaciones = await readJson('conversaciones.json');
  const mensajes = await readJson('mensajes.json');
  const empresas = await readJson('empresas.json');
  const usuarios = await readJson('usuarios.json');
  const clienteValido = usuarios.some(u => u.id_usuario === Number(id_cliente) && u.id_rol === 3 && u.activo);
  const empresaValida = empresas.some(e => e.id_empresa === Number(id_empresa_auditora) && e.activo);
  if (!clienteValido) return res.status(404).json({ message: 'Cliente no encontrado o inactivo' });
  if (!empresaValida) return res.status(404).json({ message: 'Empresa auditora no encontrada o inactiva' });

  const idConversacion = await getNextId('conversaciones.json', 'id_conversacion');
  const nueva = {
    id_conversacion: idConversacion,
    id_cliente: Number(id_cliente),
    id_empresa_auditora: Number(id_empresa_auditora),
    asunto,
    creado_en: new Date().toISOString(),
    activo: true
  };

  conversaciones.push(nueva);
  await writeJson('conversaciones.json', conversaciones);

  const idMensaje = await getNextId('mensajes.json', 'id_mensaje');
  const mensajeInicial = {
    id_mensaje: idMensaje,
    id_conversacion: idConversacion,
    emisor_tipo: 'CLIENTE',
    emisor_id: Number(id_cliente),
    contenido: primer_mensaje,
    creado_en: new Date().toISOString()
  };
  mensajes.push(mensajeInicial);
  await writeJson('mensajes.json', mensajes);

  res.status(201).json({
    message: 'Conversación creada',
    conversacion: nueva,
    primer_mensaje: mensajeInicial
  });
});

module.exports = router;

// --- Auditorías del cliente ---
// GET /api/cliente/auditorias/:idCliente
router.get('/auditorias/:idCliente', authenticate, authorize([3]), async (req, res) => {
  const idCliente = Number(req.params.idCliente);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const auditorias = await readJson('auditorias.json');
  const all = auditorias.filter(a => a.id_cliente === idCliente);
  const start = (page - 1) * limit;
  const data = all.slice(start, start + limit);
  res.json({ total: all.length, page, limit, data });
});

// --- Solicitudes de pago del cliente ---
// GET /api/cliente/solicitudes-pago/:idCliente
router.get('/solicitudes-pago/:idCliente', authenticate, authorize([3]), async (req, res) => {
  const idCliente = Number(req.params.idCliente);
  const solicitudes = await readJson('solicitudes_pago.json');
  res.json(solicitudes.filter(s => s.id_cliente === idCliente));
});

// POST /api/cliente/solicitudes-pago
// El cliente puede solicitar un pago (por ejemplo anticipo)
router.post('/solicitudes-pago', authenticate, authorize([3]), async (req, res) => {
  const { id_cliente, id_empresa_auditora, monto, concepto } = req.body;
  if (!id_cliente || !id_empresa_auditora || !monto || !concepto) {
    return res.status(400).json({ message: 'id_cliente, id_empresa_auditora, monto y concepto son obligatorios' });
  }

  const solicitudes = await readJson('solicitudes_pago.json');
  const empresas = await readJson('empresas.json');
  const usuarios = await readJson('usuarios.json');
  const clienteValido = usuarios.some(u => u.id_usuario === Number(id_cliente) && u.id_rol === 3 && u.activo);
  const empresaValida = empresas.some(e => e.id_empresa === Number(id_empresa_auditora) && e.activo);
  if (!clienteValido) return res.status(404).json({ message: 'Cliente no encontrado o inactivo' });
  if (!empresaValida) return res.status(404).json({ message: 'Empresa auditora no encontrada o inactiva' });
  const idSolicitud = await getNextId('solicitudes_pago.json', 'id_solicitud');
  const nueva = {
    id_solicitud: idSolicitud,
    id_empresa: Number(id_empresa_auditora),
    id_cliente: Number(id_cliente),
    monto: Number(monto),
    concepto,
    id_estado: 1,
    creado_en: new Date().toISOString()
  };
  solicitudes.push(nueva);
  await writeJson('solicitudes_pago.json', solicitudes);
  res.status(201).json({ message: 'Solicitud de pago creada por cliente', solicitud: nueva });
});
