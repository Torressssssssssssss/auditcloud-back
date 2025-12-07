# Correcciones Necesarias en la Documentación de Rutas

## ✅ Endpoints Correctamente Documentados
- Notificaciones (29, 30, 31) ✓
- Reportes del cliente (32, 33) ✓
- GET /api/cliente/auditorias/:idAuditoria/reporte (14) ✓

## ❌ Endpoints Faltantes o Incorrectos en la Documentación

### 1. **POST /api/supervisor/reportes** (FALTA)
**Estado:** Implementado pero no documentado correctamente

**Ruta actual en doc:** POST `/api/supervisor/reportes/generar` (INCORRECTO)
**Ruta implementada:** POST `/api/supervisor/reportes`

**Descripción:** Subir un reporte PDF para una auditoría

**Body (multipart/form-data):**
```
id_auditoria: 1
nombre: "Reporte Final - Auditoría de Agua"
tipo: "Reporte Final" (opcional)
archivo: <file PDF>
```

**Respuesta (201):**
```json
{
  "message": "Reporte subido correctamente",
  "reporte": {
    "id_reporte": 1,
    "id_auditoria": 1,
    "nombre": "Reporte Final - Auditoría de Agua",
    "tipo": "Reporte Final",
    "url": "/uploads/reportes/reporte_1.pdf",
    "fecha_elaboracion": "2024-01-20T10:00:00Z",
    "fecha_subida": "2024-01-20T10:00:00Z"
  }
}
```

**Notas:**
- Crea automáticamente una notificación tipo `reporte_subido` para el cliente
- Solo acepta archivos PDF
- Límite de 10MB

---

### 2. **GET /api/supervisor/conversaciones** (CORREGIR)
**Estado:** Documentado incorrectamente

**Ruta en doc:** GET `/api/supervisor/conversaciones/:idEmpresa` (INCORRECTO)
**Ruta implementada:** GET `/api/supervisor/conversaciones` (sin parámetro)

**Descripción:** Obtener conversaciones de la empresa auditora del supervisor

**Notas:**
- NO requiere parámetro `:idEmpresa` en la URL
- Usa `req.user.id_empresa` del token JWT para obtener la empresa del supervisor

**Respuesta (200):** (igual que en la doc, pero sin parámetro en URL)

---

### 3. **GET /api/supervisor/clientes-con-auditorias** (FALTA)
**Estado:** Implementado pero no documentado

**Ruta:** GET `/api/supervisor/clientes-con-auditorias`

**Descripción:** Obtener todas las empresas clientes que tienen o han tenido auditorías con la empresa auditora del supervisor

**Respuesta (200):**
```json
[
  {
    "id_empresa": 15,
    "nombre": "Mi Empresa S.A.",
    "ciudad": "Aguascalientes",
    "pais": "México",
    "contacto": "Juan Pérez",
    "total_auditorias": 3,
    "activo": true
  }
]
```

**Notas:**
- Usa `req.user.id_empresa` del token JWT
- Retorna empresas únicas (sin duplicados)
- Incluye métricas como total de auditorías

---

### 4. **GET /api/auditor/conversaciones** (FALTA)
**Estado:** Implementado pero no documentado

**Ruta:** GET `/api/auditor/conversaciones`

**Descripción:** El auditor ve las conversaciones de SU empresa con los clientes

**Respuesta (200):**
```json
[
  {
    "id_conversacion": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "asunto": "Consulta sobre auditoría",
    "creado_en": "2024-01-15T10:00:00Z",
    "cliente": {
      "id_usuario": 5,
      "nombre": "Juan Pérez",
      "nombre_empresa": "Mi Empresa S.A."
    },
    "ultimo_mensaje": {
      "id_mensaje": 10,
      "id_conversacion": 1,
      "emisor_tipo": "CLIENTE",
      "emisor_id": 5,
      "contenido": "Hola, queremos auditoría...",
      "creado_en": "2024-01-15T10:30:00Z"
    }
  }
]
```

**Notas:**
- Usa `req.user.id_empresa` del token JWT
- Ordenado por fecha del último mensaje (más reciente primero)

---

### 5. **GET /api/auditor/mensajes/:idConversacion** (FALTA)
**Estado:** Implementado pero no documentado

**Ruta:** GET `/api/auditor/mensajes/:idConversacion`

**Descripción:** Obtener mensajes de una conversación específica (para auditores)

**Parámetros:**
- `idConversacion` (path): ID de la conversación

**Respuesta (200):**
```json
[
  {
    "id_mensaje": 1,
    "id_conversacion": 1,
    "emisor_tipo": "CLIENTE",
    "emisor_id": 5,
    "contenido": "Hola, queremos auditoría...",
    "creado_en": "2024-01-15T10:00:00Z"
  },
  {
    "id_mensaje": 2,
    "id_conversacion": 1,
    "emisor_tipo": "AUDITOR",
    "emisor_id": 3,
    "contenido": "Perfecto, te propongo...",
    "creado_en": "2024-01-15T11:00:00Z"
  }
]
```

**Notas:**
- Valida que la conversación pertenezca a la empresa del auditor
- Ordenado cronológicamente (antiguo → nuevo)

---

### 6. **POST /api/auditor/mensajes** (FALTA)
**Estado:** Implementado pero no documentado

**Ruta:** POST `/api/auditor/mensajes`

**Descripción:** Enviar mensaje desde el auditor

**Body:**
```json
{
  "id_conversacion": 1,
  "contenido": "Buenas tardes, podemos ayudarle con..."
}
```

**Respuesta (201):**
```json
{
  "id_mensaje": 11,
  "id_conversacion": 1,
  "emisor_tipo": "AUDITOR",
  "emisor_id": 3,
  "contenido": "Buenas tardes, podemos ayudarle con...",
  "creado_en": "2024-01-15T11:00:00Z"
}
```

**Notas:**
- Crea automáticamente una notificación tipo `mensaje_nuevo` para el cliente
- Actualiza el timestamp `ultimo_mensaje_fecha` de la conversación
- Valida que la conversación pertenezca a la empresa del auditor

---

### 7. **GET /api/cliente/auditorias/:idAuditoria/detalle** (CORREGIR)
**Estado:** Documentado incorrectamente

**Ruta en doc:** GET `/api/cliente/auditorias/:idAuditoria` (INCORRECTO)
**Ruta implementada:** GET `/api/cliente/auditorias/:idAuditoria/detalle`

**Nota:** El endpoint 13 en la doc dice `/api/cliente/auditorias/:idAuditoria` pero la implementación usa `/detalle`. Debe corregirse en la doc.

---

### 8. **POST /api/supervisor/auditorias/:idAuditoria/asignar** (CORREGIR)
**Estado:** Documentado incorrectamente

**Ruta en doc:** POST `/api/supervisor/auditorias/:idAuditoria/asignar-auditor` (INCORRECTO)
**Ruta implementada:** POST `/api/supervisor/auditorias/:idAuditoria/asignar`

**Body:**
```json
{
  "id_auditor": 8
}
```

**Nota:** El endpoint 21 en la doc tiene el nombre incorrecto. Debe ser `/asignar` no `/asignar-auditor`.

---

### 9. **GET /api/auditor/auditorias-asignadas/:idAuditor** (CORREGIR)
**Estado:** Documentado incorrectamente

**Ruta en doc:** GET `/api/auditor/auditorias/:idAuditor` (INCORRECTO)
**Ruta implementada:** GET `/api/auditor/auditorias-asignadas/:idAuditor`

**Nota:** El endpoint 30 en la doc dice `/auditorias/:idAuditor` pero la implementación usa `/auditorias-asignadas/:idAuditor`.

---

### 10. **GET /api/supervisor/auditorias/:idAuditoria/participantes** (FALTA)
**Estado:** Implementado pero no documentado

**Ruta:** GET `/api/supervisor/auditorias/:idAuditoria/participantes`

**Descripción:** Lista los auditores asignados a una auditoría específica

**Respuesta (200):**
```json
[
  {
    "id_usuario": 8,
    "nombre": "María García",
    "correo": "maria@auditora.com",
    "asignado_en": "2024-01-15T10:00:00Z"
  }
]
```

---

### 11. **POST /api/cliente/conversaciones** (FALTA)
**Estado:** Implementado pero no documentado

**Ruta:** POST `/api/cliente/conversaciones`

**Descripción:** Crear una nueva conversación entre cliente y empresa auditora

**Body:**
```json
{
  "id_cliente": 5,
  "id_empresa_auditora": 2,
  "asunto": "Consulta sobre auditoría de agua",
  "primer_mensaje": "Hola, me gustaría obtener más información..."
}
```

**Respuesta (201):**
```json
{
  "message": "Conversación creada",
  "conversacion": {
    "id_conversacion": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "asunto": "Consulta sobre auditoría de agua",
    "creado_en": "2024-01-15T10:00:00Z",
    "activo": true
  },
  "primer_mensaje": {
    "id_mensaje": 1,
    "id_conversacion": 1,
    "emisor_tipo": "CLIENTE",
    "emisor_id": 5,
    "contenido": "Hola, me gustaría obtener más información...",
    "creado_en": "2024-01-15T10:00:00Z"
  }
}
```

---

## 📝 Resumen de Cambios Necesarios

### Agregar a la documentación:
1. POST `/api/supervisor/reportes` (reemplazar `/reportes/generar`)
2. GET `/api/supervisor/clientes-con-auditorias`
3. GET `/api/auditor/conversaciones`
4. GET `/api/auditor/mensajes/:idConversacion`
5. POST `/api/auditor/mensajes`
6. GET `/api/supervisor/auditorias/:idAuditoria/participantes`
7. POST `/api/cliente/conversaciones`

### Corregir en la documentación:
1. GET `/api/supervisor/conversaciones` (quitar `:idEmpresa` del path)
2. GET `/api/cliente/auditorias/:idAuditoria/detalle` (agregar `/detalle`)
3. POST `/api/supervisor/auditorias/:idAuditoria/asignar` (cambiar de `/asignar-auditor` a `/asignar`)
4. GET `/api/auditor/auditorias-asignadas/:idAuditor` (cambiar de `/auditorias/:idAuditor`)

