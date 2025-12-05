const express = require('express');
const router = express.Router();
const { readJson, writeJson, getNextId } = require('../utils/jsonDb');
const { authenticate, authorize } = require('../utils/auth');

// GET /api/supervisor/auditores/:idEmpresa
router.get('/auditores/:idEmpresa', authenticate, authorize([1]), async (req, res) => {
  const idEmpresa = Number(req.params.idEmpresa);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const usuarios = await readJson('usuarios.json');

  const all = usuarios.filter(
    u => u.id_empresa === idEmpresa && u.id_rol === 2 && u.activo
  );
  const start = (page - 1) * limit;
  const data = all.slice(start, start + limit);
  res.json({ total: all.length, page, limit, data });
});

// POST /api/supervisor/auditores
router.post('/auditores', authenticate, authorize([1]), async (req, res) => {
  const { id_empresa, nombre, correo, password } = req.body;

  if (!id_empresa || !nombre || !correo || !password) {
    return res.status(400).json({ message: 'id_empresa, nombre, correo y password son obligatorios' });
  }

  const usuarios = await readJson('usuarios.json');
  const empresas = await readJson('empresas.json');
  const existeEmpresa = empresas.some(e => e.id_empresa === Number(id_empresa) && e.activo);
  if (!existeEmpresa) {
    return res.status(404).json({ message: 'Empresa no encontrada o inactiva' });
  }

  const yaExiste = usuarios.find(u => u.correo === correo);
  if (yaExiste) {
    return res.status(400).json({ message: 'Ese correo ya está registrado' });
  }

  const bcrypt = require('bcryptjs');
  const idNuevo = await getNextId('usuarios.json', 'id_usuario');

  const nuevoAuditor = {
    id_usuario: idNuevo,
    id_empresa: Number(id_empresa),
    nombre,
    correo,
    password_hash: bcrypt.hashSync(password, 10),
    id_rol: 2,
    activo: true,
    creado_en: new Date().toISOString()
  };

  usuarios.push(nuevoAuditor);
  await writeJson('usuarios.json', usuarios);

  res.status(201).json({
    message: 'Auditor creado correctamente',
    auditor: {
      id_usuario: nuevoAuditor.id_usuario,
      id_empresa: nuevoAuditor.id_empresa,
      nombre: nuevoAuditor.nombre,
      correo: nuevoAuditor.correo,
      id_rol: nuevoAuditor.id_rol
    }
  });
});

module.exports = router;

// --- Solicitudes de pago ---
// POST /api/supervisor/solicitudes-pago
// Crea solicitud de pago en estado PENDIENTE
router.post('/solicitudes-pago', authenticate, authorize([1]), async (req, res) => {
  const { id_empresa, id_cliente, monto, concepto } = req.body;

  if (!id_empresa || !id_cliente || !monto || !concepto) {
    return res.status(400).json({ message: 'id_empresa, id_cliente, monto y concepto son obligatorios' });
  }

  const solicitudes = await readJson('solicitudes_pago.json');
  const empresas = await readJson('empresas.json');
  const usuarios = await readJson('usuarios.json');
  const empresaValida = empresas.some(e => e.id_empresa === Number(id_empresa) && e.activo);
  const clienteValido = usuarios.some(u => u.id_usuario === Number(id_cliente) && u.id_rol === 3 && u.activo);
  if (!empresaValida) return res.status(404).json({ message: 'Empresa no encontrada o inactiva' });
  if (!clienteValido) return res.status(404).json({ message: 'Cliente no encontrado o inactivo' });
  const idSolicitud = await getNextId('solicitudes_pago.json', 'id_solicitud');

  const nueva = {
    id_solicitud: idSolicitud,
    id_empresa: Number(id_empresa),
    id_cliente: Number(id_cliente),
    monto: Number(monto),
    concepto,
    id_estado: 1, // PENDIENTE
    creado_en: new Date().toISOString()
  };

  solicitudes.push(nueva);
  await writeJson('solicitudes_pago.json', solicitudes);

  res.status(201).json({ message: 'Solicitud de pago creada', solicitud: nueva });
});

// GET /api/supervisor/solicitudes-pago/:idEmpresa
// Lista solicitudes de pago por empresa
router.get('/solicitudes-pago/:idEmpresa', authenticate, authorize([1]), async (req, res) => {
  const idEmpresa = Number(req.params.idEmpresa);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const solicitudes = await readJson('solicitudes_pago.json');
  const all = solicitudes.filter(s => s.id_empresa === idEmpresa);
  const start = (page - 1) * limit;
  const data = all.slice(start, start + limit);
  res.json({ total: all.length, page, limit, data });
});

// POST /api/supervisor/solicitudes-pago/:idSolicitud/pagar
// Marca solicitud como PAGADA y crea una auditoría vinculada
router.post('/solicitudes-pago/:idSolicitud/pagar', authenticate, authorize([1]), async (req, res) => {
  const idSolicitud = Number(req.params.idSolicitud);

  const solicitudes = await readJson('solicitudes_pago.json');
  const auditorias = await readJson('auditorias.json');

  const solicitud = solicitudes.find(s => s.id_solicitud === idSolicitud);
  if (!solicitud) {
    return res.status(404).json({ message: 'Solicitud no encontrada' });
  }
  if (solicitud.id_estado === 2) {
    return res.status(400).json({ message: 'La solicitud ya está pagada' });
  }

  solicitud.id_estado = 2; // PAGADA
  solicitud.pagada_en = new Date().toISOString();
  await writeJson('solicitudes_pago.json', solicitudes);

  const idAuditoria = await getNextId('auditorias.json', 'id_auditoria');
  const nuevaAuditoria = {
    id_auditoria: idAuditoria,
    id_empresa_auditora: solicitud.id_empresa,
    id_cliente: solicitud.id_cliente,
    id_solicitud_pago: solicitud.id_solicitud,
    id_estado: 1, // CREADA
    creada_en: new Date().toISOString()
  };
  auditorias.push(nuevaAuditoria);
  await writeJson('auditorias.json', auditorias);

  res.json({ message: 'Pago registrado y auditoría creada', solicitud, auditoria: nuevaAuditoria });
});

// PUT /api/supervisor/auditorias/:idAuditoria/estado
// Cambia el estado de la auditoría (CREADA, EN_PROCESO, FINALIZADA)
router.put('/auditorias/:idAuditoria/estado', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const { id_estado } = req.body;
  if (!id_estado) return res.status(400).json({ message: 'id_estado es obligatorio' });

  const auditorias = await readJson('auditorias.json');
  const estados = await readJson('estados_auditoria.json');
  const auditoriaIdx = auditorias.findIndex(a => a.id_auditoria === idAuditoria);
  if (auditoriaIdx === -1) return res.status(404).json({ message: 'Auditoría no encontrada' });
  const estadoValido = estados.some(e => e.id_estado === Number(id_estado));
  if (!estadoValido) return res.status(400).json({ message: 'Estado de auditoría inválido' });

  auditorias[auditoriaIdx].id_estado = Number(id_estado);
  auditorias[auditoriaIdx].estado_actualizado_en = new Date().toISOString();
  await writeJson('auditorias.json', auditorias);

  res.json({ message: 'Estado de auditoría actualizado', auditoria: auditorias[auditoriaIdx] });
});

// --- Asignación de auditores a auditorías ---
// POST /api/supervisor/auditorias/:idAuditoria/asignar
// Body: { id_auditor }
router.post('/auditorias/:idAuditoria/asignar', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const { id_auditor } = req.body;
  if (!id_auditor) {
    return res.status(400).json({ message: 'id_auditor es obligatorio' });
  }

  const auditorias = await readJson('auditorias.json');
  const participantes = await readJson('auditoria_participantes.json');
  const usuarios = await readJson('usuarios.json');
  const existeAuditoria = auditorias.some(a => a.id_auditoria === idAuditoria);
  if (!existeAuditoria) {
    return res.status(404).json({ message: 'Auditoría no encontrada' });
  }
  const existeAuditor = usuarios.some(u => u.id_usuario === Number(id_auditor) && u.id_rol === 2 && u.activo);
  if (!existeAuditor) {
    return res.status(404).json({ message: 'Auditor no encontrado o inactivo' });
  }

  const yaAsignado = participantes.find(p => p.id_auditoria === idAuditoria && p.id_auditor === Number(id_auditor));
  if (yaAsignado) {
    return res.status(400).json({ message: 'El auditor ya está asignado a esta auditoría' });
  }

  const idParticipante = await getNextId('auditoria_participantes.json', 'id_participante');
  const nuevo = {
    id_participante: idParticipante,
    id_auditoria: idAuditoria,
    id_auditor: Number(id_auditor),
    asignado_en: new Date().toISOString()
  };
  participantes.push(nuevo);
  await writeJson('auditoria_participantes.json', participantes);
  res.status(201).json({ message: 'Auditor asignado', participante: nuevo });
});

// --- Registro de módulos ambientales en auditoría ---
// POST /api/supervisor/auditorias/:idAuditoria/modulos
// Body: { id_modulo }
router.post('/auditorias/:idAuditoria/modulos', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const { id_modulo } = req.body;
  if (!id_modulo) {
    return res.status(400).json({ message: 'id_modulo es obligatorio' });
  }

  const auditorias = await readJson('auditorias.json');
  const modulosAmbientales = await readJson('modulos_ambientales.json');
  const auditoriaModulos = await readJson('auditoria_modulos.json');

  const existeAuditoria = auditorias.some(a => a.id_auditoria === idAuditoria);
  if (!existeAuditoria) {
    return res.status(404).json({ message: 'Auditoría no encontrada' });
  }
  const existeModulo = modulosAmbientales.some(m => m.id_modulo === Number(id_modulo));
  if (!existeModulo) {
    return res.status(404).json({ message: 'Módulo ambiental no encontrado' });
  }
  const yaAsociado = auditoriaModulos.find(am => am.id_auditoria === idAuditoria && am.id_modulo === Number(id_modulo));
  if (yaAsociado) {
    return res.status(400).json({ message: 'El módulo ya está asociado a esta auditoría' });
  }

  const idAuditoriaModulo = await getNextId('auditoria_modulos.json', 'id_auditoria_modulo');
  const nuevo = {
    id_auditoria_modulo: idAuditoriaModulo,
    id_auditoria: idAuditoria,
    id_modulo: Number(id_modulo),
    registrado_en: new Date().toISOString()
  };
  auditoriaModulos.push(nuevo);
  await writeJson('auditoria_modulos.json', auditoriaModulos);
  res.status(201).json({ message: 'Módulo asociado a auditoría', auditoria_modulo: nuevo });
});
