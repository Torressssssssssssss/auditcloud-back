const jwt = require('jsonwebtoken');
const { readJson } = require('./jsonDb');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_auditcloud';
const JWT_EXPIRES_IN = '12h';

function signToken(user) {
  return jwt.sign(
    {
      id_usuario: user.id_usuario,
      id_empresa: user.id_empresa,
      id_rol: user.id_rol,
      correo: user.correo,
      nombre: user.nombre
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Token requerido' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // opcional: cargar usuario para validar que sigue activo
    const usuarios = await readJson('usuarios.json');
    const user = usuarios.find(u => u.id_usuario === payload.id_usuario && u.activo);
    if (!user) return res.status(401).json({ message: 'Usuario no válido o inactivo' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido' });
  }
}

function authorize(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    if (!roles.includes(req.user.id_rol)) {
      return res.status(403).json({ message: 'Sin permisos' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, authorize };
