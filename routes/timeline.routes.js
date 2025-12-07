const express = require('express');
const router = express.Router();
const { readJson, writeJson, getNextId } = require('../utils/jsonDb');
const { authenticate, authorize } = require('../utils/auth');

// GET /api/timeline/empresa/:idEmpresa
// Obtiene todas las auditorías de una empresa con sus respectivos timelines
// GET /api/timeline/empresa/:idEmpresa
// Obtiene todas las auditorías de una empresa con sus respectivos timelines
router.get('/empresa/:idEmpresa', authenticate, async (req, res) => {
  try {
    const idEmpresa = Number(req.params.idEmpresa);
    console.log(`[Timeline] Buscando historial para Empresa ID: ${idEmpresa}`);

    const auditorias = await readJson('auditorias.json');
    const evidencias = await readJson('evidencias.json');
    const comentarios = await readJson('comentarios.json');
    const usuarios = await readJson('usuarios.json');

    // 1. Obtener IDs de usuarios que pertenecen a esa empresa
    // Esto es vital para auditorías viejas que solo guardaron el id_cliente
    const idsUsuariosDeEmpresa = usuarios
      .filter(u => u.id_empresa === idEmpresa)
      .map(u => u.id_usuario);

    console.log(`[Timeline] Usuarios encontrados de la empresa: ${idsUsuariosDeEmpresa.join(', ')}`);

    // 2. Filtrar auditorías (Lógica Robusta OR)
    const misAuditorias = auditorias.filter(a => {
      // Caso A: La auditoría tiene el campo nuevo explícito
      const esPorEmpresaDirecta = a.id_empresa_cliente === idEmpresa;
      
      // Caso B: La auditoría tiene un usuario que pertenece a la empresa
      const esPorUsuario = idsUsuariosDeEmpresa.includes(a.id_cliente);

      return esPorEmpresaDirecta || esPorUsuario;
    });

    console.log(`[Timeline] Auditorías encontradas: ${misAuditorias.length}`);

    // 3. Construir la respuesta agrupada
    const resultado = misAuditorias.map(audit => {
      // Filtrar items para ESTA auditoría
      const misEvidencias = evidencias.filter(e => e.id_auditoria === audit.id_auditoria);
      const misComentarios = comentarios.filter(c => c.id_auditoria === audit.id_auditoria);
      
      const items = [];

      // Mapear Evidencias
      misEvidencias.forEach(e => {
        const autor = usuarios.find(u => u.id_usuario === e.id_auditor);
        items.push({
          id: `EVI-${e.id_evidencia}`,
          tipo: 'EVIDENCIA',
          subtipo: e.tipo,
          descripcion: e.descripcion,
          url: e.url,
          nombre_archivo: e.nombre_archivo,
          autor: autor ? autor.nombre : 'Auditor',
          fecha: e.creado_en
        });
      });

      // Mapear Comentarios
      misComentarios.forEach(c => {
        const autor = usuarios.find(u => u.id_usuario === c.id_usuario);
        items.push({
          id: `COM-${c.id_comentario}`,
          tipo: 'COMENTARIO',
          descripcion: c.mensaje,
          autor: autor ? autor.nombre : 'Usuario',
          fecha: c.creado_en
        });
      });

      // Ordenar items: Más reciente primero
      items.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

      return {
        id_auditoria: audit.id_auditoria,
        fecha_creacion: audit.creada_en || audit.fecha_creacion,
        estado: audit.id_estado, 
        items: items
      };
    });

    // Ordenar las auditorías: La más reciente primero
    resultado.sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion));

    res.json(resultado);

  } catch (error) {
    console.error('[Timeline Error]', error);
    res.status(500).json({ message: 'Error cargando historial de empresa' });
  }
});

// GET /api/timeline/:idAuditoria
router.get('/:idAuditoria', authenticate, async (req, res) => {
  try {
    const idAuditoria = Number(req.params.idAuditoria);
    const auditorias = await readJson('auditorias.json');
    
    const auditoria = auditorias.find(a => a.id_auditoria === idAuditoria);
    if (!auditoria) return res.status(404).json({ message: 'Auditoría no encontrada' });

    // VALIDACIÓN DE SEGURIDAD
    // Permitir si es el CLIENTE o si pertenece a la EMPRESA AUDITORA (Supervisor/Auditor)
    const esCliente = auditoria.id_cliente === req.user.id_usuario;
    const esMiEmpresa = auditoria.id_empresa_auditora === req.user.id_empresa; // Funciona para Rol 1 y 2

    if (!esCliente && !esMiEmpresa) {
      return res.status(403).json({ message: 'Acceso denegado a esta bitácora' });
    }

    // ... (RESTO DEL CÓDIGO DE OBTENCIÓN DE EVIDENCIAS Y COMENTARIOS IGUAL QUE ANTES) ...
    // ... (Copia la lógica de mezcla y ordenamiento que hicimos previamente) ...
    
    // (Resumido para brevedad, asegúrate de mantener la lógica de mezcla aquí)
    const evidencias = await readJson('evidencias.json');
    const comentarios = await readJson('comentarios.json');
    const usuarios = await readJson('usuarios.json');
    const timeline = [];
    
    // ... lógica de push a timeline ...
    
    res.json(timeline);

  } catch (error) {
    res.status(500).json({ message: 'Error timeline' });
  }
});

// POST /api/timeline/comentarios
// Crear un comentario simple
router.post('/comentarios', authenticate, authorize([1, 2]), async (req, res) => {
  const { id_auditoria, mensaje } = req.body;
  
  if (!id_auditoria || !mensaje) {
    return res.status(400).json({ message: 'Faltan datos' });
  }

  const comentarios = await readJson('comentarios.json');
  const idComentario = await getNextId('comentarios.json', 'id_comentario');

  const nuevo = {
    id_comentario: idComentario,
    id_auditoria: Number(id_auditoria),
    id_usuario: req.user.id_usuario,
    mensaje,
    creado_en: new Date().toISOString()
  };

  comentarios.push(nuevo);
  await writeJson('comentarios.json', comentarios);

  res.status(201).json(nuevo);
});

// POST /api/timeline/comentarios
// Permite al Auditor agregar una actualización de texto simple
router.post('/comentarios', authenticate, authorize([1, 2]), async (req, res) => {
  const { id_auditoria, mensaje } = req.body;
  
  if (!id_auditoria || !mensaje) {
    return res.status(400).json({ message: 'Faltan datos' });
  }

  const comentarios = await readJson('comentarios.json');
  const idComentario = await getNextId('comentarios.json', 'id_comentario');

  const nuevo = {
    id_comentario: idComentario,
    id_auditoria: Number(id_auditoria),
    id_usuario: req.user.id_usuario,
    mensaje,
    creado_en: new Date().toISOString()
  };

  comentarios.push(nuevo);
  await writeJson('comentarios.json', comentarios);

  res.status(201).json(nuevo);
});

module.exports = router;