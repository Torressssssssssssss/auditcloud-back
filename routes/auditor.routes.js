const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readJson, writeJson, getNextId } = require('../utils/jsonDb');
const { authenticate, authorize } = require('../utils/auth');

// ==========================================
// 1. CONFIGURACIÓN DE MULTER (Subida de Archivos)
// ==========================================

// Asegurar que la carpeta uploads exista dentro de `back/data/uploads`
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)){
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); 
  },
  filename: function (req, file, cb) {
    // Nombre único: timestamp + random + extensión original
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Filtro para seguridad (Solo imágenes y PDFs)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no soportado. Solo PDF, JPG y PNG.'), false);
  }
};

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB
  fileFilter: fileFilter
});

// ==========================================
// 2. RUTAS DE AUDITORÍAS
// ==========================================

// GET /api/auditor/auditorias-asignadas/:idAuditor
// Lista todas las auditorías donde participa el auditor, con datos enriquecidos
router.get('/auditorias-asignadas/:idAuditor', authenticate, authorize([2]), async (req, res) => {
  const idAuditor = Number(req.params.idAuditor);
  
  // Seguridad básica: Verificar que el auditor pida sus propios datos
  if (req.user.id_usuario !== idAuditor) {
    return res.status(403).json({ message: 'No puedes ver auditorías de otro usuario.' });
  }

  const participantes = await readJson('auditoria_participantes.json');
  const auditorias = await readJson('auditorias.json');
  const usuarios = await readJson('usuarios.json');
  const empresas = await readJson('empresas.json');
  const auditoriaModulos = await readJson('auditoria_modulos.json');

  const idsAuditorias = participantes
    .filter(p => p.id_auditor === idAuditor)
    .map(p => p.id_auditoria);

  const rawAuditorias = auditorias.filter(a => idsAuditorias.includes(a.id_auditoria));

  const resultado = rawAuditorias.map(auditoria => {
    const cliente = usuarios.find(u => u.id_usuario === auditoria.id_cliente);
    const empresaCliente = cliente ? empresas.find(e => e.id_empresa === cliente.id_empresa) : null;
    
    const modulos = auditoriaModulos
      .filter(am => am.id_auditoria === auditoria.id_auditoria)
      .map(am => am.id_modulo);

    return {
      ...auditoria,
      modulos,
      cliente: {
        id_usuario: cliente?.id_usuario,
        nombre: cliente?.nombre,
        nombre_empresa: empresaCliente?.nombre
      }
    };
  });

  res.json(resultado);
});

// GET /api/auditor/auditorias/:id
// Obtiene el detalle de una auditoría específica (Validando asignación)
router.get('/auditorias/:id', authenticate, authorize([2]), async (req, res) => {
  const idAuditoria = Number(req.params.id);
  const idAuditor = req.user.id_usuario;

  const auditorias = await readJson('auditorias.json');
  const participantes = await readJson('auditoria_participantes.json');
  const usuarios = await readJson('usuarios.json');
  const empresas = await readJson('empresas.json');
  const auditoriaModulos = await readJson('auditoria_modulos.json');

  // 1. Verificar seguridad: ¿Este auditor está asignado?
  const isAsignado = participantes.some(p => p.id_auditoria === idAuditoria && p.id_auditor === idAuditor);
  
  if (!isAsignado) {
    return res.status(403).json({ message: 'No tienes permiso para ver esta auditoría (no estás asignado).' });
  }

  // 2. Buscar auditoría
  const auditoria = auditorias.find(a => a.id_auditoria === idAuditoria);
  if (!auditoria) return res.status(404).json({ message: 'Auditoría no encontrada' });

  // 3. Enriquecer datos
  const cliente = usuarios.find(u => u.id_usuario === auditoria.id_cliente);
  const empresaCliente = cliente ? empresas.find(e => e.id_empresa === cliente.id_empresa) : null;
  
  const modulos = auditoriaModulos
      .filter(am => am.id_auditoria === auditoria.id_auditoria)
      .map(am => am.id_modulo);

  res.json({
    ...auditoria,
    modulos,
    cliente: {
      id_usuario: cliente?.id_usuario,
      nombre: cliente?.nombre,
      nombre_empresa: empresaCliente?.nombre
    }
  });
});

// ==========================================
// 3. RUTAS DE EVIDENCIAS
// ==========================================

// POST /api/auditor/evidencias
// Sube un archivo y crea el registro de evidencia
router.post('/evidencias', authenticate, authorize([2]), upload.single('archivo'), async (req, res) => {
  try {
    const { id_auditoria, id_modulo, tipo, descripcion } = req.body;
    
    // Validaciones
    if (!req.file) {
      return res.status(400).json({ message: 'Debes subir un archivo de evidencia (PDF o Imagen)' });
    }
    if (!id_auditoria || !id_modulo || !tipo || !descripcion) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' });
    }

    const evidencias = await readJson('evidencias.json');
    const idEvidencia = await getNextId('evidencias.json', 'id_evidencia');

    // Construir la URL pública
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const nueva = {
      id_evidencia: idEvidencia,
      id_auditoria: Number(id_auditoria),
      id_modulo: Number(id_modulo),
      id_auditor: req.user.id_usuario,
      tipo,
      descripcion,
      url: fileUrl,
      nombre_archivo: req.file.originalname,
      creado_en: new Date().toISOString()
    };

    evidencias.push(nueva);
    await writeJson('evidencias.json', evidencias);

    res.status(201).json({ message: 'Evidencia subida correctamente', evidencia: nueva });
  } catch (error) {
    console.error('Error al subir evidencia:', error);
    res.status(500).json({ message: error.message || 'Error interno al procesar el archivo' });
  }
});

// GET /api/auditor/evidencias/:idAuditoria
// Lista evidencias. Si idAuditoria es 0, lista todas las del auditor.
router.get('/evidencias/:idAuditoria', authenticate, authorize([2]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const evidencias = await readJson('evidencias.json');
  
  let resultado = [];
  if (idAuditoria > 0) {
    resultado = evidencias.filter(e => e.id_auditoria === idAuditoria);
  } else {
    // Todas las evidencias de este auditor
    const idAuditor = req.user.id_usuario;
    resultado = evidencias.filter(e => e.id_auditor === idAuditor);
  }
  
  res.json(resultado);
});

// PUT /api/auditor/evidencias/:idEvidencia
// Actualiza metadata de la evidencia (no el archivo)
router.put('/evidencias/:idEvidencia', authenticate, authorize([2]), async (req, res) => {
  const idEvidencia = Number(req.params.idEvidencia);
  const { tipo, descripcion } = req.body;

  const evidencias = await readJson('evidencias.json');
  const idx = evidencias.findIndex(e => e.id_evidencia === idEvidencia);
  
  if (idx === -1) return res.status(404).json({ message: 'Evidencia no encontrada' });
  if (evidencias[idx].id_auditor !== req.user.id_usuario) return res.status(403).json({ message: 'No es tu evidencia' });

  if (tipo !== undefined) evidencias[idx].tipo = tipo;
  if (descripcion !== undefined) evidencias[idx].descripcion = descripcion;
  evidencias[idx].actualizado_en = new Date().toISOString();

  await writeJson('evidencias.json', evidencias);
  res.json({ message: 'Evidencia actualizada', evidencia: evidencias[idx] });
});

// DELETE /api/auditor/evidencias/:idEvidencia
router.delete('/evidencias/:idEvidencia', authenticate, authorize([2]), async (req, res) => {
  const idEvidencia = Number(req.params.idEvidencia);
  let evidencias = await readJson('evidencias.json');
  
  const evidencia = evidencias.find(e => e.id_evidencia === idEvidencia);
  if (!evidencia) return res.status(404).json({ message: 'Evidencia no encontrada' });
  
  if (evidencia.id_auditor !== req.user.id_usuario) {
    return res.status(403).json({ message: 'No puedes borrar evidencias de otros' });
  }

  // Nota: Aquí se podría agregar lógica para borrar el archivo físico con fs.unlink

  evidencias = evidencias.filter(e => e.id_evidencia !== idEvidencia);
  await writeJson('evidencias.json', evidencias);
  res.json({ message: 'Evidencia eliminada' });
});

// ==========================================
// 4. RUTAS DE SOLICITUDES DE PAGO
// ==========================================

// POST /api/auditor/solicitudes-pago
// Crea una solicitud de cobro para una Empresa Cliente
router.post('/solicitudes-pago', authenticate, authorize([2]), async (req, res) => {
  const { id_empresa, monto, concepto } = req.body;
  const id_empresa_auditora = req.user.id_empresa;

  if (!id_empresa || !monto || !concepto) {
    return res.status(400).json({ message: 'id_empresa, monto y concepto son obligatorios' });
  }

  const solicitudes = await readJson('solicitudes_pago.json');
  const empresas = await readJson('empresas.json');
  const usuarios = await readJson('usuarios.json');

  // Validar Empresa Cliente
  const empresaObjetivo = empresas.find(e => e.id_empresa === Number(id_empresa) && e.activo);
  if (!empresaObjetivo || empresaObjetivo.id_tipo_empresa !== 2) {
    return res.status(400).json({ message: 'El ID proporcionado no es una empresa Cliente válida.' });
  }

  // Buscar Usuario Principal para asignar la notificación
  const usuarioPrincipal = usuarios.find(u => u.id_empresa === Number(id_empresa) && u.id_rol === 3 && u.activo);
  if (!usuarioPrincipal) {
    return res.status(400).json({ message: 'La empresa existe, pero no tiene usuario administrador para recibir el cobro.' });
  }

  const idSolicitud = await getNextId('solicitudes_pago.json', 'id_solicitud');
  
  const nueva = {
    id_solicitud: idSolicitud,
    id_empresa: Number(id_empresa_auditora),
    id_empresa_auditora: Number(id_empresa_auditora),
    id_empresa_cliente: Number(id_empresa),
    id_cliente: usuarioPrincipal.id_usuario,
    monto: Number(monto),
    concepto,
    id_estado: 1, // 1 = PENDIENTE
    creado_en: new Date().toISOString(),
    creado_por_auditor: req.user.id_usuario
  };

  solicitudes.push(nueva);
  await writeJson('solicitudes_pago.json', solicitudes);

  res.status(201).json({ 
    message: `Solicitud creada para ${empresaObjetivo.nombre}`, 
    solicitud: nueva 
  });
});

// GET /api/auditor/solicitudes-pago
// Lista historial de cobros de la empresa auditora
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

    // Ordenar: Pendientes primero, luego fecha
    data.sort((a, b) => {
      if (a.id_estado === b.id_estado) return new Date(b.creado_en) - new Date(a.creado_en);
      return a.id_estado - b.id_estado;
    });

    res.json(data);
  } catch (error) {
    console.error('Error al obtener solicitudes:', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

module.exports = router;