// backend/utils/auth.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET || 'secreto_super_seguro_para_token';

/**
 * Genera un token JWT para un usuario.
 */
const signToken = (usuario) => {
  return jwt.sign(
    {
      id_usuario: usuario.id_usuario,
      id_rol: usuario.id_rol,
      id_empresa: usuario.id_empresa,
      nombre: usuario.nombre,
      correo: usuario.correo
    },
    SECRET_KEY,
    { expiresIn: '8h' }
  );
};

/**
 * Middleware para proteger rutas (Verificar Token).
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Token no proporcionado' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
};

/**
 * Middleware para verificar roles específicos.
 */
const authorize = (rolesPermitidos = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }
    if (!rolesPermitidos.includes(req.user.id_rol)) {
      return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' });
    }
    next();
  };
};

module.exports = { signToken, authenticate, authorize };