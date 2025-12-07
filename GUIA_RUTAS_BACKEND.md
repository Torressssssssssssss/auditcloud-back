# Guía Completa de Rutas del Backend - AuditCloud

Esta guía documenta todas las rutas que el backend debe implementar según el flujo de trabajo de AuditCloud.

**Base URL:** `http://localhost:3000`

**Autenticación:** Todas las rutas (excepto login/registro) requieren un token JWT en el header:

```
Authorization: Bearer <token>
```

---

## 🔐 AUTENTICACIÓN

### 1. POST `/api/auth/login`

**Descripción:** Iniciar sesión de cualquier usuario (cliente, supervisor, auditor)

**Body:**

```json
{
  "correo": "usuario@ejemplo.com",
  "password": "password123"
}
```

**Respuesta (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id_usuario": 1,
    "id_rol": 3,
    "id_empresa": 5,
    "nombre": "Juan Pérez",
    "correo": "usuario@ejemplo.com"
  }
}
```

**Errores:**

- `401`: Credenciales incorrectas
- `400`: Datos inválidos

---

### 2. POST `/api/cliente/registro`

**Descripción:** Registrar nuevo cliente (empresa cliente)

**Body:**

```json
{
  "nombre": "Juan Pérez",
  "correo": "juan@empresa.com",
  "password": "password123",
  "nombre_empresa": "Mi Empresa S.A.",
  "ciudad": "Aguascalientes",
  "estado": "Aguascalientes",
  "rfc": "ABC123456XYZ"
}
```

**Respuesta (201):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id_usuario": 10,
    "id_rol": 3,
    "id_empresa": 15,
    "nombre": "Juan Pérez",
    "correo": "juan@empresa.com"
  }
}
```

**Notas:**

- El sistema debe crear automáticamente la empresa cliente
- Asignar rol CLIENTE (id_rol = 3)
- Crear la empresa en la BD

---

## 👤 CLIENTE - Dashboard

### 3. GET `/api/cliente/auditorias/:idCliente`

**Descripción:** Obtener todas las auditorías de un cliente

**Parámetros:**

- `idCliente` (path): ID del usuario cliente
- `page` (query, opcional): Número de página (default: 1)
- `limit` (query, opcional): Límite por página (default: 20)

**Respuesta (200):**

```json
{
  "total": 10,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id_auditoria": 1,
      "id_cliente": 5,
      "id_empresa_auditora": 2,
      "id_estado": 1,
      "modulos": [1, 2],
      "fecha_creacion": "2024-01-15T10:00:00Z",
      "fecha_inicio": "2024-01-20T08:00:00Z",
      "monto": 50000.00
    }
  ]
}
```

---

### 4. GET `/api/cliente/solicitudes-pago/:idCliente`

**Descripción:** Obtener solicitudes de pago de un cliente

**Parámetros:**

- `idCliente` (path): ID del usuario cliente

**Respuesta (200):**

```json
[
  {
    "id_solicitud": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "id_estado": 1,
    "monto": 50000.00,
    "concepto": "Auditoría de Agua y Suelo",
    "fecha_creacion": "2024-01-15T10:00:00Z"
  }
]
```

**Estados:**

- `1`: PENDIENTE_DE_PAGO
- `2`: PAGADA
- `3`: EXPIRADA
- `4`: CANCELADA

---

### 5. GET `/api/cliente/conversaciones/:idCliente`

**Descripción:** Obtener conversaciones de un cliente

**Parámetros:**

- `idCliente` (path): ID del usuario cliente

**Respuesta (200):**

```json
[
  {
    "id_conversacion": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "asunto": "Consulta sobre auditoría",
    "fecha_creacion": "2024-01-15T10:00:00Z",
    "creado_en": "2024-01-15T10:00:00Z",
    "activo": true,
    "empresa": {
      "id_empresa": 2,
      "nombre": "Auditora Demo S.A. de C.V."
    },
    "ultimo_mensaje": {
      "id_mensaje": 10,
      "id_conversacion": 1,
      "emisor_tipo": "CLIENTE",
      "emisor_id": 5,
      "contenido": "Hola, queremos auditoría de agua + suelo...",
      "creado_en": "2024-01-15T10:30:00Z"
    }
  }
]
```

**Notas:**

- Ordenado por fecha del último mensaje (más reciente primero)
- Incluye información de la empresa auditora

---

### 6. POST `/api/cliente/conversaciones`

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

## 🏢 CLIENTE - Empresas Auditoras

### 7. GET `/api/cliente/empresas-auditoras`

**Descripción:** Listar todas las empresas auditoras disponibles (visibles y con módulos configurados)

**Respuesta (200):**

```json
[
  {
    "id_empresa": 2,
    "nombre": "Auditora Demo S.A. de C.V.",
    "pais": "México",
    "estado": "Aguascalientes",
    "ciudad": "Aguascalientes",
    "modulos": [1, 2]
  }
]
```

**Lógica del Backend:**

- Solo empresas con `visible = true` o `activa = true`
- Solo empresas con al menos un módulo configurado (`modulos.length > 0`)
- Incluir `pais` y `estado` si están disponibles

**Módulos:**

- `1`: Agua
- `2`: Residuos/Suelo
- `3`: Energía

---

### 8. GET `/api/cliente/empresas-auditoras/:id`

**Descripción:** Obtener detalle de una empresa auditora específica

**Parámetros:**

- `id` (path): ID de la empresa auditora

**Respuesta (200):**

```json
{
  "id_empresa": 2,
  "nombre": "Auditora Demo S.A. de C.V.",
  "rfc": "ADE123456XYZ",
  "direccion": "Calle Principal 123",
  "telefono": "4491234567",
  "pais": "México",
  "estado": "Aguascalientes",
  "ciudad": "Aguascalientes",
  "modulos": [1, 2],
  "modulos_detalle": [
    {
      "id_modulo": 1,
      "nombre": "Agua",
      "clave": "AGUA"
    },
    {
      "id_modulo": 2,
      "nombre": "Residuos/Suelo",
      "clave": "SUELO"
    }
  ],
  "descripcion": "Empresa especializada en auditorías ambientales..."
}
```

**Errores:**

- `404`: Empresa no encontrada

---

## 💬 CLIENTE - Mensajes

### 9. GET `/api/cliente/mensajes/:idConversacion`

**Descripción:** Obtener mensajes de una conversación específica

**Parámetros:**

- `idConversacion` (path): ID de la conversación

**Respuesta (200):**

```json
{
  "id_conversacion": 1,
  "id_cliente": 5,
  "id_empresa_auditora": 2,
  "asunto": "Consulta sobre auditoría",
  "creado_en": "2024-01-15T10:00:00Z",
  "mensajes": [
    {
      "id_mensaje": 1,
      "id_remitente": 5,
      "tipo_remitente": "CLIENTE",
      "contenido": "Hola, queremos auditoría de agua + suelo...",
      "fecha_envio": "2024-01-15T10:00:00Z"
    },
    {
      "id_mensaje": 2,
      "id_remitente": 2,
      "tipo_remitente": "SUPERVISOR",
      "contenido": "Perfecto, te propongo una auditoría...",
      "fecha_envio": "2024-01-15T11:00:00Z"
    }
  ]
}
```

**Notas:**

- Ordenado cronológicamente (antiguo → nuevo)
- Valida que la conversación pertenezca al cliente

---

### 10. POST `/api/cliente/mensajes`

**Descripción:** Enviar un mensaje (crear conversación o responder)

**Body (si es nueva conversación):**

```json
{
  "id_empresa_auditora": 2,
  "contenido": "Hola, queremos auditoría de agua + suelo en nuestra planta..."
}
```

**Body (si es respuesta a conversación existente):**

```json
{
  "id_conversacion": 1,
  "contenido": "Perfecto, aceptamos la propuesta"
}
```

**Respuesta (201):**

```json
{
  "id_mensaje": 10,
  "id_conversacion": 1,
  "id_remitente": 5,
  "contenido": "Hola, queremos auditoría...",
  "fecha_envio": "2024-01-15T10:00:00Z"
}
```

**Notas:**

- Si no hay `id_conversacion`, crea una nueva conversación automáticamente
- Actualiza el timestamp `ultimo_mensaje_fecha` de la conversación

---

## 💳 CLIENTE - Pagos

### 11. GET `/api/cliente/pagos/:idCliente`

**Descripción:** Obtener todas las solicitudes de pago de un cliente

**Parámetros:**

- `idCliente` (path): ID del usuario cliente

**Respuesta (200):**

```json
[
  {
    "id_solicitud": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "id_estado": 1,
    "monto": 50000.00,
    "modulos": [1, 2],
    "fecha_creacion": "2024-01-15T10:00:00Z",
    "fecha_vencimiento": "2024-01-30T23:59:59Z",
    "empresa_auditora": {
      "id_empresa": 2,
      "nombre": "Auditora Demo S.A. de C.V."
    }
  }
]
```

---

### 12. POST `/api/cliente/pagos/:idSolicitud/procesar`

**Descripción:** Procesar pago de una solicitud (llamar a API de pagos)

**Parámetros:**

- `idSolicitud` (path): ID de la solicitud de pago

**Body:**

```json
{
  "metodo_pago": "paypal" // o "stripe", etc.
}
```

**Respuesta (200):**

```json
{
  "id_transaccion": "PAY-123456789",
  "url_pago": "https://paypal.com/checkout/...",
  "estado": "PENDIENTE"
}
```

**Notas:**

- El backend debe crear la transacción en la API de pagos
- Redirigir al cliente a la URL de pago

---

### 13. POST `/api/cliente/pagos/webhook`

**Descripción:** Webhook para recibir confirmación de pago de la API externa

**Body (ejemplo PayPal):**

```json
{
  "id_transaccion": "PAY-123456789",
  "estado": "COMPLETADO",
  "monto": 50000.00
}
```

**Lógica del Backend:**

- Si `estado === "COMPLETADO"`:
  1. Marcar solicitud como `PAGADA` (id_estado = 2)
  2. **Crear automáticamente la auditoría** con:
     - `id_cliente`: del cliente que pagó
     - `id_empresa_auditora`: de la solicitud
     - `modulos`: de la solicitud
     - `id_estado`: PROGRAMADA o ASIGNADA
     - `monto`: monto pagado

**Respuesta (200):**

```json
{
  "success": true
}
```

---

## 📋 CLIENTE - Auditorías

### 14. GET `/api/cliente/auditorias/:idAuditoria/detalle`

**Descripción:** Obtener detalle de una auditoría específica

**Parámetros:**

- `idAuditoria` (path): ID de la auditoría

**Respuesta (200):**

```json
{
  "id_auditoria": 1,
  "id_cliente": 5,
  "id_empresa_auditora": 2,
  "id_estado": 2,
  "modulos": [1, 2],
  "modulos_detalle": [
    {
      "id_modulo": 1,
      "nombre": "Agua",
      "clave": "AGUA"
    },
    {
      "id_modulo": 2,
      "nombre": "Residuos/Suelo",
      "clave": "SUELO"
    }
  ],
  "fecha_creacion": "2024-01-15T10:00:00Z",
  "fecha_inicio": "2024-01-20T08:00:00Z",
  "monto": 50000.00,
  "empresa_auditora": {
    "id_empresa": 2,
    "nombre": "Auditora Demo S.A. de C.V."
  },
  "estado_actual": {
    "id_estado": 2,
    "nombre": "EN_PROCESO"
  }
}
```

---

### 15. GET `/api/cliente/auditorias/:idAuditoria/reporte`

**Descripción:** Descargar reporte PDF de una auditoría completada

**Parámetros:**

- `idAuditoria` (path): ID de la auditoría

**Respuesta (200):**

- Content-Type: `application/pdf`
- Archivo PDF del reporte
- Content-Disposition: `inline; filename="reporte.pdf"`

**Errores:**

- `404`: Auditoría no encontrada
- `403`: No tienes permisos para ver este reporte
- `404`: No hay reporte disponible para esta auditoría

---

## 🔔 CLIENTE - Notificaciones

### 16. GET `/api/cliente/notificaciones/:idCliente`

**Descripción:** Obtener todas las notificaciones de un cliente

**Parámetros:**

- `idCliente` (path): ID del usuario cliente

**Respuesta (200):**

```json
[
  {
    "id_notificacion": 1,
    "id_cliente": 5,
    "id_auditoria": 10,
    "tipo": "evidencia_subida",
    "titulo": "Nueva evidencia subida",
    "mensaje": "El auditor ha subido una nueva evidencia para la auditoría #10",
    "fecha": "2024-01-20T10:30:00Z",
    "leida": false,
    "auditoria": {
      "id_auditoria": 10,
      "empresa": {
        "id_empresa": 2,
        "nombre": "Auditora Demo S.A. de C.V."
      }
    }
  },
  {
    "id_notificacion": 2,
    "id_cliente": 5,
    "id_auditoria": 10,
    "tipo": "estado_cambiado",
    "titulo": "Estado de auditoría actualizado",
    "mensaje": "La auditoría #10 ha cambiado de estado a EN_PROCESO",
    "fecha": "2024-01-20T09:15:00Z",
    "leida": false,
    "auditoria": {
      "id_auditoria": 10,
      "empresa": {
        "id_empresa": 2,
        "nombre": "Auditora Demo S.A. de C.V."
      }
    }
  },
  {
    "id_notificacion": 3,
    "id_cliente": 5,
    "id_auditoria": 10,
    "tipo": "reporte_subido",
    "titulo": "Nuevo reporte disponible",
    "mensaje": "Se ha subido un nuevo reporte para la auditoría #10",
    "fecha": "2024-01-20T14:00:00Z",
    "leida": true,
    "auditoria": {
      "id_auditoria": 10,
      "empresa": {
        "id_empresa": 2,
        "nombre": "Auditora Demo S.A. de C.V."
      }
    }
  },
  {
    "id_notificacion": 4,
    "id_cliente": 5,
    "id_auditoria": null,
    "tipo": "mensaje_nuevo",
    "titulo": "Nuevo mensaje",
    "mensaje": "Tienes un nuevo mensaje de Auditora Demo S.A. de C.V.",
    "fecha": "2024-01-20T15:00:00Z",
    "leida": false,
    "auditoria": null
  }
]
```

**Tipos de notificación:**

- `evidencia_subida`: Cuando un auditor sube una evidencia
- `estado_cambiado`: Cuando el supervisor cambia el estado de la auditoría
- `reporte_subido`: Cuando se sube un nuevo reporte
- `mensaje_nuevo`: Cuando hay un nuevo mensaje en una conversación

**Notas:**

- Las notificaciones deben crearse automáticamente cuando ocurren estas acciones
- Ordenar por fecha descendente (más recientes primero)
- El campo `leida` indica si el cliente ha visto la notificación
- Incluye información de auditoría y empresa cuando aplica

---

### 17. PUT `/api/cliente/notificaciones/:idNotificacion/leer`

**Descripción:** Marcar una notificación como leída

**Parámetros:**

- `idNotificacion` (path): ID de la notificación

**Respuesta (200):**

```json
{
  "message": "Notificación marcada como leída",
  "notificacion": {
    "id_notificacion": 1,
    "leida": true
  }
}
```

**Errores:**

- `404`: Notificación no encontrada
- `403`: No tienes permisos para marcar esta notificación como leída

---

### 18. PUT `/api/cliente/notificaciones/:idCliente/leer-todas`

**Descripción:** Marcar todas las notificaciones de un cliente como leídas

**Parámetros:**

- `idCliente` (path): ID del usuario cliente

**Respuesta (200):**

```json
{
  "message": "5 notificaciones marcadas como leídas",
  "cantidad_actualizadas": 5
}
```

---

## 📊 CLIENTE - Reportes

### 19. GET `/api/cliente/reportes/:idCliente`

**Descripción:** Obtener todos los reportes disponibles para un cliente

**Parámetros:**

- `idCliente` (path): ID del usuario cliente

**Respuesta (200):**

```json
[
  {
    "id_reporte": 1,
    "id_auditoria": 10,
    "nombre": "Reporte Final - Auditoría de Agua",
    "tipo": "Reporte Final",
    "fecha_elaboracion": "2024-01-20T10:00:00Z",
    "fecha_subida": "2024-01-20T10:00:00Z",
    "url": "/uploads/reportes/reporte_1.pdf",
    "auditoria": {
      "id_auditoria": 10,
      "empresa": {
        "id_empresa": 2,
        "nombre": "Auditora Demo S.A. de C.V."
      }
    }
  },
  {
    "id_reporte": 2,
    "id_auditoria": 10,
    "nombre": "Reporte Parcial - Avance de Trabajo",
    "tipo": "Reporte Parcial",
    "fecha_elaboracion": "2024-01-15T14:30:00Z",
    "fecha_subida": "2024-01-15T14:30:00Z",
    "url": "/uploads/reportes/reporte_2.pdf",
    "auditoria": {
      "id_auditoria": 10,
      "empresa": {
        "id_empresa": 2,
        "nombre": "Auditora Demo S.A. de C.V."
      }
    }
  }
]
```

**Notas:**

- Solo devolver reportes de auditorías que pertenecen al cliente
- Incluir información de la auditoría y empresa auditora
- Ordenar por fecha de elaboración descendente (más recientes primero)
- El campo `url` debe ser la ruta relativa o absoluta al archivo PDF

---

## 👨‍💼 SUPERVISOR - Dashboard

### 20. GET `/api/supervisor/dashboard/:idSupervisor`

**Descripción:** Obtener datos del dashboard del supervisor

**Parámetros:**

- `idSupervisor` (path): ID del usuario supervisor

**Respuesta (200):**

```json
{
  "auditorias_activas": 5,
  "auditorias_por_estado": {
    "1": 2, // PROGRAMADA
    "2": 1, // EN_CAMPO
    "3": 2  // EN_ANALISIS
  },
  "solicitudes_pendientes": 3,
  "conversaciones_nuevas": 2
}
```

---

## 🏢 SUPERVISOR - Configuración de Empresa

### 21. GET `/api/supervisor/empresa/:id`

**Descripción:** Obtener configuración de la empresa auditora del supervisor

**Parámetros:**

- `id` (path): ID de la empresa

**Respuesta (200):**

```json
{
  "id_empresa": 2,
  "nombre": "Auditora Demo S.A. de C.V.",
  "rfc": "ADE123456XYZ",
  "direccion": "Calle Principal 123",
  "telefono": "4491234567",
  "modulos": [1, 2]
}
```

**Notas:**

- `modulos` es un array de números: `[1]` = Agua, `[2]` = Residuos/Suelo, `[3]` = Energía
- Si no hay módulos, devolver `[]`

---

### 22. PUT `/api/supervisor/empresa/:id`

**Descripción:** Actualizar configuración de la empresa auditora

**Parámetros:**

- `id` (path): ID de la empresa

**Body:**

```json
{
  "nombre": "Auditora Demo S.A. de C.V.",
  "rfc": "ADE123456XYZ",
  "direccion": "Calle Principal 123",
  "telefono": "4491234567",
  "modulos": [1, 2]
}
```

**Validaciones:**

- `nombre`: requerido
- `rfc`, `direccion`, `telefono`: opcionales
- `modulos`: array de números (puede estar vacío `[]`)

**Respuesta (200):**

```json
{
  "id_empresa": 2,
  "nombre": "Auditora Demo S.A. de C.V.",
  "rfc": "ADE123456XYZ",
  "direccion": "Calle Principal 123",
  "telefono": "4491234567",
  "modulos": [1, 2]
}
```

**Lógica del Backend:**

- Al guardar, marcar la empresa como `visible = true` para que aparezca a los clientes
- Si no tiene módulos configurados, no debería aparecer a los clientes

---

## 📋 SUPERVISOR - Auditorías

### 23. GET `/api/supervisor/auditorias/:idEmpresa`

**Descripción:** Obtener todas las auditorías de una empresa auditora

**Parámetros:**

- `idEmpresa` (path): ID de la empresa auditora
- `page` (query, opcional): Número de página
- `limit` (query, opcional): Límite por página
- `id_estado` (query, opcional): Filtrar por estado

**Respuesta (200):**

```json
{
  "total": 10,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id_auditoria": 1,
      "id_cliente": 5,
      "id_empresa_auditora": 2,
      "id_estado": 2,
      "modulos": [1, 2],
      "fecha_creacion": "2024-01-15T10:00:00Z",
      "fecha_inicio": "2024-01-20T08:00:00Z",
      "monto": 50000.00,
      "cliente": {
        "id_usuario": 5,
        "nombre": "Juan Pérez",
        "correo": "juan@empresa.com"
      },
      "empresa_cliente": {
        "id_empresa": 15,
        "nombre": "Mi Empresa S.A."
      },
      "estado": {
        "id_estado": 2,
        "nombre": "EN_PROCESO"
      }
    }
  ]
}
```

---

### 24. GET `/api/supervisor/auditorias/:idAuditoria/detalle`

**Descripción:** Obtener detalle completo de una auditoría

**Parámetros:**

- `idAuditoria` (path): ID de la auditoría

**Respuesta (200):**

```json
{
  "id_auditoria": 1,
  "id_cliente": 5,
  "id_empresa_auditora": 2,
  "id_estado": 2,
  "modulos": [1, 2],
  "fecha_creacion": "2024-01-15T10:00:00Z",
  "fecha_inicio": "2024-01-20T08:00:00Z",
  "monto": 50000.00,
  "cliente": {
    "id_empresa": 15,
    "nombre": "Mi Empresa S.A."
  },
  "auditores_asignados": [
    {
      "id_usuario": 8,
      "nombre": "María García",
      "modulos": [1]
    }
  ],
  "hallazgos": [],
  "evidencias": []
}
```

---

### 25. PUT `/api/supervisor/auditorias/:idAuditoria/estado`

**Descripción:** Cambiar estado de una auditoría

**Parámetros:**

- `idAuditoria` (path): ID de la auditoría

**Body:**

```json
{
  "id_estado": 2
}
```

**Estados posibles:**

- `1`: CREADA / PROGRAMADA
- `2`: EN_PROCESO
- `3`: FINALIZADA

**Respuesta (200):**

```json
{
  "message": "Estado de auditoría actualizado",
  "auditoria": {
    "id_auditoria": 1,
    "id_estado": 2
  }
}
```

**Notas:**

- Crea automáticamente una notificación tipo `estado_cambiado` para el cliente

---

### 26. POST `/api/supervisor/auditorias/:idAuditoria/asignar`

**Descripción:** Asignar auditor a una auditoría

**Parámetros:**

- `idAuditoria` (path): ID de la auditoría

**Body:**

```json
{
  "id_auditor": 8
}
```

**Respuesta (201):**

```json
{
  "message": "Auditor asignado",
  "participante": {
    "id_participante": 1,
    "id_auditoria": 1,
    "id_auditor": 8,
    "asignado_en": "2024-01-15T10:00:00Z"
  }
}
```

---

### 27. GET `/api/supervisor/auditorias/:idAuditoria/participantes`

**Descripción:** Lista los auditores asignados a una auditoría específica

**Parámetros:**

- `idAuditoria` (path): ID de la auditoría

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

### 28. POST `/api/supervisor/auditorias/:idAuditoria/modulos`

**Descripción:** Asociar un módulo ambiental a una auditoría

**Parámetros:**

- `idAuditoria` (path): ID de la auditoría

**Body:**

```json
{
  "id_modulo": 1
}
```

**Respuesta (201):**

```json
{
  "message": "Módulo asociado a auditoría",
  "auditoria_modulo": {
    "id_auditoria_modulo": 1,
    "id_auditoria": 1,
    "id_modulo": 1,
    "registrado_en": "2024-01-15T10:00:00Z"
  }
}
```

---

### 29. GET `/api/supervisor/auditores/:idEmpresa`

**Descripción:** Obtener lista de auditores de una empresa

**Parámetros:**

- `idEmpresa` (path): ID de la empresa auditora
- `page` (query, opcional): Número de página
- `limit` (query, opcional): Límite por página

**Respuesta (200):**

```json
{
  "total": 5,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id_usuario": 8,
      "nombre": "María García",
      "correo": "maria@auditora.com",
      "id_rol": 2,
      "id_empresa": 2
    }
  ]
}
```

---

### 30. POST `/api/supervisor/auditores`

**Descripción:** Crear un nuevo auditor

**Body:**

```json
{
  "id_empresa": 2,
  "nombre": "María García",
  "correo": "maria@auditora.com",
  "password": "password123"
}
```

**Respuesta (201):**

```json
{
  "message": "Auditor creado correctamente",
  "auditor": {
    "id_usuario": 8,
    "id_empresa": 2,
    "nombre": "María García",
    "correo": "maria@auditora.com",
    "id_rol": 2
  }
}
```

---

## 💬 SUPERVISOR - Mensajes

### 31. GET `/api/supervisor/conversaciones`

**Descripción:** Obtener conversaciones de la empresa auditora del supervisor

**Notas:**

- **NO requiere parámetro `:idEmpresa` en la URL**
- Usa `req.user.id_empresa` del token JWT para obtener la empresa del supervisor

**Respuesta (200):**

```json
[
  {
    "id_conversacion": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "asunto": "Consulta sobre auditoría",
    "fecha_creacion": "2024-01-15T10:00:00Z",
    "creado_en": "2024-01-15T10:00:00Z",
    "activo": true,
    "cliente": {
      "id_usuario": 5,
      "nombre": "Juan Pérez",
      "correo": "juan@empresa.com"
    },
    "empresa_cliente": {
      "id_empresa": 15,
      "nombre": "Mi Empresa S.A."
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

- Ordenado por fecha del último mensaje (más reciente primero)
- Incluye información del cliente y su empresa

---

### 32. GET `/api/supervisor/mensajes/:idConversacion`

**Descripción:** Obtener mensajes de una conversación específica

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
    "emisor_tipo": "SUPERVISOR",
    "emisor_id": 3,
    "contenido": "Perfecto, te propongo...",
    "creado_en": "2024-01-15T11:00:00Z"
  }
]
```

**Notas:**

- Ordenado cronológicamente (antiguo → nuevo)
- Valida que la conversación pertenezca a la empresa del supervisor

---

### 33. POST `/api/supervisor/mensajes`

**Descripción:** Enviar mensaje desde el supervisor

**Body:**

```json
{
  "id_conversacion": 1,
  "contenido": "Te propongo una auditoría de Agua + Suelo, en 30 días, por $50,000..."
}
```

**Respuesta (201):**

```json
{
  "id_mensaje": 11,
  "id_conversacion": 1,
  "emisor_tipo": "SUPERVISOR",
  "emisor_id": 3,
  "contenido": "Te propongo una auditoría...",
  "creado_en": "2024-01-15T11:00:00Z"
}
```

**Notas:**

- Crea automáticamente una notificación tipo `mensaje_nuevo` para el cliente
- Actualiza el timestamp `ultimo_mensaje_fecha` de la conversación

---

## 💳 SUPERVISOR - Pagos/Órdenes

### 34. GET `/api/supervisor/solicitudes-pago`

**Descripción:** Obtener solicitudes de pago de la empresa auditora del supervisor

**Parámetros:**

- `page` (query, opcional): Número de página
- `limit` (query, opcional): Límite por página

**Notas:**

- Usa `req.user.id_empresa` del token JWT

**Respuesta (200):**

```json
{
  "total": 10,
  "page": 1,
  "limit": 20,
  "data": [
    {
      "id_solicitud": 1,
      "id_cliente": 5,
      "id_empresa_auditora": 2,
      "id_estado": 1,
      "monto": 50000.00,
      "concepto": "Auditoría de Agua y Suelo",
      "fecha_creacion": "2024-01-15T10:00:00Z",
      "nombre_empresa_cliente": "Mi Empresa S.A.",
      "es_mio": true
    }
  ]
}
```

---

### 35. GET `/api/supervisor/solicitudes-pago/:idEmpresa`

**Descripción:** Obtener solicitudes de pago por empresa (alternativa)

**Parámetros:**

- `idEmpresa` (path): ID de la empresa auditora
- `page` (query, opcional): Número de página
- `limit` (query, opcional): Límite por página

**Respuesta (200):**

```json
{
  "total": 10,
  "page": 1,
  "limit": 20,
  "data": [...]
}
```

---

### 36. POST `/api/supervisor/solicitudes-pago`

**Descripción:** Crear solicitud de pago (cuando el cliente acepta la propuesta)

**Body (Modo A - con id_cliente):**

```json
{
  "id_empresa": 15,
  "id_cliente": 5,
  "monto": 50000.00,
  "concepto": "Auditoría de Agua y Suelo"
}
```

**Body (Modo B - solo id_empresa, busca usuario principal):**

```json
{
  "id_empresa": 15,
  "monto": 50000.00,
  "concepto": "Auditoría de Agua y Suelo"
}
```

**Respuesta (201):**

```json
{
  "message": "Solicitud de pago creada por supervisor",
  "solicitud": {
    "id_solicitud": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "id_estado": 1,
    "monto": 50000.00,
    "concepto": "Auditoría de Agua y Suelo",
    "creado_en": "2024-01-15T10:00:00Z",
    "creado_por_supervisor": 3
  }
}
```

**Notas:**

- Se crea automáticamente cuando el cliente dice "Sí, quiero contratar" en el chat
- Estado inicial: `PENDIENTE_DE_PAGO` (id_estado = 1)
- Modo B busca automáticamente el usuario principal de la empresa cliente

---

## 📊 SUPERVISOR - Reportes

### 37. POST `/api/supervisor/reportes`

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
    "nombre_archivo": "reporte_final.pdf",
    "fecha_elaboracion": "2024-01-20T10:00:00Z",
    "fecha_subida": "2024-01-20T10:00:00Z",
    "creado_en": "2024-01-20T10:00:00Z"
  }
}
```

**Notas:**

- Crea automáticamente una notificación tipo `reporte_subido` para el cliente
- Solo acepta archivos PDF
- Límite de 10MB
- Valida que la auditoría pertenezca a la empresa del supervisor

---

### 38. GET `/api/supervisor/clientes-con-auditorias`

**Descripción:** Obtener todas las empresas clientes que tienen o han tenido auditorías con la empresa auditora del supervisor

**Notas:**

- Usa `req.user.id_empresa` del token JWT

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

- Retorna empresas únicas (sin duplicados)
- Incluye métricas como total de auditorías
- Útil para dashboards y listados de clientes

---

## 👨‍🔬 AUDITOR - Dashboard

### 39. GET `/api/auditor/dashboard/:idAuditor`

**Descripción:** Obtener datos del dashboard del auditor

**Parámetros:**

- `idAuditor` (path): ID del usuario auditor

**Respuesta (200):**

```json
{
  "auditorias_asignadas": 3,
  "auditorias_por_estado": {
    "2": 2, // EN_CAMPO
    "3": 1  // EN_ANALISIS
  },
  "evidencias_pendientes": 5
}
```

---

## 📋 AUDITOR - Auditorías

### 40. GET `/api/auditor/auditorias-asignadas/:idAuditor`

**Descripción:** Obtener auditorías asignadas a un auditor

**Parámetros:**

- `idAuditor` (path): ID del usuario auditor

**Respuesta (200):**

```json
[
  {
    "id_auditoria": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "id_estado": 2,
    "modulos": [1, 2],
    "fecha_inicio": "2024-01-20T08:00:00Z",
    "cliente": {
      "id_usuario": 5,
      "nombre": "Juan Pérez",
      "nombre_empresa": "Mi Empresa S.A."
    }
  }
]
```

---

### 41. GET `/api/auditor/auditorias/:id`

**Descripción:** Obtener detalle de una auditoría específica (validando asignación)

**Parámetros:**

- `id` (path): ID de la auditoría

**Respuesta (200):**

```json
{
  "id_auditoria": 1,
  "id_cliente": 5,
  "id_empresa_auditora": 2,
  "id_estado": 2,
  "modulos": [1, 2],
  "fecha_inicio": "2024-01-20T08:00:00Z",
  "cliente": {
    "id_usuario": 5,
    "nombre": "Juan Pérez",
    "nombre_empresa": "Mi Empresa S.A."
  }
}
```

**Errores:**

- `403`: No tienes permiso para ver esta auditoría (no estás asignado)

---

## 📸 AUDITOR - Evidencias

### 42. POST `/api/auditor/evidencias`

**Descripción:** Subir evidencia (foto, documento, etc.)

**Body (multipart/form-data):**

```
id_auditoria: 1
id_modulo: 1
tipo: "foto" // o "documento", "nota"
archivo: <file>
descripcion: "Punto de muestreo en río"
```

**Respuesta (201):**

```json
{
  "message": "Evidencia subida correctamente",
  "evidencia": {
    "id_evidencia": 10,
    "id_auditoria": 1,
    "id_modulo": 1,
    "id_auditor": 3,
    "tipo": "foto",
    "url": "/uploads/evidencias/evidencia_10.jpg",
    "nombre_archivo": "muestreo_rio.jpg",
    "descripcion": "Punto de muestreo en río",
    "creado_en": "2024-01-25T10:00:00Z"
  }
}
```

**Notas:**

- Crea automáticamente una notificación tipo `evidencia_subida` para el cliente
- Acepta PDF, JPG, PNG
- Límite de 5MB

---

### 43. GET `/api/auditor/evidencias/:idAuditoria`

**Descripción:** Listar evidencias de una auditoría

**Parámetros:**

- `idAuditoria` (path): ID de la auditoría (si es 0, lista todas las del auditor)

**Respuesta (200):**

```json
[
  {
    "id_evidencia": 10,
    "id_auditoria": 1,
    "id_modulo": 1,
    "tipo": "foto",
    "url": "/uploads/evidencias/evidencia_10.jpg",
    "descripcion": "Punto de muestreo en río",
    "creado_en": "2024-01-25T10:00:00Z"
  }
]
```

---

### 44. PUT `/api/auditor/evidencias/:idEvidencia`

**Descripción:** Actualizar metadata de la evidencia (no el archivo)

**Parámetros:**

- `idEvidencia` (path): ID de la evidencia

**Body:**

```json
{
  "tipo": "documento",
  "descripcion": "Análisis de laboratorio actualizado"
}
```

**Respuesta (200):**

```json
{
  "message": "Evidencia actualizada",
  "evidencia": {
    "id_evidencia": 10,
    "tipo": "documento",
    "descripcion": "Análisis de laboratorio actualizado",
    "actualizado_en": "2024-01-25T11:00:00Z"
  }
}
```

---

### 45. DELETE `/api/auditor/evidencias/:idEvidencia`

**Descripción:** Eliminar una evidencia

**Parámetros:**

- `idEvidencia` (path): ID de la evidencia

**Respuesta (200):**

```json
{
  "message": "Evidencia eliminada"
}
```

**Errores:**

- `404`: Evidencia no encontrada
- `403`: No puedes borrar evidencias de otros

---

## 💬 AUDITOR - Mensajes

### 46. GET `/api/auditor/conversaciones`

**Descripción:** El auditor ve las conversaciones de SU empresa con los clientes

**Notas:**

- Usa `req.user.id_empresa` del token JWT

**Respuesta (200):**

```json
[
  {
    "id_conversacion": 1,
    "id_cliente": 5,
    "id_empresa_auditora": 2,
    "asunto": "Consulta sobre auditoría",
    "creado_en": "2024-01-15T10:00:00Z",
    "activo": true,
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

- Ordenado por fecha del último mensaje (más reciente primero)
- Incluye información del cliente y su empresa

---

### 47. GET `/api/auditor/mensajes/:idConversacion`

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

### 48. POST `/api/auditor/mensajes`

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

## 💳 AUDITOR - Solicitudes de Pago

### 49. POST `/api/auditor/solicitudes-pago`

**Descripción:** Crea una solicitud de cobro para una Empresa Cliente

**Body:**

```json
{
  "id_empresa": 15,
  "monto": 50000.00,
  "concepto": "Auditoría de Agua y Suelo"
}
```

**Respuesta (201):**

```json
{
  "message": "Solicitud creada para Mi Empresa S.A.",
  "solicitud": {
    "id_solicitud": 1,
    "id_empresa_auditora": 2,
    "id_empresa_cliente": 15,
    "id_cliente": 5,
    "monto": 50000.00,
    "concepto": "Auditoría de Agua y Suelo",
    "id_estado": 1,
    "creado_en": "2024-01-15T10:00:00Z",
    "creado_por_auditor": 3
  }
}
```

**Notas:**

- Busca automáticamente el usuario principal de la empresa cliente
- Usa `req.user.id_empresa` del token JWT para la empresa auditora

---

### 50. GET `/api/auditor/solicitudes-pago`

**Descripción:** Lista historial de cobros de la empresa auditora

**Respuesta (200):**

```json
[
  {
    "id_solicitud": 1,
    "id_empresa_auditora": 2,
    "id_empresa_cliente": 15,
    "id_cliente": 5,
    "monto": 50000.00,
    "concepto": "Auditoría de Agua y Suelo",
    "id_estado": 1,
    "nombre_empresa_cliente": "Mi Empresa S.A.",
    "es_mio": true,
    "creado_en": "2024-01-15T10:00:00Z"
  }
]
```

**Notas:**

- Ordenado: Pendientes primero, luego por fecha
- Usa `req.user.id_empresa` del token JWT

---

## 📝 NOTAS IMPORTANTES

### Estados de Auditoría

- `1`: CREADA / PROGRAMADA
- `2`: EN_PROCESO
- `3`: FINALIZADA

### Estados de Solicitud de Pago

- `1`: PENDIENTE_DE_PAGO
- `2`: PAGADA
- `3`: EXPIRADA
- `4`: CANCELADA

### Módulos

- `1`: Agua
- `2`: Residuos/Suelo
- `3`: Energía

### Roles

- `1`: SUPERVISOR
- `2`: AUDITOR
- `3`: CLIENTE

### Tipos de Notificación

- `evidencia_subida`: Cuando un auditor sube una evidencia
- `estado_cambiado`: Cuando el supervisor cambia el estado de la auditoría
- `reporte_subido`: Cuando se sube un nuevo reporte
- `mensaje_nuevo`: Cuando hay un nuevo mensaje en una conversación

### Flujo de Pago → Auditoría

Cuando el webhook de pago confirma el pago exitoso:

1. Marcar solicitud como `PAGADA` (id_estado = 2)
2. **Crear automáticamente la auditoría** con:
   - `id_cliente`: del cliente que pagó
   - `id_empresa_auditora`: de la solicitud
   - `modulos`: de la solicitud
   - `id_estado`: 1 (PROGRAMADA)
   - `monto`: monto pagado

### Creación Automática de Notificaciones

El backend debe crear notificaciones automáticamente cuando ocurran estas acciones:

1. **Cuando un auditor sube una evidencia** (`POST /api/auditor/evidencias`)
   - Tipo: `evidencia_subida`

2. **Cuando un supervisor cambia el estado de una auditoría** (`PUT /api/supervisor/auditorias/:idAuditoria/estado`)
   - Tipo: `estado_cambiado`

3. **Cuando se sube un reporte** (`POST /api/supervisor/reportes`)
   - Tipo: `reporte_subido`

4. **Cuando se envía un mensaje nuevo** (`POST /api/supervisor/mensajes` o `POST /api/auditor/mensajes`)
   - Tipo: `mensaje_nuevo`

---

## ✅ CHECKLIST DE IMPLEMENTACIÓN

### Prioridad Alta (Funcionalidad Básica)

- [x] POST `/api/auth/login`
- [x] POST `/api/cliente/registro`
- [x] GET `/api/cliente/empresas-auditoras`
- [x] GET `/api/cliente/empresas-auditoras/:id`
- [x] GET `/api/supervisor/empresa/:id`
- [x] PUT `/api/supervisor/empresa/:id`
- [x] GET `/api/cliente/auditorias/:idCliente`
- [x] GET `/api/cliente/conversaciones/:idCliente`
- [x] POST `/api/cliente/conversaciones`
- [x] POST `/api/cliente/mensajes`
- [x] GET `/api/supervisor/conversaciones`
- [x] POST `/api/supervisor/mensajes`
- [x] GET `/api/auditor/conversaciones`
- [x] POST `/api/auditor/mensajes`

### Prioridad Media (Flujo de Pago y Notificaciones)

- [x] POST `/api/supervisor/solicitudes-pago`
- [x] GET `/api/cliente/solicitudes-pago/:idCliente`
- [x] POST `/api/cliente/pagos/:idSolicitud/procesar`
- [x] POST `/api/cliente/pagos/webhook` (crear auditoría automáticamente)
- [x] GET `/api/cliente/notificaciones/:idCliente`
- [x] PUT `/api/cliente/notificaciones/:idNotificacion/leer`
- [x] PUT `/api/cliente/notificaciones/:idCliente/leer-todas`

### Prioridad Baja (Funcionalidades Avanzadas)

- [x] Resto de endpoints de auditorías
- [x] Endpoints de reportes
- [x] Endpoints de evidencias
- [x] Endpoints de mensajes para auditores

---

**Última actualización:** Diciembre 2024
**Versión:** 2.0

