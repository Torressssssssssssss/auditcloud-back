# AuditCloud Backend (JSON)

Servidor Express con almacenamiento en JSON para prototipado rápido.

## Ejecutar

```powershell
cd "c:\Users\angel\Desktop\Redes III\auditcloud-back"
$env:JWT_SECRET = "cambia_este_secreto_en_produccion"
npm install
npm run dev
```

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
