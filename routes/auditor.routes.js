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
