const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readJson, writeJson, getNextId, crearNotificacion } = require('../utils/jsonDb');
const { authenticate, authorize } = require('../utils/auth');

// Configuración de multer para subida de archivos
const uploadDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no soportado. Solo PDF.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: fileFilter
});

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

// --- Configuración de empresa ---
// GET /api/supervisor/empresa/:id
// Obtiene la configuración de la empresa del supervisor
router.get('/empresa/:id', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresa = Number(req.params.id);
    const idUsuario = req.user.id_usuario;

    const empresas = await readJson('empresas.json');
    const usuarios = await readJson('usuarios.json');
    const empresaModulos = await readJson('empresa_modulos.json');

    // Verificar que la empresa existe y es del tipo auditora
    const empresa = empresas.find(e => e.id_empresa === idEmpresa && e.id_tipo_empresa === 1 && e.activo);
    if (!empresa) {
      return res.status(404).json({ message: 'Empresa auditora no encontrada o inactiva' });
    }

    // Verificar que el usuario supervisor pertenece a esa empresa
    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== idEmpresa) {
      return res.status(403).json({ message: 'No tienes permisos para acceder a esta empresa' });
    }

    // Obtener módulos de la empresa
    const modulos = empresaModulos
      .filter(em => em.id_empresa === idEmpresa)
      .map(em => em.id_modulo);

    res.json({
      id_empresa: empresa.id_empresa,
      nombre: empresa.nombre,
      rfc: empresa.rfc || null,
      direccion: empresa.direccion || null,
      telefono: empresa.contacto_telefono || null,
      modulos: modulos
    });
  } catch (error) {
    console.error('Error al obtener configuración de empresa:', error);
    res.status(500).json({ message: error.message || 'Error al obtener configuración' });
  }
});

// PUT /api/supervisor/empresa/:id
// Actualiza la configuración de la empresa
router.put('/empresa/:id', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresa = Number(req.params.id);
    const { nombre, rfc, direccion, telefono, modulos } = req.body;
    const idUsuario = req.user.id_usuario;

    // Validar campos requeridos
    if (!nombre) {
      return res.status(400).json({ message: 'nombre es obligatorio' });
    }

    const empresas = await readJson('empresas.json');
    const usuarios = await readJson('usuarios.json');
    const empresaModulos = await readJson('empresa_modulos.json');
    const modulosAmbientales = await readJson('modulos_ambientales.json');

    // Verificar que la empresa existe y es del tipo auditora
    const empresaIdx = empresas.findIndex(e => e.id_empresa === idEmpresa && e.id_tipo_empresa === 1 && e.activo);
    if (empresaIdx === -1) {
      return res.status(404).json({ message: 'Empresa auditora no encontrada o inactiva' });
    }

    // Verificar que el usuario supervisor pertenece a esa empresa
    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== idEmpresa) {
      return res.status(403).json({ message: 'No tienes permisos para modificar esta empresa' });
    }

    // Validar módulos si se proporcionan
    if (modulos && Array.isArray(modulos)) {
      for (const idModulo of modulos) {
        const moduloValido = modulosAmbientales.some(m => m.id_modulo === Number(idModulo));
        if (!moduloValido) {
          return res.status(400).json({ message: `Módulo ${idModulo} no válido` });
        }
      }
    }

    // Actualizar datos de la empresa
    empresas[empresaIdx].nombre = nombre;
    empresas[empresaIdx].rfc = rfc || null;
    empresas[empresaIdx].direccion = direccion || null;
    empresas[empresaIdx].contacto_telefono = telefono || null;
    // Marcar como visible para clientes (si tiene módulos configurados)
    // Esto se hará después de actualizar los módulos

    await writeJson('empresas.json', empresas);

    // Actualizar módulos de la empresa
    // Eliminar módulos existentes de esta empresa
    const modulosActualizados = empresaModulos.filter(em => em.id_empresa !== idEmpresa);
    
    // Agregar nuevos módulos
    if (modulos && Array.isArray(modulos) && modulos.length > 0) {
      for (const idModulo of modulos) {
        const idEmpresaModulo = await getNextId('empresa_modulos.json', 'id_empresa_modulo');
        modulosActualizados.push({
          id_empresa_modulo: idEmpresaModulo,
          id_empresa: idEmpresa,
          id_modulo: Number(idModulo),
          registrado_en: new Date().toISOString()
        });
      }
    }

    await writeJson('empresa_modulos.json', modulosActualizados);

    // Obtener módulos actualizados para la respuesta
    const modulosRespuesta = modulosActualizados
      .filter(em => em.id_empresa === idEmpresa)
      .map(em => em.id_modulo);

    res.json({
      id_empresa: empresas[empresaIdx].id_empresa,
      nombre: empresas[empresaIdx].nombre,
      rfc: empresas[empresaIdx].rfc || null,
      direccion: empresas[empresaIdx].direccion || null,
      telefono: empresas[empresaIdx].contacto_telefono || null,
      modulos: modulosRespuesta
    });
  } catch (error) {
    console.error('Error al guardar configuración de empresa:', error);
    res.status(500).json({ message: error.message || 'Error al guardar configuración' });
  }
});

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

// Rutas de solicitudes de pago para la empresa auditora (supervisor)
// - POST /api/supervisor/solicitudes-pago
//   Crea solicitud de pago: modo supervisor (envía `id_empresa` y `id_cliente`) o
//   modo por empresa (si solo se envía `id_empresa` se considerará como empresa cliente
//   y se notificará al usuario principal registrado)
router.post('/solicitudes-pago', authenticate, authorize([1]), async (req, res) => {
  try {
    const { id_empresa, id_cliente, monto, concepto } = req.body;

    if (!monto || !concepto) {
      return res.status(400).json({ message: 'monto y concepto son obligatorios' });
    }

    const solicitudes = await readJson('solicitudes_pago.json');
    const empresas = await readJson('empresas.json');
    const usuarios = await readJson('usuarios.json');

    // Modo A: supervisor proporciona id_empresa (empresa objetivo) e id_cliente (usuario)
    if (id_empresa && id_cliente) {
      const empresaValida = empresas.some(e => e.id_empresa === Number(id_empresa) && e.activo);
      const clienteValido = usuarios.some(u => u.id_usuario === Number(id_cliente) && u.id_rol === 3 && u.activo);
      if (!empresaValida) return res.status(404).json({ message: 'Empresa no encontrada o inactiva' });
      if (!clienteValido) return res.status(404).json({ message: 'Cliente no encontrado o inactivo' });

      const idSolicitud = await getNextId('solicitudes_pago.json', 'id_solicitud');
      const nueva = {
        id_solicitud: idSolicitud,
        id_empresa: Number(id_empresa),
        id_empresa_auditora: req.user.id_empresa,
        id_cliente: Number(id_cliente),
        monto: Number(monto),
        concepto,
        id_estado: 1,
        creado_en: new Date().toISOString(),
        creado_por_supervisor: req.user.id_usuario
      };

      solicitudes.push(nueva);
      await writeJson('solicitudes_pago.json', solicitudes);
      return res.status(201).json({ message: 'Solicitud de pago creada por supervisor', solicitud: nueva });
    }

    // Modo B: supervisor proporciona solo id_empresa (empresa cliente) — buscar usuario principal
    if (id_empresa && !id_cliente) {
      const empresaObjetivo = empresas.find(e => e.id_empresa === Number(id_empresa) && e.activo);
      if (!empresaObjetivo) {
        return res.status(404).json({ message: 'Empresa no encontrada' });
      }
      if (empresaObjetivo.id_tipo_empresa !== 2) {
        return res.status(400).json({ message: 'El ID proporcionado no es una empresa Cliente' });
      }

      const usuarioPrincipal = usuarios.find(u => u.id_empresa === Number(id_empresa) && u.id_rol === 3 && u.activo);
      if (!usuarioPrincipal) {
        return res.status(400).json({ message: 'La empresa existe, pero no tiene usuario administrador registrado' });
      }

      const idSolicitud = await getNextId('solicitudes_pago.json', 'id_solicitud');
      const nueva = {
        id_solicitud: idSolicitud,
        id_empresa: req.user.id_empresa,
        id_empresa_auditora: req.user.id_empresa,
        id_empresa_cliente: Number(id_empresa),
        id_cliente: usuarioPrincipal.id_usuario,
        monto: Number(monto),
        concepto,
        id_estado: 1,
        creado_en: new Date().toISOString(),
        creado_por_supervisor: req.user.id_usuario
      };

      solicitudes.push(nueva);
      await writeJson('solicitudes_pago.json', solicitudes);
      return res.status(201).json({ message: `Solicitud creada para la empresa ${empresaObjetivo.nombre}`, solicitud: nueva });
    }

    return res.status(400).json({ message: 'Parámetros insuficientes. Envía `id_empresa`+`id_cliente` o al menos `id_empresa`.' });
  } catch (error) {
    console.error('Error creando solicitud de pago:', error);
    res.status(500).json({ message: error.message || 'Error creando solicitud de pago' });
  }
});

// GET /api/supervisor/solicitudes-pago
// Lista solicitudes asociadas a la empresa auditora del supervisor (paginado opcional)
router.get('/solicitudes-pago', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresaAuditora = req.user.id_empresa;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);

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
        es_mio: s.creado_por_supervisor === req.user.id_usuario
      };
    });

    data.sort((a, b) => {
      if (a.id_estado === b.id_estado) return new Date(b.creado_en) - new Date(a.creado_en);
      return a.id_estado - b.id_estado;
    });

    const start = (page - 1) * limit;
    res.json({ total: data.length, page, limit, data: data.slice(start, start + limit) });
  } catch (error) {
    console.error('Error al obtener solicitudes del supervisor:', error);
    res.status(500).json({ message: 'Error al obtener el historial de cobros' });
  }
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

  const estadoAnterior = auditorias[auditoriaIdx].id_estado;
  auditorias[auditoriaIdx].id_estado = Number(id_estado);
  auditorias[auditoriaIdx].estado_actualizado_en = new Date().toISOString();
  await writeJson('auditorias.json', auditorias);

  // Crear notificación para el cliente
  try {
    const estados = await readJson('estados_auditoria.json');
    const nuevoEstado = estados.find(e => e.id_estado === Number(id_estado));
    const nombreEstado = nuevoEstado ? (nuevoEstado.nombre || nuevoEstado.clave) : `Estado ${id_estado}`;
    
    if (auditorias[auditoriaIdx].id_cliente) {
      await crearNotificacion({
        id_cliente: auditorias[auditoriaIdx].id_cliente,
        id_auditoria: idAuditoria,
        tipo: 'estado_cambiado',
        titulo: 'Estado de auditoría actualizado',
        mensaje: `La auditoría #${idAuditoria} ha cambiado de estado a ${nombreEstado}`
      });
    }
  } catch (notifError) {
    // No fallar la operación si la notificación falla
    console.error('Error al crear notificación de cambio de estado:', notifError);
  }

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


router.get('/conversaciones', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresa = req.user.id_empresa;
    
    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');
    const usuarios = await readJson('usuarios.json');
    const empresas = await readJson('empresas.json');

    // 1. Filtrar conversaciones de la empresa
    const misConversaciones = conversaciones.filter(c => c.id_empresa_auditora === idEmpresa && c.activo);

    // 2. Enriquecer datos
    const listaFinal = misConversaciones.map(conv => {
      // Último mensaje
      const msgs = mensajes.filter(m => m.id_conversacion === conv.id_conversacion);
      const ultimoMensaje = msgs.length > 0 ? msgs[msgs.length - 1] : null;

      // Datos del Cliente (Usuario + Empresa)
      const clienteUser = usuarios.find(u => u.id_usuario === conv.id_cliente);
      const empresaCliente = clienteUser ? empresas.find(e => e.id_empresa === clienteUser.id_empresa) : null;

      return {
        ...conv,
        cliente: {
          id_usuario: conv.id_cliente,
          nombre: clienteUser?.nombre || 'Usuario',
          nombre_empresa: empresaCliente?.nombre || 'Empresa Cliente',
          // Enviamos el ID de la empresa cliente para pre-llenar el formulario de pago si es necesario
          id_empresa: empresaCliente?.id_empresa 
        },
        ultimo_mensaje: ultimoMensaje
      };
    });

    // 3. Ordenar
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

// GET /api/supervisor/mensajes/:idConversacion
router.get('/mensajes/:idConversacion', authenticate, authorize([1]), async (req, res) => {
  const idConversacion = Number(req.params.idConversacion);
  const mensajes = await readJson('mensajes.json');
  const conversaciones = await readJson('conversaciones.json');

  const conversacion = conversaciones.find(c => c.id_conversacion === idConversacion);
  if (!conversacion || conversacion.id_empresa_auditora !== req.user.id_empresa) {
    return res.status(403).json({ message: 'No tienes permiso' });
  }
  
  const historial = mensajes.filter(m => m.id_conversacion === idConversacion);
  historial.sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

  res.json(historial);
});

// POST /api/supervisor/mensajes
router.post('/mensajes', authenticate, authorize([1]), async (req, res) => {
  try {
    const { id_conversacion, contenido } = req.body;
    const idUsuario = req.user.id_usuario;
    
    if (!id_conversacion || !contenido) {
      return res.status(400).json({ message: 'Faltan datos' });
    }

    const mensajes = await readJson('mensajes.json');
    const conversaciones = await readJson('conversaciones.json');
    const usuarios = await readJson('usuarios.json');
    const empresas = await readJson('empresas.json');

    const idxConv = conversaciones.findIndex(c => c.id_conversacion === Number(id_conversacion));
    if (idxConv === -1 || conversaciones[idxConv].id_empresa_auditora !== req.user.id_empresa) {
      return res.status(403).json({ message: 'Conversación no válida' });
    }

    const conversacion = conversaciones[idxConv];

    const idMensaje = await getNextId('mensajes.json', 'id_mensaje');
    const nuevoMensaje = {
      id_mensaje: idMensaje,
      id_conversacion: Number(id_conversacion),
      emisor_tipo: 'SUPERVISOR',
      emisor_id: idUsuario,
      contenido: contenido,
      creado_en: new Date().toISOString()
    };

    mensajes.push(nuevoMensaje);
    await writeJson('mensajes.json', mensajes);

    // Actualizar fecha de conversación
    conversaciones[idxConv].ultimo_mensaje_fecha = nuevoMensaje.creado_en;
    await writeJson('conversaciones.json', conversaciones);

    // Crear notificación para el cliente
    try {
      const empresa = empresas.find(e => e.id_empresa === conversacion.id_empresa_auditora);
      const nombreEmpresa = empresa ? empresa.nombre : 'Empresa auditora';

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

// GET /api/supervisor/auditorias/:idEmpresa
// Obtener todas las auditorías de una empresa auditora
router.get('/auditorias/:idEmpresa', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresa = Number(req.params.idEmpresa);
    const idUsuario = req.user.id_usuario;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const idEstado = req.query.id_estado ? Number(req.query.id_estado) : null;

    const auditorias = await readJson('auditorias.json');
    const usuarios = await readJson('usuarios.json');
    const empresas = await readJson('empresas.json');
    const estados = await readJson('estados_auditoria.json');
    const auditoriaModulos = await readJson('auditoria_modulos.json');

    // Verificar que el supervisor pertenece a esa empresa
    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== idEmpresa) {
      return res.status(403).json({ message: 'No tienes permisos para ver estas auditorías' });
    }

    let all = auditorias.filter(a => a.id_empresa_auditora === idEmpresa);
    
    // Filtrar por estado si se proporciona
    if (idEstado) {
      all = all.filter(a => a.id_estado === idEstado);
    }

    // Enriquecer con datos adicionales
    const auditoriasEnriquecidas = all.map(auditoria => {
      const cliente = usuarios.find(u => u.id_usuario === auditoria.id_cliente);
      const empresaCliente = empresas.find(e => e.id_empresa === cliente?.id_empresa);
      const estado = estados.find(e => e.id_estado === auditoria.id_estado);
      
      // Obtener módulos de la auditoría
      const modulos = auditoriaModulos
        .filter(am => am.id_auditoria === auditoria.id_auditoria)
        .map(am => am.id_modulo);

      return {
        id_auditoria: auditoria.id_auditoria,
        id_cliente: auditoria.id_cliente,
        id_empresa_auditora: auditoria.id_empresa_auditora,
        id_estado: auditoria.id_estado,
        modulos: modulos,
        fecha_creacion: auditoria.creada_en || auditoria.creado_en,
        fecha_inicio: auditoria.fecha_inicio || null,
        monto: auditoria.monto || null,
        cliente: cliente ? {
          id_usuario: cliente.id_usuario,
          nombre: cliente.nombre,
          correo: cliente.correo
        } : null,
        empresa_cliente: empresaCliente ? {
          id_empresa: empresaCliente.id_empresa,
          nombre: empresaCliente.nombre
        } : null,
        estado: estado ? {
          id_estado: estado.id_estado,
          nombre: estado.nombre || estado.clave
        } : null
      };
    });

    // Paginación
    const start = (page - 1) * limit;
    const data = auditoriasEnriquecidas.slice(start, start + limit);

    res.json({
      total: auditoriasEnriquecidas.length,
      page,
      limit,
      data
    });
  } catch (error) {
    console.error('Error al obtener auditorías:', error);
    res.status(500).json({ message: error.message || 'Error al obtener auditorías' });
  }
});

// GET /api/supervisor/auditorias/:idAuditoria/participantes
// Lista los auditores asignados a una auditoría específica
router.get('/auditorias/:idAuditoria/participantes', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  
  const participantes = await readJson('auditoria_participantes.json');
  const usuarios = await readJson('usuarios.json');

  // 1. Obtener IDs de los auditores en esta auditoría
  const asignaciones = participantes.filter(p => p.id_auditoria === idAuditoria);
  
  // 2. Cruzar con usuarios para obtener nombres y correos
  const resultado = asignaciones.map(a => {
    const auditor = usuarios.find(u => u.id_usuario === a.id_auditor);
    return {
      id_usuario: auditor?.id_usuario,
      nombre: auditor?.nombre,
      correo: auditor?.correo,
      asignado_en: a.asignado_en
    };
  }).filter(u => u.id_usuario); // Eliminar nulos si hubiera inconsistencias

  res.json(resultado);
});

// GET /api/supervisor/clientes-con-auditorias
// Obtiene todas las EMPRESAS que tienen o han tenido auditorías con nosotros
router.get('/clientes-con-auditorias', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresaAuditora = req.user.id_empresa;

    const auditorias = await readJson('auditorias.json');
    const usuarios = await readJson('usuarios.json');
    const empresas = await readJson('empresas.json');

    // 1. Obtener todas las auditorías de mi empresa
    const misAuditorias = auditorias.filter(a => a.id_empresa_auditora === idEmpresaAuditora);

    // 2. Extraer IDs únicos de usuarios clientes de esas auditorías
    // Usamos Set para evitar duplicados de usuarios
    const idsUsuariosClientes = [...new Set(misAuditorias.map(a => a.id_cliente))];

    // 3. Buscar las empresas a las que pertenecen esos usuarios
    const empresasMap = new Map(); // Usamos Map para evitar empresas duplicadas por ID

    idsUsuariosClientes.forEach(idUsuario => {
      const usuario = usuarios.find(u => u.id_usuario === idUsuario);
      
      if (usuario && usuario.id_empresa) {
        // Verificar si ya agregamos esta empresa al mapa
        if (!empresasMap.has(usuario.id_empresa)) {
          const empresa = empresas.find(e => e.id_empresa === usuario.id_empresa);
          
          if (empresa) {
            // Calculamos métricas extra si quieres mostrarlas en el dashboard
            const totalAuditoriasEmpresa = misAuditorias.filter(a => {
                const u = usuarios.find(usr => usr.id_usuario === a.id_cliente);
                return u && u.id_empresa === empresa.id_empresa;
            }).length;

            empresasMap.set(usuario.id_empresa, {
              id_empresa: empresa.id_empresa,
              nombre: empresa.nombre,
              ciudad: empresa.ciudad,
              pais: empresa.pais,
              contacto: usuario.nombre, // El contacto es el usuario que hizo la auditoría
              total_auditorias: totalAuditoriasEmpresa,
              activo: empresa.activo
            });
          }
        }
      }
    });

    // Convertir el Map a Array para la respuesta
    const resultado = Array.from(empresasMap.values());

    res.json(resultado);

  } catch (error) {
    console.error('Error al obtener clientes:', error);
    res.status(500).json({ message: 'Error interno al cargar clientes' });
  }
});

// GET /api/supervisor/auditorias/:idAuditoria/evidencias
// Obtiene todas las evidencias de una auditoría específica (con validación de propiedad)
router.get('/auditorias/:idAuditoria/evidencias', authenticate, authorize([1]), async (req, res) => {
  try {
    const idAuditoria = Number(req.params.idAuditoria);
    const idEmpresaSupervisor = req.user.id_empresa;

    const auditorias = await readJson('auditorias.json');
    const evidencias = await readJson('evidencias.json');
    const usuarios = await readJson('usuarios.json'); // Para saber nombre del auditor
    const modulosAmbientales = await readJson('modulos_ambientales.json'); // Para nombre del módulo

    // 1. Seguridad: Verificar que la auditoría pertenece a la empresa del supervisor
    const auditoria = auditorias.find(a => a.id_auditoria === idAuditoria);
    
    if (!auditoria) {
      return res.status(404).json({ message: 'Auditoría no encontrada' });
    }
    
    if (auditoria.id_empresa_auditora !== idEmpresaSupervisor) {
      return res.status(403).json({ message: 'No tienes permiso para ver evidencias de esta auditoría' });
    }

    // 2. Filtrar evidencias
    const misEvidencias = evidencias.filter(e => e.id_auditoria === idAuditoria);

    // 3. Enriquecer datos (Nombre de auditor, Nombre de módulo)
    const resultado = misEvidencias.map(evidencia => {
      const auditor = usuarios.find(u => u.id_usuario === evidencia.id_auditor);
      const modulo = modulosAmbientales.find(m => m.id_modulo === evidencia.id_modulo);

      return {
        ...evidencia,
        nombre_auditor: auditor ? auditor.nombre : 'Desconocido',
        nombre_modulo: modulo ? modulo.nombre : 'General'
      };
    });

    res.json(resultado);

  } catch (error) {
    console.error('Error obteniendo evidencias:', error);
    res.status(500).json({ message: 'Error interno al cargar evidencias' });
  }
});

// POST /api/supervisor/reportes
// Subir un reporte para una auditoría
router.post('/reportes', authenticate, authorize([1]), upload.single('archivo'), async (req, res) => {
  try {
    const { id_auditoria, nombre, tipo } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'Debes subir un archivo PDF' });
    }
    if (!id_auditoria || !nombre) {
      return res.status(400).json({ message: 'id_auditoria y nombre son obligatorios' });
    }

    const reportes = await readJson('reportes.json');
    const auditorias = await readJson('auditorias.json');
    const usuarios = await readJson('usuarios.json');

    // Verificar que la auditoría existe y pertenece a la empresa del supervisor
    const auditoria = auditorias.find(a => a.id_auditoria === Number(id_auditoria));
    if (!auditoria) {
      return res.status(404).json({ message: 'Auditoría no encontrada' });
    }

    const usuario = usuarios.find(u => u.id_usuario === req.user.id_usuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== auditoria.id_empresa_auditora) {
      return res.status(403).json({ message: 'No tienes permisos para subir reportes de esta auditoría' });
    }

    const idReporte = await getNextId('reportes.json', 'id_reporte');
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    const nuevoReporte = {
      id_reporte: idReporte,
      id_auditoria: Number(id_auditoria),
      nombre: nombre,
      tipo: tipo || 'Reporte Final',
      url: fileUrl,
      nombre_archivo: req.file.originalname,
      fecha_elaboracion: new Date().toISOString(),
      fecha_subida: new Date().toISOString(),
      creado_en: new Date().toISOString()
    };

    reportes.push(nuevoReporte);
    await writeJson('reportes.json', reportes);

    // Crear notificación para el cliente
    try {
      if (auditoria.id_cliente) {
        await crearNotificacion({
          id_cliente: auditoria.id_cliente,
          id_auditoria: auditoria.id_auditoria,
          tipo: 'reporte_subido',
          titulo: 'Nuevo reporte disponible',
          mensaje: `Se ha subido un nuevo reporte para la auditoría #${auditoria.id_auditoria}`
        });
      }
    } catch (notifError) {
      console.error('Error al crear notificación de reporte:', notifError);
    }

    res.status(201).json({ 
      message: 'Reporte subido correctamente', 
      reporte: nuevoReporte 
    });
  } catch (error) {
    console.error('Error al subir reporte:', error);
    res.status(500).json({ message: error.message || 'Error al subir reporte' });
  }
});

module.exports = router;