require('dotenv').config(); 
const nodemailer = require('nodemailer');

// Validar que las variables existen al iniciar
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error('❌ ERROR FATAL: Faltan EMAIL_USER o EMAIL_PASS en el archivo .env');
}

// Configuración SMTP explícita para Gmail (Más estable que service: 'gmail')
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465, // Puerto seguro SSL
  secure: true, // true para 465, false para otros puertos
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  // Opciones de depuración para ver errores en consola
  debug: true, 
  logger: true 
});

// Verificar conexión al iniciar el servicio
transporter.verify()
  .then(() => console.log('✅ Servidor de correos listo para enviar mensajes'))
  .catch((error) => console.error('❌ Error de conexión SMTP:', error));

const enviarNotificacionFinalizacion = async (correoCliente, nombreCliente, nombreEmpresa, nombreReporte) => {
  // ... (Tu código html anterior está bien, mantenlo)
  // Solo asegúrate de usar el objeto transporter configurado arriba
};

const enviarAlertaNotificacion = async (correoDestino, nombreUsuario, titulo, mensaje) => {
  try {
    console.log(`[Email Service] Intentando enviar a: ${correoDestino}`);

    const info = await transporter.sendMail({
      from: `"AuditCloud Alertas" <${process.env.EMAIL_USER}>`,
      to: correoDestino,
      subject: `🔔 ${titulo} - AuditCloud`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #4f46e5; padding: 20px; text-align: center;">
            <h2 style="color: #ffffff; margin: 0;">Nueva Actividad</h2>
          </div>
          
          <div style="padding: 20px;">
            <p>Hola <strong>${nombreUsuario}</strong>,</p>
            <p>Se ha generado una nueva notificación en tu panel:</p>
            
            <div style="background-color: #f3f4f6; padding: 15px; border-left: 4px solid #4f46e5; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin: 0 0 10px 0; color: #1f2937;">${titulo}</h3>
              <p style="margin: 0; color: #4b5563;">${mensaje}</p>
            </div>

            <p style="font-size: 0.9em;">Ingresa a la plataforma para gestionar esta actividad.</p>
          </div>
          
          <div style="background-color: #f9fafb; padding: 10px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="font-size: 12px; color: #888; margin: 0;">Este es un mensaje automático, por favor no responder.</p>
          </div>
        </div>
      `
    });
    console.log('📧 Email enviado ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error enviando alerta de correo:', error);
    return false;
  }
};

module.exports = { enviarNotificacionFinalizacion, enviarAlertaNotificacion };