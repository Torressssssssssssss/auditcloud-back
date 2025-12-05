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

// GET /api/supervisor/conversaciones/:idEmpresa
// Obtener conversaciones de la empresa auditora
router.get('/conversaciones/:idEmpresa', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresa = Number(req.params.idEmpresa);
    const idUsuario = req.user.id_usuario;

    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');
    const empresas = await readJson('empresas.json');
    const usuarios = await readJson('usuarios.json');

    // Verificar que el supervisor pertenece a esa empresa
    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== idEmpresa) {
      return res.status(403).json({ message: 'No tienes permisos para ver estas conversaciones' });
    }

    const conversacionesEmpresa = conversaciones
      .filter(c => c.id_empresa_auditora === idEmpresa && c.activo)
      .map(conversacion => {
        // Obtener último mensaje
        const ultimosMensajes = mensajes
          .filter(m => m.id_conversacion === conversacion.id_conversacion)
          .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
        
        const ultimoMensaje = ultimosMensajes.length > 0 ? ultimosMensajes[0] : null;

        // Obtener datos del cliente
        const cliente = usuarios.find(u => u.id_usuario === conversacion.id_cliente);
        const empresaCliente = empresas.find(e => e.id_empresa === cliente?.id_empresa);

        return {
          id_conversacion: conversacion.id_conversacion,
          id_cliente: conversacion.id_cliente,
          id_empresa_auditora: conversacion.id_empresa_auditora,
          asunto: conversacion.asunto,
          fecha_creacion: conversacion.creado_en,
          cliente: cliente ? {
            id_usuario: cliente.id_usuario,
            nombre: cliente.nombre,
            correo: cliente.correo
          } : null,
          empresa_cliente: empresaCliente ? {
            id_empresa: empresaCliente.id_empresa,
            nombre: empresaCliente.nombre
          } : null,
          ultimo_mensaje: ultimoMensaje ? {
            id_mensaje: ultimoMensaje.id_mensaje,
            contenido: ultimoMensaje.contenido,
            fecha_envio: ultimoMensaje.creado_en,
            id_remitente: ultimoMensaje.emisor_id,
            tipo_remitente: ultimoMensaje.emisor_tipo
          } : null
        };
      })
      .sort((a, b) => {
        // Ordenar por fecha del último mensaje (más reciente primero)
        if (!a.ultimo_mensaje && !b.ultimo_mensaje) return 0;
        if (!a.ultimo_mensaje) return 1;
        if (!b.ultimo_mensaje) return -1;
        return new Date(b.ultimo_mensaje.fecha_envio) - new Date(a.ultimo_mensaje.fecha_envio);
      });

    res.json(conversacionesEmpresa);
  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    res.status(500).json({ message: error.message || 'Error al obtener conversaciones' });
  }
});

// GET /api/supervisor/mensajes/:idConversacion
// Obtener mensajes de una conversación específica
router.get('/mensajes/:idConversacion', authenticate, authorize([1]), async (req, res) => {
  try {
    const idConversacion = Number(req.params.idConversacion);
    const idUsuario = req.user.id_usuario;

    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');
    const usuarios = await readJson('usuarios.json');

    const conversacion = conversaciones.find(c => c.id_conversacion === idConversacion && c.activo);
    if (!conversacion) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }

    // Verificar que el supervisor pertenece a la empresa auditora de esta conversación
    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== conversacion.id_empresa_auditora) {
      return res.status(403).json({ message: 'No tienes permisos para ver esta conversación' });
    }

    const mensajesConversacion = mensajes
      .filter(m => m.id_conversacion === idConversacion)
      .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));

    res.json({
      id_conversacion: conversacion.id_conversacion,
      id_cliente: conversacion.id_cliente,
      id_empresa_auditora: conversacion.id_empresa_auditora,
      asunto: conversacion.asunto,
      creado_en: conversacion.creado_en,
      mensajes: mensajesConversacion.map(m => ({
        id_mensaje: m.id_mensaje,
        id_remitente: m.emisor_id,
        tipo_remitente: m.emisor_tipo,
        contenido: m.contenido,
        fecha_envio: m.creado_en
      }))
    });
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({ message: error.message || 'Error al obtener mensajes' });
  }
});

// POST /api/supervisor/mensajes
// Enviar mensaje desde el supervisor
router.post('/mensajes', authenticate, authorize([1]), async (req, res) => {
  try {
    const { id_conversacion, contenido } = req.body;
    const idUsuario = req.user.id_usuario;

    if (!id_conversacion || !contenido) {
      return res.status(400).json({ message: 'id_conversacion y contenido son obligatorios' });
    }

    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');
    const usuarios = await readJson('usuarios.json');

    const conversacion = conversaciones.find(c => c.id_conversacion === Number(id_conversacion) && c.activo);
    if (!conversacion) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }

    // Verificar que el supervisor pertenece a la empresa auditora de esta conversación
    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== conversacion.id_empresa_auditora) {
      return res.status(403).json({ message: 'No tienes permisos para enviar mensajes en esta conversación' });
    }

    // Crear el mensaje
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

    res.status(201).json({
      id_mensaje: nuevoMensaje.id_mensaje,
      id_conversacion: nuevoMensaje.id_conversacion,
      id_remitente: nuevoMensaje.emisor_id,
      contenido: nuevoMensaje.contenido,
      fecha_envio: nuevoMensaje.creado_en
    });
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

module.exports = router;