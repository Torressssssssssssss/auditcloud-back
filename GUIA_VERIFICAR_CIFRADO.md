# 🔐 Guía: Cómo Verificar que el Cifrado Funciona

## 📋 Pasos para Verificar el Cifrado

### **Paso 1: Verificar Estado Actual**

Ejecuta este comando para ver qué archivos están cifrados:

```powershell
node verificar-cifrado.js
```

**Resultado esperado inicialmente:**
- Los archivos existentes mostrarán "NO CIFRADO" (se cifrarán automáticamente en la próxima escritura)

---

### **Paso 2: Activar el Cifrado de Archivos Existentes**

Para que los archivos existentes se cifren automáticamente, necesitas que el sistema los lea y escriba. 

**Opción A: Hacer login (recomendado)**
1. El servidor debe estar corriendo (`npm run dev`)
2. Haz un login a través de la API:
   ```powershell
   # En otra terminal o usando Postman/Thunder Client
   POST http://localhost:3000/api/auth/login
   Body: { "correo": "supervisor@auditora-demo.com", "password": "supervisor123" }
   ```
3. Esto leerá `usuarios.json` y lo cifrará automáticamente

**Opción B: Crear o editar cualquier dato**
- Crear una auditoría
- Subir una evidencia
- Crear un mensaje
- Cualquier operación que escriba datos

---

### **Paso 3: Verificar que se Cifraron**

Después de hacer alguna operación, ejecuta de nuevo:

```powershell
node verificar-cifrado.js
```

**Ahora deberías ver:**
```
✅ usuarios.json - CIFRADO
✅ auditorias.json - CIFRADO
✅ evidencias.json - CIFRADO
...
```

---

### **Paso 4: Verificar que NO se Puede Leer Directamente**

Intenta leer un archivo JSON directamente:

```powershell
Get-Content data\usuarios.json
```

**Resultado esperado:**
- Deberías ver caracteres binarios/ilegibles (no JSON legible)
- Si ves JSON legible con `[{...}]`, entonces NO está cifrado ❌

---

### **Paso 5: Verificar que el Sistema Puede Leerlos**

Aunque estén cifrados, el sistema debe poder leerlos normalmente. Haz otra operación que lea datos:

```powershell
# Ejemplo: Hacer login de nuevo
POST http://localhost:3000/api/auth/login
```

**Resultado esperado:**
- El login debe funcionar normalmente
- Esto confirma que el descifrado automático funciona ✅

---

### **Paso 6: Probar Cifrado de Archivos Subidos**

1. **Sube un archivo** (evidencia o reporte) a través de la API:
   ```powershell
   POST http://localhost:3000/api/auditor/evidencias
   Headers: Authorization: Bearer <tu_token>
   Body: Form-data con archivo
   ```

2. **Verifica que se cifró:**
   ```powershell
   node verificar-cifrado.js
   ```
   
   Deberías ver:
   ```
   📁 Archivos en data/uploads/:
      ✅ 1234567890-abc123.pdf - CIFRADO
   ```

3. **Intenta leer el archivo directamente:**
   ```powershell
   Get-Content data\uploads\1234567890-abc123.pdf -Encoding Byte | Select-Object -First 20
   ```
   
   **Resultado esperado:**
   - Deberías ver bytes aleatorios (no el contenido del PDF)

4. **Verifica que se puede descargar:**
   - Accede a la URL: `http://localhost:3000/uploads/1234567890-abc123.pdf`
   - El archivo debe descargarse correctamente (el sistema lo descifra automáticamente)

---

### **Paso 7: Pruebas Completas (Opcional)**

Para hacer pruebas exhaustivas del sistema de cifrado:

```powershell
node test-encryption.js
```

Este script:
- ✅ Crea archivos de prueba y verifica que se cifran
- ✅ Verifica que se pueden descifrar correctamente
- ✅ Prueba archivos JSON y binarios
- ✅ Verifica todas las funciones de cifrado

---

## ✅ Checklist de Verificación

- [ ] Archivos JSON muestran "CIFRADO" después de operaciones
- [ ] No se pueden leer directamente como texto plano
- [ ] El sistema puede leer/escribir normalmente (descifrado automático)
- [ ] Archivos subidos se cifran automáticamente
- [ ] Archivos subidos se pueden descargar correctamente (descifrado automático)

---

## 🐛 Solución de Problemas

### Si los archivos no se cifran:

1. **Verifica que el servidor esté corriendo** con `npm run dev`
2. **Asegúrate de hacer operaciones** que escriban datos (no solo leer)
3. **Revisa la consola** del servidor por errores
4. **Ejecuta las pruebas completas:**
   ```powershell
   node test-encryption.js
   ```

### Si no puedes leer archivos cifrados:

- Esto es **normal y esperado** ✅
- El sistema los descifra automáticamente cuando los usa
- No intentes leerlos directamente con editores de texto

---

## 📝 Notas Importantes

- Los archivos existentes se cifrarán **automáticamente** la primera vez que se escriban
- El cifrado es **transparente** para el código: usa `readJson()` y `writeJson()` normalmente
- Los archivos subidos se cifran **inmediatamente** después de subirse
- El descifrado es **automático** cuando se sirven o descargan

