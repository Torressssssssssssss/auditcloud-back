const express = require('express');
const router = express.Router();
const { readJson, writeJson, getNextId } = require('../utils/jsonDb');
const { signToken } = require('../utils/auth');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ message: 'correo y password son obligatorios' });
  }

  const usuarios = await readJson('usuarios.json');

  const user = usuarios.find(u => u.correo === correo && u.activo);
  if (!user) {
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }
  const ok = user.password_hash && bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }

  if (!user) {
    return res.status(401).json({ message: 'Credenciales inválidas' });
  }

  const token = signToken(user);
  res.json({
    message: 'Login correcto',
    token,
    usuario: {
      id_usuario: user.id_usuario,
      id_empresa: user.id_empresa,
      nombre: user.nombre,
      correo: user.correo,
      id_rol: user.id_rol
    }
  });
});

// POST /api/auth/google
// Autenticación con Google
router.post('/google', async (req, res) => {
  try {
    const { idToken, rol } = req.body; // rol opcional: 1=SUPERVISOR, 2=AUDITOR, 3=CLIENTE (default)

    if (!idToken) {
      return res.status(400).json({ message: 'idToken de Google es obligatorio' });
    }

    // Obtener CLIENT_ID de Google desde variables de entorno
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ 
        message: 'GOOGLE_CLIENT_ID no configurado en el servidor' 
      });
    }

    // Verificar el token de Google
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: idToken,
        audience: GOOGLE_CLIENT_ID,
      });
    } catch (error) {
      return res.status(401).json({ 
        message: 'Token de Google inválido',
        error: error.message 
      });
    }

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ message: 'El correo de Google es requerido' });
    }

    const usuarios = await readJson('usuarios.json');
    const empresas = await readJson('empresas.json');

    // Buscar si el usuario ya existe
    let usuario = usuarios.find(u => u.correo === email && u.activo);

    if (!usuario) {
      // Crear nuevo usuario
      // Si no se especifica rol, por defecto es CLIENTE (3)
      const idRol = rol ? Number(rol) : 3;
      
      // Si es cliente, crear empresa automáticamente
      let idEmpresa = null;
      if (idRol === 3) {
        const idNuevaEmpresa = await getNextId('empresas.json', 'id_empresa');
        const nuevaEmpresa = {
          id_empresa: idNuevaEmpresa,
          id_tipo_empresa: 2, // Tipo CLIENTE
          nombre: name || 'Empresa de ' + email.split('@')[0],
          rfc: null,
          giro: null,
          direccion: null,
          ciudad: null,
          estado: null,
          pais: 'México',
          contacto_nombre: name || email.split('@')[0],
          contacto_correo: email,
          contacto_telefono: null,
          activo: true
        };
        empresas.push(nuevaEmpresa);
        await writeJson('empresas.json', empresas);
        idEmpresa = idNuevaEmpresa;
      }

      const idUsuario = await getNextId('usuarios.json', 'id_usuario');
      usuario = {
        id_usuario: idUsuario,
        id_empresa: idEmpresa,
        nombre: name || email.split('@')[0],
        correo: email,
        password_hash: null, // No tiene password, solo Google
        id_rol: idRol,
        activo: true,
        google_id: googleId, // Guardar ID de Google para referencia
        foto_url: picture || null,
        creado_en: new Date().toISOString(),
        login_google: true // Marcar que se registró con Google
      };
      usuarios.push(usuario);
      await writeJson('usuarios.json', usuarios);
    } else {
      // Usuario existe, actualizar información de Google si es necesario
      if (!usuario.google_id) {
        usuario.google_id = googleId;
        usuario.foto_url = picture || usuario.foto_url;
        usuario.login_google = true;
        const idx = usuarios.findIndex(u => u.id_usuario === usuario.id_usuario);
        if (idx !== -1) {
          usuarios[idx] = usuario;
          await writeJson('usuarios.json', usuarios);
        }
      }
    }

    // Generar token JWT
    const token = signToken(usuario);

    res.json({
      message: 'Login con Google exitoso',
      token,
      usuario: {
        id_usuario: usuario.id_usuario,
        id_empresa: usuario.id_empresa,
        nombre: usuario.nombre,
        correo: usuario.correo,
        id_rol: usuario.id_rol,
        foto_url: usuario.foto_url
      }
    });
  } catch (error) {
    console.error('Error en login con Google:', error);
    res.status(500).json({ 
      message: 'Error al autenticar con Google',
      error: error.message 
    });
  }
});

const { authenticate } = require('../utils/auth');
// PUT /api/auth/cambiar-password
// Body: { actual, nueva } (requiere autenticación)
router.put('/cambiar-password', authenticate, async (req, res) => {
  const { actual, nueva } = req.body;
  if (!actual || !nueva) return res.status(400).json({ message: 'actual y nueva son obligatorios' });
  const usuarios = await readJson('usuarios.json');
  const idx = usuarios.findIndex(u => u.id_usuario === req.user.id_usuario && u.activo);
  if (idx === -1) return res.status(404).json({ message: 'Usuario no encontrado' });
  const ok = usuarios[idx].password_hash && bcrypt.compareSync(actual, usuarios[idx].password_hash);
  if (!ok) return res.status(401).json({ message: 'Password actual incorrecto' });
  const hash = bcrypt.hashSync(nueva, 10);
  usuarios[idx].password_hash = hash;
  await writeJson('usuarios.json', usuarios);
  res.json({ message: 'Password actualizado' });
});

module.exports = router;
