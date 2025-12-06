const express = require('express');
const router = express.Router();
const { readJson, writeJson, getNextId } = require('../utils/jsonDb');
const { authenticate, authorize } = require('../utils/auth');

// GET /api/auditor/auditorias-asignadas/:idAuditor
// Lista auditorías donde el auditor participa
router.get('/auditorias-asignadas/:idAuditor', authenticate, authorize([2]), async (req, res) => {
  const idAuditor = Number(req.params.idAuditor);
  const participantes = await readJson('auditoria_participantes.json');
  const auditorias = await readJson('auditorias.json');

  const idsAuditorias = participantes
    .filter(p => p.id_auditor === idAuditor)
    .map(p => p.id_auditoria);

  const resultado = auditorias.filter(a => idsAuditorias.includes(a.id_auditoria));
  res.json(resultado);
});

// POST /api/auditor/evidencias
// Crea una evidencia ligada a una auditoría y un módulo ambiental
router.post('/evidencias', authenticate, authorize([2]), async (req, res) => {
  const { id_auditoria, id_modulo, id_auditor, tipo, descripcion, url } = req.body;
  if (!id_auditoria || !id_modulo || !id_auditor || !tipo || !descripcion) {
    return res.status(400).json({ message: 'id_auditoria, id_modulo, id_auditor, tipo y descripcion son obligatorios' });
  }

  const evidencias = await readJson('evidencias.json');
  const auditorias = await readJson('auditorias.json');
  const auditoriaModulos = await readJson('auditoria_modulos.json');
  const participantes = await readJson('auditoria_participantes.json');

  const existeAuditoria = auditorias.some(a => a.id_auditoria === Number(id_auditoria));
  if (!existeAuditoria) return res.status(404).json({ message: 'Auditoría no encontrada' });
  const moduloAsociado = auditoriaModulos.some(am => am.id_auditoria === Number(id_auditoria) && am.id_modulo === Number(id_modulo));
  if (!moduloAsociado) return res.status(400).json({ message: 'Módulo no asociado a la auditoría' });
  const participa = participantes.some(p => p.id_auditoria === Number(id_auditoria) && p.id_auditor === Number(id_auditor));
  if (!participa) return res.status(403).json({ message: 'Auditor no asignado a la auditoría' });
  const idEvidencia = await getNextId('evidencias.json', 'id_evidencia');

  const nueva = {
    id_evidencia: idEvidencia,
    id_auditoria: Number(id_auditoria),
    id_modulo: Number(id_modulo),
    id_auditor: Number(id_auditor),
    tipo,
    descripcion,
    url: url || null,
    creado_en: new Date().toISOString()
  };

  evidencias.push(nueva);
  await writeJson('evidencias.json', evidencias);

  res.status(201).json({ message: 'Evidencia creada', evidencia: nueva });
});

// GET /api/auditor/evidencias/:idAuditoria
// Lista evidencias por auditoría
router.get('/evidencias/:idAuditoria', authenticate, authorize([2]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const evidencias = await readJson('evidencias.json');
  const all = evidencias.filter(e => e.id_auditoria === idAuditoria);
  const start = (page - 1) * limit;
  const data = all.slice(start, start + limit);
  res.json({ total: all.length, page, limit, data });
});

// PUT /api/auditor/evidencias/:idEvidencia
// Actualiza campos de una evidencia
router.put('/evidencias/:idEvidencia', authenticate, authorize([2]), async (req, res) => {
  const idEvidencia = Number(req.params.idEvidencia);
  const { tipo, descripcion, url } = req.body;

  const evidencias = await readJson('evidencias.json');
  const idx = evidencias.findIndex(e => e.id_evidencia === idEvidencia);
  if (idx === -1) {
    return res.status(404).json({ message: 'Evidencia no encontrada' });
  }

  if (tipo !== undefined) evidencias[idx].tipo = tipo;
  if (descripcion !== undefined) evidencias[idx].descripcion = descripcion;
  if (url !== undefined) evidencias[idx].url = url;
  evidencias[idx].actualizado_en = new Date().toISOString();

  await writeJson('evidencias.json', evidencias);
  res.json({ message: 'Evidencia actualizada', evidencia: evidencias[idx] });
});

// DELETE /api/auditor/evidencias/:idEvidencia
// Elimina una evidencia
router.delete('/evidencias/:idEvidencia', authenticate, authorize([2]), async (req, res) => {
  const idEvidencia = Number(req.params.idEvidencia);
  let evidencias = await readJson('evidencias.json');
  const existe = evidencias.some(e => e.id_evidencia === idEvidencia);
  if (!existe) {
    return res.status(404).json({ message: 'Evidencia no encontrada' });
  }
  evidencias = evidencias.filter(e => e.id_evidencia !== idEvidencia);
  await writeJson('evidencias.json', evidencias);
  res.json({ message: 'Evidencia eliminada' });
});


module.exports = router;

// --- Solicitudes de pago (auditor) ---
// Permite al auditor crear una solicitud de cobro a un cliente
// POST /api/auditor/solicitudes-pago
router.post('/solicitudes-pago', authenticate, authorize([2]), async (req, res) => {
  // 1. Recibimos id_empresa en lugar de id_cliente
  const { id_empresa, monto, concepto } = req.body;
  
  const id_empresa_auditora = req.user.id_empresa;

  if (!id_empresa || !monto || !concepto) {
    return res.status(400).json({ message: 'id_empresa, monto y concepto son obligatorios' });
  }

  const solicitudes = await readJson('solicitudes_pago.json');
  const empresas = await readJson('empresas.json');
  const usuarios = await readJson('usuarios.json');

  // 2. Validamos que la EMPRESA exista y sea TIPO CLIENTE (id_tipo_empresa: 2)
  const empresaObjetivo = empresas.find(e => e.id_empresa === Number(id_empresa) && e.activo);
  
  if (!empresaObjetivo) {
    return res.status(404).json({ message: 'Empresa no encontrada' });
  }
  if (empresaObjetivo.id_tipo_empresa !== 2) {
    return res.status(400).json({ message: 'El ID proporcionado no es una empresa Cliente (es auditora u otro tipo).' });
  }

  // 3. (Truco de compatibilidad) Buscamos el usuario principal de esa empresa
  // Necesitamos un id_cliente para que aparezca en el Dashboard del usuario
  const usuarioPrincipal = usuarios.find(u => u.id_empresa === Number(id_empresa) && u.id_rol === 3 && u.activo);

  if (!usuarioPrincipal) {
    return res.status(400).json({ 
      message: 'La empresa existe, pero no tiene ningún usuario administrador registrado para recibir el cobro.' 
    });
  }

  const idSolicitud = await getNextId('solicitudes_pago.json', 'id_solicitud');
  
  const nueva = {
    id_solicitud: idSolicitud,
    id_empresa: Number(id_empresa_auditora),
    id_empresa_auditora: Number(id_empresa_auditora),
    
    // Guardamos ambos datos: a qué empresa se cobra y a qué usuario se le notifica
    id_empresa_cliente: Number(id_empresa), 
    id_cliente: usuarioPrincipal.id_usuario, // Mantenemos esto para que funcione tu dashboard actual
    
    monto: Number(monto),
    concepto,
    id_estado: 1,
    creado_en: new Date().toISOString(),
    creado_por_auditor: req.user.id_usuario
  };

  solicitudes.push(nueva);
  await writeJson('solicitudes_pago.json', solicitudes);

  res.status(201).json({ 
    message: `Solicitud creada para la empresa ${empresaObjetivo.nombre}`, 
    solicitud: nueva 
  });
});

// GET /api/auditor/solicitudes-pago
// Lista solicitudes de pago de la empresa auditora del auditor
router.get('/solicitudes-pago', authenticate, authorize([2]), async (req, res) => {
  try {
    const idEmpresaAuditora = req.user.id_empresa;
    const solicitudes = await readJson('solicitudes_pago.json');
    const empresas = await readJson('empresas.json');

    const misSolicitudes = solicitudes.filter(s => s.id_empresa_auditora === idEmpresaAuditora || s.id_empresa === idEmpresaAuditora);

    const data = misSolicitudes.map(s => {
      let nombreCliente = 'Desconocido';
      if (s.id_empresa_cliente) {
        const empresa = empresas.find(e => e.id_empresa === s.id_empresa_cliente);
        if (empresa) nombreCliente = empresa.nombre;
      }
      return {
        ...s,
        nombre_empresa_cliente: nombreCliente,
        es_mio: s.creado_por_auditor === req.user.id_usuario
      };
    });

    data.sort((a, b) => {
      if (a.id_estado === b.id_estado) return new Date(b.creado_en) - new Date(a.creado_en);
      return a.id_estado - b.id_estado;
    });

    res.json(data);
  } catch (error) {
    console.error('Error al obtener solicitudes del auditor:', error);
    res.status(500).json({ message: 'Error al obtener el historial de cobros' });
  }
});