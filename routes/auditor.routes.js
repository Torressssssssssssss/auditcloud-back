const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readJson, writeJson, getNextId, crearNotificacion } = require('../utils/jsonDb');
const { authenticate, authorize } = require('../utils/auth');

// ==========================================
// 1. CONFIGURACIÓN DE MULTER (Disk Storage)
// ==========================================

// Configurar directorio de uploads
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// Disk storage - guardar archivos localmente
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(file.originalname);
    const filename = `${timestamp}-${randomStr}${ext}`;
    cb(null, filename);
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
  limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
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
      fecha_creacion: auditoria.creada_en || auditoria.creado_en,
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
    fecha_creacion: auditoria.creada_en || auditoria.creado_en,
    cliente: {
      id_usuario: cliente?.id_usuario,
      nombre: cliente?.nombre,
      nombre_empresa: empresaCliente?.nombre
    }
  });
});

// PATCH /api/auditor/auditorias/:id/objetivo
// Actualiza el objetivo y asigna fecha de inicio si es la primera vez
router.patch('/auditorias/:id/objetivo', authenticate, authorize([2]), async (req, res) => {
  const idAuditoria = Number(req.params.id);
  const { objetivo } = req.body; // Recibimos el texto del objetivo

  try {
    const auditorias = await readJson('auditorias.json');
    const index = auditorias.findIndex(a => a.id_auditoria === idAuditoria);

    if (index === -1) {
      return res.status(404).json({ message: 'Auditoría no encontrada' });
    }

    // Lógica de actualización
    const auditoriaActual = auditorias[index];
    
    // 1. Actualizamos el objetivo
    auditoriaActual.objetivo = objetivo;

    // 2. Guardamos en el JSON
    auditorias[index] = auditoriaActual;
    await writeJson('auditorias.json', auditorias);

    res.json(auditoriaActual);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar la auditoría' });
  }
});

// ==========================================
// 3. RUTAS DE EVIDENCIAS
// ==========================================

// POST /api/auditor/evidencias
// Sube un archivo y crea el registro de evidencia
// Si tipo === 'COMENTARIO', no se requiere archivo
router.post('/evidencias', authenticate, authorize([2]), upload.single('archivo'), async (req, res) => {
  try {
    const { id_auditoria, id_modulo, tipo, descripcion } = req.body;
    
    // Validaciones
    if (!id_auditoria || !id_modulo || !tipo || !descripcion) {
      return res.status(400).json({ message: 'id_auditoria, id_modulo, tipo y descripcion son obligatorios' });
    }

    // Si es comentario, no se requiere archivo. Si no es comentario, sí.
    if (tipo !== 'COMENTARIO' && !req.file) {
      return res.status(400).json({ message: 'Debes subir un archivo de evidencia (PDF o Imagen)' });
    }

    const evidencias = await readJson('evidencias.json');
    const idEvidencia = await getNextId('evidencias.json', 'id_evidencia');

    const nueva = {
      id_evidencia: idEvidencia,
      id_auditoria: Number(id_auditoria),
      id_modulo: Number(id_modulo),
      id_auditor: req.user.id_usuario,
      tipo,
      descripcion,
      nombre_archivo: req.file ? req.file.originalname : null,
      url_archivo: req.file ? `/uploads/${req.file.filename}` : null,
      creado_en: new Date().toISOString()
    };

    evidencias.push(nueva);
    await writeJson('evidencias.json', evidencias);

    // Crear notificación para el cliente
    try {
      const auditorias = await readJson('auditorias.json');
      const auditoria = auditorias.find(a => a.id_auditoria === Number(id_auditoria));
      
      if (auditoria && auditoria.id_cliente) {
        await crearNotificacion({
          id_cliente: auditoria.id_cliente,
          id_auditoria: auditoria.id_auditoria,
          tipo: 'evidencia_subida',
          titulo: 'Nueva evidencia subida',
          mensaje: `El auditor ha subido una nueva evidencia para la auditoría #${auditoria.id_auditoria}`
        });
      }
    } catch (notifError) {
      // No fallar la operación si la notificación falla
      console.error('Error al crear notificación de evidencia:', notifError);
    }

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

// ==========================================
// RUTAS DE MENSAJES Y CONVERSACIONES
// ==========================================

// GET /api/auditor/conversaciones
// El auditor ve las conversaciones de SU empresa con los clientes
router.get('/conversaciones', authenticate, authorize([2]), async (req, res) => {
  try {
    const idEmpresaAuditora = req.user.id_empresa;
    
    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');
    const usuarios = await readJson('usuarios.json'); // Para nombres de clientes
    const empresas = await readJson('empresas.json'); // Para nombres de empresas cliente

    // 1. Filtrar conversaciones de la empresa del auditor
    const misConversaciones = conversaciones.filter(c => c.id_empresa_auditora === idEmpresaAuditora && c.activo);

    // 2. Enriquecer con último mensaje y datos del cliente
    const listaFinal = misConversaciones.map(conv => {
      // Buscar mensajes
      const msgs = mensajes.filter(m => m.id_conversacion === conv.id_conversacion);
      const ultimoMensaje = msgs.length > 0 ? msgs[msgs.length - 1] : null;

      // Buscar datos del cliente (usuario y su empresa)
      const clienteUser = usuarios.find(u => u.id_usuario === conv.id_cliente);
      const empresaCliente = clienteUser ? empresas.find(e => e.id_empresa === clienteUser.id_empresa) : null;

      return {
        ...conv,
        cliente: {
          id_usuario: conv.id_cliente,
          nombre: clienteUser?.nombre || 'Usuario',
          nombre_empresa: empresaCliente?.nombre || 'Empresa Cliente'
        },
        ultimo_mensaje: ultimoMensaje
      };
    });

    // 3. Ordenar por fecha (más reciente primero)
    listaFinal.sort((a, b) => {
      const fechaA = a.ultimo_mensaje ? new Date(a.ultimo_mensaje.creado_en) : new Date(a.creado_en);
      const fechaB = b.ultimo_mensaje ? new Date(b.ultimo_mensaje.creado_en) : new Date(b.creado_en);
      return fechaB - fechaA;
    });

    res.json(listaFinal);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error cargando conversaciones' });
  }
});

// GET /api/auditor/mensajes/:idConversacion
router.get('/mensajes/:idConversacion', authenticate, authorize([2]), async (req, res) => {
  const idConversacion = Number(req.params.idConversacion);
  const mensajes = await readJson('mensajes.json');
  const conversaciones = await readJson('conversaciones.json');

  // Validar pertenencia
  const conversacion = conversaciones.find(c => c.id_conversacion === idConversacion);
  if (!conversacion || conversacion.id_empresa_auditora !== req.user.id_empresa) {
    return res.status(403).json({ message: 'No tienes permiso para ver esta conversación' });
  }
  
  const historial = mensajes.filter(m => m.id_conversacion === idConversacion);
  historial.sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

  res.json(historial);
});

// POST /api/auditor/mensajes
// Enviar mensaje desde el auditor
router.post('/mensajes', authenticate, authorize([2]), async (req, res) => {
  try {
    const { id_conversacion, contenido } = req.body;
    const idUsuario = req.user.id_usuario;

    if (!id_conversacion || !contenido) {
      return res.status(400).json({ message: 'id_conversacion y contenido son obligatorios' });
    }

    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');
    const usuarios = await readJson('usuarios.json');
    const empresas = await readJson('empresas.json');

    const conversacion = conversaciones.find(c => c.id_conversacion === Number(id_conversacion) && c.activo);
    if (!conversacion) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }

    // Verificar que el auditor pertenece a la empresa auditora de esta conversación
    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 2 && u.activo);
    if (!usuario) {
      return res.status(403).json({ message: 'Usuario no válido' });
    }

    const empresaAuditora = empresas.find(e => e.id_empresa === usuario.id_empresa);
    if (!empresaAuditora || empresaAuditora.id_empresa !== conversacion.id_empresa_auditora) {
      return res.status(403).json({ message: 'No tienes permisos para enviar mensajes en esta conversación' });
    }

    // Crear el mensaje
    const idMensaje = await getNextId('mensajes.json', 'id_mensaje');
    const nuevoMensaje = {
      id_mensaje: idMensaje,
      id_conversacion: Number(id_conversacion),
      emisor_tipo: 'AUDITOR',
      emisor_id: idUsuario,
      contenido: contenido,
      creado_en: new Date().toISOString()
    };
    mensajes.push(nuevoMensaje);
    await writeJson('mensajes.json', mensajes);

    // Actualizar fecha de conversación
    const idxConv = conversaciones.findIndex(c => c.id_conversacion === Number(id_conversacion));
    if (idxConv !== -1) {
      conversaciones[idxConv].ultimo_mensaje_fecha = nuevoMensaje.creado_en;
      await writeJson('conversaciones.json', conversaciones);
    }

    // Crear notificación para el cliente
    try {
      const nombreEmpresa = empresaAuditora ? empresaAuditora.nombre : 'Empresa auditora';

      await crearNotificacion({
        id_cliente: conversacion.id_cliente,
        id_auditoria: null,
        tipo: 'mensaje_nuevo',
        titulo: 'Nuevo mensaje',
        mensaje: `Tienes un nuevo mensaje de ${nombreEmpresa}`
      });
    } catch (notifError) {
      // No fallar la operación si la notificación falla
      console.error('Error al crear notificación de mensaje:', notifError);
    }

    res.status(201).json(nuevoMensaje);
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({ message: error.message || 'Error al enviar mensaje' });
  }
});


// ==========================================
// 6. RUTAS DE REPORTES (AUDITOR)
// ==========================================

router.post('/reportes', authenticate, authorize([2]), upload.single('archivo'), async (req, res) => {
  try {
    const { id_auditoria, nombre } = req.body;

    // 1. Validaciones
    if (!req.file) {
      return res.status(400).json({ message: 'Debes subir el archivo PDF.' });
    }
    if (!id_auditoria) {
      return res.status(400).json({ message: 'Selecciona una auditoría.' });
    }

    const reportes = await readJson('reportes.json');
    const auditorias = await readJson('auditorias.json');

    // 2. Verificar Auditoría
    const idxAudit = auditorias.findIndex(a => a.id_auditoria === Number(id_auditoria));
    if (idxAudit === -1) {
      return res.status(404).json({ message: 'Auditoría no encontrada.' });
    }

    // 3. Guardar Reporte
    const idReporte = await getNextId('reportes.json', 'id_reporte');
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const nuevoReporte = {
      id_reporte: idReporte,
      id_auditoria: Number(id_auditoria),
      nombre: nombre || 'Reporte Final',
      tipo: 'FINAL',
      url: fileUrl,
      nombre_archivo: req.file.originalname,
      creado_por: req.user.id_usuario,
      fecha_creacion: new Date().toISOString()
    };

    reportes.push(nuevoReporte);
    await writeJson('reportes.json', reportes);

    // 4. CAMBIO DE ESTADO AUTOMÁTICO -> FINALIZADA (3)
    if (auditorias[idxAudit].id_estado !== 3) {
      auditorias[idxAudit].id_estado = 3;
      auditorias[idxAudit].estado_actualizado_en = new Date().toISOString();
      await writeJson('auditorias.json', auditorias);
    }

    res.status(201).json({ 
      message: 'Reporte subido y auditoría finalizada.', 
      reporte: nuevoReporte 
    });

  } catch (error) {
    console.error('Error subiendo reporte:', error);
    res.status(500).json({ message: 'Error interno.' });
  }
});

// POST /api/auditor/reportes
// Sube el PDF final y FINALIZA la auditoría
router.post('/reportes', authenticate, authorize([2]), upload.single('archivo'), async (req, res) => {
  try {
    const { id_auditoria, nombre, observaciones } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Debes subir el archivo PDF del reporte.' });
    }
    if (!id_auditoria || !nombre) {
      return res.status(400).json({ message: 'id_auditoria y nombre del reporte son obligatorios.' });
    }

    const reportes = await readJson('reportes.json');
    const auditorias = await readJson('auditorias.json');

    // 1. Verificar la auditoría
    const idxAudit = auditorias.findIndex(a => a.id_auditoria === Number(id_auditoria));
    if (idxAudit === -1) {
      return res.status(404).json({ message: 'Auditoría no encontrada.' });
    }

    // 2. Guardar el Reporte
    const idReporte = await getNextId('reportes.json', 'id_reporte');
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const nuevoReporte = {
      id_reporte: idReporte,
      id_auditoria: Number(id_auditoria),
      nombre: nombre,
      tipo: 'FINAL', // Marcamos que es el reporte final
      observaciones: observaciones || '',
      url: fileUrl,
      nombre_archivo: req.file.originalname,
      creado_por: req.user.id_usuario,
      fecha_creacion: new Date().toISOString()
    };

    reportes.push(nuevoReporte);
    await writeJson('reportes.json', reportes);

    // 3. ACTUALIZAR ESTADO DE AUDITORÍA A "FINALIZADA" (3)
    // Solo si no estaba ya finalizada
    if (auditorias[idxAudit].id_estado !== 3) {
      auditorias[idxAudit].id_estado = 3; 
      auditorias[idxAudit].estado_actualizado_en = new Date().toISOString();
      await writeJson('auditorias.json', auditorias);
    }

    res.status(201).json({ 
      message: 'Reporte subido y auditoría finalizada correctamente.', 
      reporte: nuevoReporte 
    });

  } catch (error) {
    console.error('Error al subir reporte:', error);
    res.status(500).json({ message: 'Error interno al procesar el reporte.' });
  }
});

module.exports = router;