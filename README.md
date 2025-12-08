# AuditCloud Backend (JSON)

Servidor Express con almacenamiento en JSON para prototipado rápido.

## Ejecutar

```powershell
cd "c:\Users\angel\Desktop\Redes III\auditcloud-back"
$env:JWT_SECRET = "cambia_este_secreto_en_produccion"
$env:ENCRYPTION_KEY = "cambia_esta_clave_de_cifrado_en_produccion"  # Opcional, se genera una por defecto
npm install
npm run dev
```

## Cifrado

Todos los archivos en `data/` (archivos `.json` y `uploads/`) están cifrados con **AES-256-GCM**.

- Los archivos JSON se cifran/descifran automáticamente al leer/escribir
- Los archivos subidos se cifran automáticamente al guardarse
- Los archivos se descifran automáticamente al servirse o descargarse
- Los archivos existentes sin cifrar se migran automáticamente al primer acceso

**Importante**: En producción, configura la variable de entorno `ENCRYPTION_KEY` con una clave segura de 32 bytes (o más). Si no se configura, se usa una clave por defecto (no segura para producción).

### Verificar que el cifrado funciona

```powershell
# Verificación rápida
node verificar-cifrado.js

# Pruebas completas
node test-encryption.js
```

Los scripts verifican:
- ✅ Que los archivos JSON están cifrados
- ✅ Que los archivos en uploads están cifrados
- ✅ Que el cifrado/descifrado funciona correctamente
- ✅ Que los datos se pueden leer después de cifrar

## Estructura
- `app.js`: servidor y montaje de rutas
- `routes/`: `auth`, `supervisor`, `auditor`, `cliente`
- `utils/jsonDb.js`: helper JSON
- `utils/auth.js`: JWT (`authenticate`, `authorize`, `signToken`)
- `data/*.json`: datos

## Login
`POST /api/auth/login`
Body:
```json
{ "correo": "supervisor@auditora-demo.com", "password": "supervisor123" }
```
Respuesta incluye `token` (Bearer).

## Supervisor (Bearer + rol SUPERVISOR)
- `GET /api/supervisor/auditores/:idEmpresa`
- `POST /api/supervisor/auditores`
- `POST /api/supervisor/solicitudes-pago`
- `GET /api/supervisor/solicitudes-pago/:idEmpresa`
- `POST /api/supervisor/solicitudes-pago/:idSolicitud/pagar` (crea auditoría)
- `POST /api/supervisor/auditorias/:idAuditoria/asignar` `{ id_auditor }`
- `POST /api/supervisor/auditorias/:idAuditoria/modulos` `{ id_modulo }`

## Auditor (Bearer + rol AUDITOR)
- `GET /api/auditor/auditorias-asignadas/:idAuditor`
- `POST /api/auditor/evidencias`
- `GET /api/auditor/evidencias/:idAuditoria`
- `PUT /api/auditor/evidencias/:idEvidencia`
- `DELETE /api/auditor/evidencias/:idEvidencia`

## Cliente (Bearer + rol CLIENTE)
- `GET /api/cliente/conversaciones/:idCliente`
- `POST /api/cliente/conversaciones`
- `GET /api/cliente/auditorias/:idCliente`
- `GET /api/cliente/solicitudes-pago/:idCliente`
- `POST /api/cliente/solicitudes-pago`

## Notas
- Semillas: `roles`, `tipos_empresa`, `empresas`, `usuarios` con supervisor; estados de pago y módulos ambientales básicos.
- Validaciones incluidas para existencia de entidades y permisos.
- Este backend está pensado para fines académicos y prototipado.
