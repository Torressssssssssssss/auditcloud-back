const express = require('express');
const router = express.Router();
const { readJson, writeJson, getNextId } = require('../utils/jsonDb');
const { authenticate, authorize, signToken } = require('../utils/auth');
const bcrypt = require('bcryptjs');

// POST /api/cliente/registro
// Registro de nuevo cliente (no requiere autenticación)
router.post('/registro', async (req, res) => {
  try {
    const { nombre, correo, password, nombre_empresa, ciudad, estado, rfc } = req.body;

    // Validar campos requeridos
    if (!nombre || !correo || !password || !nombre_empresa) {
      return res.status(400).json({ 
        message: 'nombre, correo, password y nombre_empresa son obligatorios' 
      });
    }

    const usuarios = await readJson('usuarios.json');
    const empresas = await readJson('empresas.json');

    // Verificar que el correo no esté ya registrado
    const correoExistente = usuarios.find(u => u.correo === correo && u.activo);
    if (correoExistente) {
      return res.status(400).json({ 
        message: 'El correo ya está registrado' 
      });
    }

    // Crear la empresa cliente
    const idEmpresa = await getNextId('empresas.json', 'id_empresa');
    const nuevaEmpresa = {
      id_empresa: idEmpresa,
      id_tipo_empresa: 2, // Tipo CLIENTE
      nombre: nombre_empresa,
      rfc: rfc || null,
      giro: null,
      direccion: null,
      ciudad: ciudad || null,
      estado: estado || null,
      pais: 'México',
      contacto_nombre: nombre,
      contacto_correo: correo,
      contacto_telefono: null,
      activo: true
    };
    empresas.push(nuevaEmpresa);
    await writeJson('empresas.json', empresas);

    // Crear el usuario cliente
    const idUsuario = await getNextId('usuarios.json', 'id_usuario');
    const passwordHash = bcrypt.hashSync(password, 10);
    const nuevoUsuario = {
      id_usuario: idUsuario,
      id_empresa: idEmpresa,
      nombre: nombre,
      correo: correo,
      password_hash: passwordHash,
      id_rol: 3, // Rol de cliente
      activo: true,
      creado_en: new Date().toISOString()
    };
    usuarios.push(nuevoUsuario);
    await writeJson('usuarios.json', usuarios);

    // Generar token
    const token = signToken(nuevoUsuario);

    // Respuesta esperada por el frontend
    res.status(201).json({
      token: token,
      usuario: {
        id_usuario: nuevoUsuario.id_usuario,
        id_rol: nuevoUsuario.id_rol,
        id_empresa: nuevoUsuario.id_empresa,
        nombre: nuevoUsuario.nombre,
        correo: nuevoUsuario.correo
      }
    });
  } catch (error) {
    console.error('Error en registro de cliente:', error);
    res.status(500).json({ 
      message: error.message || 'No se pudo registrar.' 
    });
  }
});

// GET /api/cliente/conversaciones/:idCliente
// Lista conversaciones del cliente
router.get('/conversaciones/:idCliente', authenticate, authorize([3]), async (req, res) => {
  try {
    const idCliente = Number(req.params.idCliente);
    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');
    const empresas = await readJson('empresas.json');

    const conversacionesCliente = conversaciones
      .filter(c => c.id_cliente === idCliente && c.activo)
      .map(conversacion => {
        // Obtener último mensaje
        const ultimosMensajes = mensajes
          .filter(m => m.id_conversacion === conversacion.id_conversacion)
          .sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
        
        const ultimoMensaje = ultimosMensajes.length > 0 ? ultimosMensajes[0] : null;

        // Obtener datos de la empresa auditora
        const empresaAuditora = empresas.find(e => e.id_empresa === conversacion.id_empresa_auditora);

        return {
          id_conversacion: conversacion.id_conversacion,
          id_cliente: conversacion.id_cliente,
          id_empresa_auditora: conversacion.id_empresa_auditora,
          asunto: conversacion.asunto,
          fecha_creacion: conversacion.creado_en,
          empresa: empresaAuditora ? {
            id_empresa: empresaAuditora.id_empresa,
            nombre: empresaAuditora.nombre
          } : null,
          ultimo_mensaje: ultimoMensaje ? {
            id_mensaje: ultimoMensaje.id_mensaje,
            contenido: ultimoMensaje.contenido,
            fecha_envio: ultimoMensaje.creado_en,
            id_remitente: ultimoMensaje.emisor_id
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

    res.json(conversacionesCliente);
  } catch (error) {
    console.error('Error al obtener conversaciones:', error);
    res.status(500).json({ message: error.message || 'Error al obtener conversaciones' });
  }
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
    id_empresa: Number(id_empresa_auditora), // id_empresa en solicitudes_pago se refiere a la empresa auditora
    id_empresa_auditora: Number(id_empresa_auditora), // Mantener ambos para compatibilidad
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

// GET /api/cliente/empresas-auditoras
// Lista empresas auditoras disponibles (solo las que tienen módulos configurados)
router.get('/empresas-auditoras', authenticate, authorize([3]), async (req, res) => {
  try {
    const empresas = await readJson('empresas.json');
    const empresaModulos = await readJson('empresa_modulos.json');

    // Filtrar solo empresas auditoras activas
    const empresasAuditoras = empresas.filter(
      e => e.id_tipo_empresa === 1 && e.activo
    );

    // Obtener módulos por empresa
    const empresasConModulos = empresasAuditoras
      .map(empresa => {
        const modulos = empresaModulos
          .filter(em => em.id_empresa === empresa.id_empresa)
          .map(em => em.id_modulo);

        return {
          id_empresa: empresa.id_empresa,
          nombre: empresa.nombre,
          pais: empresa.pais || null,
          estado: empresa.estado || null,
          ciudad: empresa.ciudad || null,
          modulos: modulos
        };
      })
      .filter(emp => emp.modulos.length > 0); // Solo empresas con al menos un módulo

    res.json(empresasConModulos);
  } catch (error) {
    console.error('Error al obtener empresas auditoras:', error);
    res.status(500).json({ message: error.message || 'Error al obtener empresas auditoras' });
  }
});

// GET /api/cliente/empresas-auditoras/:id
// Obtener detalle de una empresa auditora específica
router.get('/empresas-auditoras/:id', authenticate, authorize([3]), async (req, res) => {
  try {
    const idEmpresa = Number(req.params.id);
    const empresas = await readJson('empresas.json');
    const empresaModulos = await readJson('empresa_modulos.json');
    const modulosAmbientales = await readJson('modulos_ambientales.json');

    const empresa = empresas.find(e => e.id_empresa === idEmpresa && e.id_tipo_empresa === 1 && e.activo);
    if (!empresa) {
      return res.status(404).json({ message: 'Empresa auditora no encontrada' });
    }

    // Obtener módulos de la empresa
    const modulosIds = empresaModulos
      .filter(em => em.id_empresa === idEmpresa)
      .map(em => em.id_modulo);

    const modulos = modulosIds.map(id => {
      const modulo = modulosAmbientales.find(m => m.id_modulo === id);
      return modulo ? { id_modulo: modulo.id_modulo, nombre: modulo.nombre, clave: modulo.clave } : null;
    }).filter(m => m !== null);

    res.json({
      id_empresa: empresa.id_empresa,
      nombre: empresa.nombre,
      rfc: empresa.rfc || null,
      direccion: empresa.direccion || null,
      telefono: empresa.contacto_telefono || null,
      pais: empresa.pais || null,
      estado: empresa.estado || null,
      ciudad: empresa.ciudad || null,
      modulos: modulosIds,
      modulos_detalle: modulos,
      descripcion: empresa.giro || null
    });
  } catch (error) {
    console.error('Error al obtener detalle de empresa:', error);
    res.status(500).json({ message: error.message || 'Error al obtener detalle de empresa' });
  }
});

// GET /api/cliente/mensajes/:idConversacion
// Obtener mensajes de una conversación específica
router.get('/mensajes/:idConversacion', authenticate, authorize([3]), async (req, res) => {
  try {
    const idConversacion = Number(req.params.idConversacion);
    const idUsuario = req.user.id_usuario;

    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');

    const conversacion = conversaciones.find(c => c.id_conversacion === idConversacion && c.activo);
    if (!conversacion) {
      return res.status(404).json({ message: 'Conversación no encontrada' });
    }

    // Verificar que el cliente pertenece a esta conversación
    if (conversacion.id_cliente !== idUsuario) {
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

// POST /api/cliente/mensajes
// Enviar un mensaje (crear conversación o responder)
router.post('/mensajes', authenticate, authorize([3]), async (req, res) => {
  try {
    const { id_empresa_auditora, id_conversacion, contenido } = req.body;
    const idUsuario = req.user.id_usuario;

    if (!contenido) {
      return res.status(400).json({ message: 'contenido es obligatorio' });
    }

    const conversaciones = await readJson('conversaciones.json');
    const mensajes = await readJson('mensajes.json');
    const empresas = await readJson('empresas.json');
    const usuarios = await readJson('usuarios.json');

    let conversacionId = id_conversacion;

    // Si no hay id_conversacion, crear una nueva conversación
    if (!conversacionId) {
      if (!id_empresa_auditora) {
        return res.status(400).json({ message: 'id_empresa_auditora es obligatorio si no hay id_conversacion' });
      }

      const empresaValida = empresas.find(e => e.id_empresa === Number(id_empresa_auditora) && e.activo);
      if (!empresaValida) {
        return res.status(404).json({ message: 'Empresa auditora no encontrada o inactiva' });
      }

      const cliente = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 3 && u.activo);
      if (!cliente) {
        return res.status(404).json({ message: 'Cliente no encontrado o inactivo' });
      }

      conversacionId = await getNextId('conversaciones.json', 'id_conversacion');
      const nuevaConversacion = {
        id_conversacion: conversacionId,
        id_cliente: idUsuario,
        id_empresa_auditora: Number(id_empresa_auditora),
        asunto: contenido.substring(0, 100) || 'Nueva conversación',
        creado_en: new Date().toISOString(),
        activo: true
      };
      conversaciones.push(nuevaConversacion);
      await writeJson('conversaciones.json', conversaciones);
    } else {
      // Verificar que la conversación existe y pertenece al cliente
      const conversacion = conversaciones.find(c => c.id_conversacion === Number(conversacionId) && c.activo);
      if (!conversacion) {
        return res.status(404).json({ message: 'Conversación no encontrada' });
      }
      if (conversacion.id_cliente !== idUsuario) {
        return res.status(403).json({ message: 'No tienes permisos para enviar mensajes en esta conversación' });
      }
    }

    // Crear el mensaje
    const idMensaje = await getNextId('mensajes.json', 'id_mensaje');
    const nuevoMensaje = {
      id_mensaje: idMensaje,
      id_conversacion: conversacionId,
      emisor_tipo: 'CLIENTE',
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

// GET /api/cliente/auditorias/:idAuditoria/detalle
// Obtener detalle de una auditoría específica
router.get('/auditorias/:idAuditoria/detalle', authenticate, authorize([3]), async (req, res) => {
  try {
    const idAuditoria = Number(req.params.idAuditoria);
    const idUsuario = req.user.id_usuario;

    const auditorias = await readJson('auditorias.json');
    const empresas = await readJson('empresas.json');
    const estados = await readJson('estados_auditoria.json');
    const auditoriaModulos = await readJson('auditoria_modulos.json');
    const modulosAmbientales = await readJson('modulos_ambientales.json');

    const auditoria = auditorias.find(a => a.id_auditoria === idAuditoria);
    if (!auditoria) {
      return res.status(404).json({ message: 'Auditoría no encontrada' });
    }

    // Verificar que el cliente pertenece a esta auditoría
    if (auditoria.id_cliente !== idUsuario) {
      return res.status(403).json({ message: 'No tienes permisos para ver esta auditoría' });
    }

    const empresaAuditora = empresas.find(e => e.id_empresa === auditoria.id_empresa_auditora);
    const estado = estados.find(e => e.id_estado === auditoria.id_estado);

    // Obtener módulos de la auditoría
    const modulosIds = auditoriaModulos
      .filter(am => am.id_auditoria === idAuditoria)
      .map(am => am.id_modulo);

    const modulos = modulosIds.map(id => {
      const modulo = modulosAmbientales.find(m => m.id_modulo === id);
      return modulo ? { id_modulo: modulo.id_modulo, nombre: modulo.nombre, clave: modulo.clave } : null;
    }).filter(m => m !== null);

    res.json({
      id_auditoria: auditoria.id_auditoria,
      id_cliente: auditoria.id_cliente,
      id_empresa_auditora: auditoria.id_empresa_auditora,
      id_estado: auditoria.id_estado,
      modulos: modulosIds,
      modulos_detalle: modulos,
      fecha_creacion: auditoria.creada_en || auditoria.creado_en,
      fecha_inicio: auditoria.fecha_inicio || null,
      monto: auditoria.monto || null,
      empresa_auditora: empresaAuditora ? {
        id_empresa: empresaAuditora.id_empresa,
        nombre: empresaAuditora.nombre
      } : null,
      estado_actual: estado ? {
        id_estado: estado.id_estado,
        nombre: estado.nombre || estado.clave
      } : null
    });
  } catch (error) {
    console.error('Error al obtener detalle de auditoría:', error);
    res.status(500).json({ message: error.message || 'Error al obtener detalle de auditoría' });
  }
});

module.exports = router;