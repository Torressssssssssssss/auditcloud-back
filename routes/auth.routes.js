const express = require('express');
const router = express.Router();
const { readJson, writeJson } = require('../utils/jsonDb');
const { signToken } = require('../utils/auth');
const bcrypt = require('bcryptjs');

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

module.exports = router;

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
