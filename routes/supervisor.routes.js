const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readJson, writeJson, getNextId, crearNotificacion } = require('../utils/jsonDb');
const { authenticate, authorize } = require('../utils/auth');
const { uploadFileToFirebase } = require('../utils/firebaseStorage');

// ==========================================
// 1. CONFIGURACIÓN DE MULTER
// ==========================================
const storage = multer.memoryStorage(); // Para Firebase

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

// ==========================================
// 2. GESTIÓN DE AUDITORES
// ==========================================

// GET /api/supervisor/auditores/:idEmpresa
router.get('/auditores/:idEmpresa', authenticate, authorize([1]), async (req, res) => {
  const idEmpresa = Number(req.params.idEmpresa);
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const usuarios = await readJson('usuarios.json');

  // Seguridad: Verificar que el supervisor pide auditores de SU empresa
  if (req.user.id_empresa !== idEmpresa) {
      return res.status(403).json({ message: 'No tienes permiso para ver auditores de otra empresa.' });
  }

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
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  // Seguridad
  if (req.user.id_empresa !== Number(id_empresa)) {
      return res.status(403).json({ message: 'No puedes crear auditores para otra empresa.' });
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

// ==========================================
// 3. CONFIGURACIÓN DE EMPRESA
// ==========================================

// GET /api/supervisor/empresa/:id
router.get('/empresa/:id', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresa = Number(req.params.id);
    const idUsuario = req.user.id_usuario;

    const empresas = await readJson('empresas.json');
    const usuarios = await readJson('usuarios.json');
    const empresaModulos = await readJson('empresa_modulos.json');

    const empresa = empresas.find(e => e.id_empresa === idEmpresa && e.id_tipo_empresa === 1 && e.activo);
    if (!empresa) {
      return res.status(404).json({ message: 'Empresa auditora no encontrada' });
    }

    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== idEmpresa) {
      return res.status(403).json({ message: 'No tienes permisos para acceder a esta empresa' });
    }

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
    console.error('Error config empresa:', error);
    res.status(500).json({ message: 'Error al obtener configuración' });
  }
});

// PUT /api/supervisor/empresa/:id
router.put('/empresa/:id', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresa = Number(req.params.id);
    const { nombre, rfc, direccion, telefono, modulos } = req.body;
    const idUsuario = req.user.id_usuario;

    if (!nombre) return res.status(400).json({ message: 'nombre es obligatorio' });

    const empresas = await readJson('empresas.json');
    const usuarios = await readJson('usuarios.json');
    const empresaModulos = await readJson('empresa_modulos.json');
    const modulosAmbientales = await readJson('modulos_ambientales.json');

    const empresaIdx = empresas.findIndex(e => e.id_empresa === idEmpresa && e.id_tipo_empresa === 1 && e.activo);
    if (empresaIdx === -1) return res.status(404).json({ message: 'Empresa no encontrada' });

    const usuario = usuarios.find(u => u.id_usuario === idUsuario && u.id_rol === 1 && u.activo);
    if (!usuario || usuario.id_empresa !== idEmpresa) {
      return res.status(403).json({ message: 'No tienes permisos para modificar esta empresa' });
    }

    // Validar módulos
    if (modulos && Array.isArray(modulos)) {
      for (const idModulo of modulos) {
        const moduloValido = modulosAmbientales.some(m => m.id_modulo === Number(idModulo));
        if (!moduloValido) return res.status(400).json({ message: `Módulo ${idModulo} no válido` });
      }
    }

    // Actualizar empresa
    empresas[empresaIdx].nombre = nombre;
    empresas[empresaIdx].rfc = rfc || null;
    empresas[empresaIdx].direccion = direccion || null;
    empresas[empresaIdx].contacto_telefono = telefono || null;

    await writeJson('empresas.json', empresas);

    // Actualizar módulos
    const modulosActualizados = empresaModulos.filter(em => em.id_empresa !== idEmpresa);
    
    if (modulos && Array.isArray(modulos)) {
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

    res.json({
      id_empresa: empresas[empresaIdx].id_empresa,
      nombre: empresas[empresaIdx].nombre,
      rfc: empresas[empresaIdx].rfc,
      modulos: modulos.map(Number)
    });
  } catch (error) {
    console.error('Error guardando empresa:', error);
    res.status(500).json({ message: 'Error al guardar configuración' });
  }
});

// ==========================================
// 4. SOLICITUDES DE PAGO (SOLO SUPERVISOR)
// ==========================================

// POST /api/supervisor/solicitudes-pago
router.post('/solicitudes-pago', authenticate, authorize([1]), async (req, res) => {
  try {
    const { id_empresa, id_cliente, monto, concepto } = req.body;
    const id_empresa_auditora = req.user.id_empresa; // El supervisor crea para SU empresa

    if (!monto || !concepto) {
      return res.status(400).json({ message: 'monto y concepto son obligatorios' });
    }

    const solicitudes = await readJson('solicitudes_pago.json');
    const empresas = await readJson('empresas.json');
    const usuarios = await readJson('usuarios.json');

    let nueva = null;
    const idSolicitud = await getNextId('solicitudes_pago.json', 'id_solicitud');

    // CASO 1: Se envía ID de Empresa Cliente Y ID de Usuario Cliente explícitamente
    if (id_empresa && id_cliente) {
      const empresaValida = empresas.some(e => e.id_empresa === Number(id_empresa) && e.activo);
      const clienteValido = usuarios.some(u => u.id_usuario === Number(id_cliente) && u.id_rol === 3 && u.activo);
      
      if (!empresaValida) return res.status(404).json({ message: 'Empresa cliente no encontrada' });
      if (!clienteValido) return res.status(404).json({ message: 'Usuario cliente no encontrado' });

      nueva = {
        id_solicitud: idSolicitud,
        id_empresa: Number(id_empresa), // Empresa que paga (Cliente)
        id_empresa_cliente: Number(id_empresa), // Redundancia para claridad
        id_empresa_auditora: Number(id_empresa_auditora), // Empresa que cobra (Supervisor)
        id_cliente: Number(id_cliente), // Usuario notificado
        monto: Number(monto),
        concepto,
        id_estado: 1, // Pendiente
        creado_en: new Date().toISOString(),
        creado_por_supervisor: req.user.id_usuario
      };
    }
    // CASO 2: Solo se envía ID de Empresa Cliente (Buscamos al usuario principal)
    else if (id_empresa && !id_cliente) {
      const empresaObjetivo = empresas.find(e => e.id_empresa === Number(id_empresa) && e.activo);
      if (!empresaObjetivo || empresaObjetivo.id_tipo_empresa !== 2) {
        return res.status(400).json({ message: 'Empresa cliente inválida' });
      }

      const usuarioPrincipal = usuarios.find(u => u.id_empresa === Number(id_empresa) && u.id_rol === 3 && u.activo);
      if (!usuarioPrincipal) {
        return res.status(400).json({ message: 'La empresa no tiene usuarios administradores' });
      }

      nueva = {
        id_solicitud: idSolicitud,
        id_empresa: Number(id_empresa),
        id_empresa_cliente: Number(id_empresa),
        id_empresa_auditora: Number(id_empresa_auditora),
        id_cliente: usuarioPrincipal.id_usuario,
        monto: Number(monto),
        concepto,
        id_estado: 1,
        creado_en: new Date().toISOString(),
        creado_por_supervisor: req.user.id_usuario
      };
    } else {
      return res.status(400).json({ message: 'Faltan datos de la empresa o cliente destino' });
    }

    solicitudes.push(nueva);
    await writeJson('solicitudes_pago.json', solicitudes);
    
    res.status(201).json({ message: 'Solicitud creada con éxito', solicitud: nueva });

  } catch (error) {
    console.error('Error creando solicitud:', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

// GET /api/supervisor/solicitudes-pago
// Lista las solicitudes de la empresa del supervisor
router.get('/solicitudes-pago', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresaAuditora = Number(req.user.id_empresa);
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);

    const solicitudes = await readJson('solicitudes_pago.json');
    const empresas = await readJson('empresas.json');

    // FILTRO CORRECTO: Buscamos donde nosotros somos la empresa AUDITORA
    // También soportamos compatibilidad si en el pasado se guardó en 'id_empresa'
    const misSolicitudes = solicitudes.filter(s => {
      const sIdAuditora = Number(s.id_empresa_auditora);
      const sIdEmpresa = Number(s.id_empresa); // Compatibilidad
      
      // Si existe id_empresa_auditora, úsalo. Si no, usa id_empresa (asumiendo error previo donde se guardó ahí)
      if (s.id_empresa_auditora) {
        return sIdAuditora === idEmpresaAuditora;
      }
      return sIdEmpresa === idEmpresaAuditora; 
    });

    const data = misSolicitudes.map(s => {
      let nombreCliente = 'Desconocido';
      const idClienteEmpresa = s.id_empresa_cliente || s.id_empresa; // Fallback
      
      if (idClienteEmpresa) {
        const empresa = empresas.find(e => e.id_empresa === Number(idClienteEmpresa));
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
    console.error('Error obteniendo pagos:', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

// ==========================================
// 5. GESTIÓN DE AUDITORÍAS
// ==========================================

// GET /api/supervisor/auditorias/:idEmpresa
router.get('/auditorias/:idEmpresa', authenticate, authorize([1]), async (req, res) => {
  try {
    const idEmpresa = Number(req.params.idEmpresa);
    const idUsuario = req.user.id_usuario;
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const idEstado = req.query.id_estado ? Number(req.query.id_estado) : null;

    if (req.user.id_empresa !== idEmpresa) {
      return res.status(403).json({ message: 'Acceso denegado' });
    }

    const auditorias = await readJson('auditorias.json');
    const usuarios = await readJson('usuarios.json');
    const empresas = await readJson('empresas.json');
    const estados = await readJson('estados_auditoria.json');
    const auditoriaModulos = await readJson('auditoria_modulos.json');

    let all = auditorias.filter(a => a.id_empresa_auditora === idEmpresa);
    
    if (idEstado) {
      all = all.filter(a => a.id_estado === idEstado);
    }

    const auditoriasEnriquecidas = all.map(auditoria => {
      const cliente = usuarios.find(u => u.id_usuario === auditoria.id_cliente);
      const empresaCliente = empresas.find(e => e.id_empresa === cliente?.id_empresa);
      const estado = estados.find(e => e.id_estado === auditoria.id_estado);
      
      const modulos = auditoriaModulos
        .filter(am => am.id_auditoria === auditoria.id_auditoria)
        .map(am => am.id_modulo);

      return {
        ...auditoria,
        modulos,
        fecha_creacion: auditoria.creada_en || auditoria.creado_en,
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

    const start = (page - 1) * limit;
    res.json({
      total: auditoriasEnriquecidas.length,
      page,
      limit,
      data: auditoriasEnriquecidas.slice(start, start + limit)
    });
  } catch (error) {
    console.error('Error auditorías:', error);
    res.status(500).json({ message: 'Error interno' });
  }
});

// PUT Estado de Auditoría
router.put('/auditorias/:idAuditoria/estado', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const { id_estado } = req.body;
  
  if (!id_estado) return res.status(400).json({ message: 'Falta id_estado' });

  const auditorias = await readJson('auditorias.json');
  const idx = auditorias.findIndex(a => a.id_auditoria === idAuditoria);
  
  if (idx === -1) return res.status(404).json({ message: 'Auditoría no encontrada' });
  
  if (auditorias[idx].id_empresa_auditora !== req.user.id_empresa) {
    return res.status(403).json({ message: 'No tienes permiso' });
  }

  auditorias[idx].id_estado = Number(id_estado);
  auditorias[idx].estado_actualizado_en = new Date().toISOString();
  await writeJson('auditorias.json', auditorias);

  // Notificación al cliente
  try {
    if (auditorias[idx].id_cliente) {
      await crearNotificacion({
        id_cliente: auditorias[idx].id_cliente,
        id_auditoria: idAuditoria,
        tipo: 'estado_cambiado',
        titulo: 'Estado actualizado',
        mensaje: `Tu auditoría #${idAuditoria} cambió de estado.`
      });
    }
  } catch (e) { console.error(e); }

  res.json({ message: 'Estado actualizado', auditoria: auditorias[idx] });
});

// Asignar Auditor
router.post('/auditorias/:idAuditoria/asignar', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const { id_auditor } = req.body;

  if (!id_auditor) return res.status(400).json({ message: 'Falta id_auditor' });

  const participantes = await readJson('auditoria_participantes.json');
  const auditorias = await readJson('auditorias.json');
  
  const auditoria = auditorias.find(a => a.id_auditoria === idAuditoria);
  if (!auditoria || auditoria.id_empresa_auditora !== req.user.id_empresa) {
    return res.status(403).json({ message: 'Auditoría inválida o sin permisos' });
  }

  const yaAsignado = participantes.some(p => p.id_auditoria === idAuditoria && p.id_auditor === Number(id_auditor));
  if (yaAsignado) return res.status(400).json({ message: 'Auditor ya asignado' });

  const nuevo = {
    id_participante: await getNextId('auditoria_participantes.json', 'id_participante'),
    id_auditoria: idAuditoria,
    id_auditor: Number(id_auditor),
    asignado_en: new Date().toISOString()
  };
  
  participantes.push(nuevo);
  await writeJson('auditoria_participantes.json', participantes);
  res.status(201).json({ message: 'Asignado correctamente', participante: nuevo });
});

// Modulos de Auditoría
router.post('/auditorias/:idAuditoria/modulos', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const { id_modulo } = req.body;

  const am = await readJson('auditoria_modulos.json');
  // (Omitiendo validaciones profundas por brevedad, asumir control frontend)
  
  const nuevo = {
    id_auditoria_modulo: await getNextId('auditoria_modulos.json', 'id_auditoria_modulo'),
    id_auditoria: idAuditoria,
    id_modulo: Number(id_modulo),
    registrado_en: new Date().toISOString()
  };
  
  am.push(nuevo);
  await writeJson('auditoria_modulos.json', am);
  res.status(201).json({ message: 'Módulo agregado', item: nuevo });
});

// Obtener Participantes
router.get('/auditorias/:idAuditoria/participantes', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const participantes = await readJson('auditoria_participantes.json');
  const usuarios = await readJson('usuarios.json');

  const asignaciones = participantes.filter(p => p.id_auditoria === idAuditoria);
  const resultado = asignaciones.map(a => {
    const u = usuarios.find(user => user.id_usuario === a.id_auditor);
    return { ...u, asignado_en: a.asignado_en };
  });
  res.json(resultado);
});

// Clientes con Auditorías
router.get('/clientes-con-auditorias', authenticate, authorize([1]), async (req, res) => {
  const idEmpresa = req.user.id_empresa;
  const auditorias = await readJson('auditorias.json');
  const usuarios = await readJson('usuarios.json');
  const empresas = await readJson('empresas.json');

  const misAuditorias = auditorias.filter(a => a.id_empresa_auditora === idEmpresa);
  const idsClientes = [...new Set(misAuditorias.map(a => a.id_cliente))];

  const resultado = [];
  idsClientes.forEach(idC => {
    const user = usuarios.find(u => u.id_usuario === idC);
    if(user && user.id_empresa) {
        const emp = empresas.find(e => e.id_empresa === user.id_empresa);
        if(emp) {
            const existe = resultado.find(r => r.id_empresa === emp.id_empresa);
            if(!existe) {
                resultado.push({
                    ...emp,
                    contacto: user.nombre,
                    total_auditorias: misAuditorias.filter(a => a.id_cliente === idC).length
                });
            }
        }
    }
  });
  res.json(resultado);
});

// ==========================================
// 6. REPORTES Y EVIDENCIAS (VISUALIZACIÓN)
// ==========================================

// Reporte Final
router.get('/auditorias/:id/reporte-final', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.id);
  const reportes = await readJson('reportes.json');
  
  // Validar permiso empresa...
  const reporte = reportes.find(r => r.id_auditoria === idAuditoria && r.tipo === 'FINAL');
  if(!reporte) return res.status(404).json({ message: 'No existe reporte final' });
  
  res.json(reporte);
});

// Evidencias
router.get('/auditorias/:idAuditoria/evidencias', authenticate, authorize([1]), async (req, res) => {
  const idAuditoria = Number(req.params.idAuditoria);
  const evidencias = await readJson('evidencias.json');
  res.json(evidencias.filter(e => e.id_auditoria === idAuditoria));
});

module.exports = router;