// backend/utils/email.service.js
require('dotenv').config(); // 👈 Aseguramos que cargue las variables de entorno
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    // 👇 Aquí usamos las variables del .env
    user: process.env.EMAIL_USER, 
    pass: process.env.EMAIL_PASS  
  }
});

const enviarNotificacionFinalizacion = async (correoCliente, nombreCliente, nombreEmpresa, nombreReporte) => {
  try {
    // Validación de seguridad para no intentar enviar si faltan credenciales
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('⚠️ No se han configurado las credenciales de correo en el .env');
      return false;
    }

    const info = await transporter.sendMail({
      from: `"AuditCloud System" <${process.env.EMAIL_USER}>`, // Usamos el mismo correo remitente
      to: correoCliente,
      subject: `✅ Auditoría Finalizada - ${nombreEmpresa}`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #16a34a;">¡Tu Auditoría ha Finalizado!</h2>
          <p>Hola <strong>${nombreCliente}</strong>,</p>
          <p>Te informamos que el proceso de auditoría para tu empresa <strong>${nombreEmpresa}</strong> ha concluido exitosamente.</p>
          
          <div style="background-color: #f9fafb; padding: 15px; margin: 20px 0; border-left: 4px solid #16a34a;">
            <p style="margin: 0;"><strong>Documento generado:</strong> ${nombreReporte}</p>
            <p style="margin: 5px 0 0 0;">Estado: <span style="color: #16a34a; font-weight: bold;">FINALIZADA</span></p>
          </div>

          <p>Ya puedes ingresar a la plataforma para descargar tu reporte final y ver la bitácora de actividades.</p>
          
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280;">Este es un mensaje automático de AuditCloud.</p>
        </div>
      `
    });
    console.log('📧 Correo enviado correctamente: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error enviando correo:', error);
    return false;
  }
};

module.exports = { enviarNotificacionFinalizacion };