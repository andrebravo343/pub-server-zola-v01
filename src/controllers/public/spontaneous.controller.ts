import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { queryOne, execute } from '../../utils/database';
import { generateUUID } from '../../utils/uuid';
import { emailService } from '../../services/email.service';

export class PublicSpontaneousController {
  /**
   * POST /public/spontaneous
   * Criar candidatura espontânea (sem autenticação)
   */
  static async createSpontaneousApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        title,
        bio,
        city,
        province,
        country,
        coverLetter,
        resumeUrl,
        documents,
      } = req.body;

      // Validações básicas
      if (!firstName || !lastName) {
        throw new CustomError('Nome completo é obrigatório', 400);
      }

      if (!email) {
        throw new CustomError('Email é obrigatório', 400);
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new CustomError('Email inválido', 400);
      }

      if (!phone) {
        throw new CustomError('Telefone é obrigatório', 400);
      }

      // Verificar se já existe candidatura espontânea com este email nos últimos 30 dias
      const recentApplication = await queryOne<any>(
        `SELECT id FROM spontaneous_applications 
         WHERE email = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [email.toLowerCase().trim()]
      );

      if (recentApplication) {
        throw new CustomError('Você já enviou uma candidatura espontânea recentemente. Aguarde 30 dias antes de enviar outra.', 400);
      }

      // Criar candidatura espontânea
      const applicationId = generateUUID();
      const now = new Date();

      // Preparar valores para inserção
      const values = [
        applicationId, // id
        firstName.trim(), // first_name
        lastName.trim(), // last_name
        email.toLowerCase().trim(), // email
        phone.trim(), // phone
        title?.trim() || null, // title
        bio?.trim() || null, // bio
        city?.trim() || null, // city
        province?.trim() || null, // province
        country?.trim() || 'Angola', // country
        coverLetter?.trim() || null, // cover_letter
        resumeUrl || null, // resume_url
        documents ? JSON.stringify(documents) : null, // documents
        'pending', // status
        null, // reviewed_by
        null, // reviewed_at
        null, // notes
        now, // created_at
        now, // updated_at
      ];

      await execute(
        `INSERT INTO spontaneous_applications (
          id, first_name, last_name, email, phone, title, bio,
          city, province, country, cover_letter, resume_url, documents,
          status, reviewed_by, reviewed_at, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values
      );

      // Enviar email de confirmação para o candidato
      try {
        const confirmationHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Candidatura Espontânea Recebida - ZOLANGOLA</title>
            </head>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #8f3934; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0;">ZOLANGOLA</h1>
              </div>
              
              <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0;">
                <h2 style="color: #8f3934; margin-top: 0;">Candidatura Espontânea Recebida</h2>
                
                <p>Olá <strong>${firstName} ${lastName}</strong>,</p>
                
                <p>Recebemos a sua candidatura espontânea na plataforma ZOLANGOLA. A nossa equipa irá analisar o seu perfil e entrará em contacto consigo caso haja oportunidades adequadas ao seu perfil.</p>
                
                <div style="background-color: #fff; padding: 20px; border: 2px solid #8f3934; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0; font-weight: bold; color: #8f3934;">Resumo da sua candidatura:</p>
                  <ul style="margin: 0; padding-left: 20px;">
                    <li><strong>Nome:</strong> ${firstName} ${lastName}</li>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Telefone:</strong> ${phone}</li>
                    ${title ? `<li><strong>Título Profissional:</strong> ${title}</li>` : ''}
                    ${city ? `<li><strong>Localização:</strong> ${city}${province ? `, ${province}` : ''}${country ? `, ${country}` : ''}</li>` : ''}
                  </ul>
                </div>
                
                <p>Enquanto aguarda, recomendamos que:</p>
                <ul>
                  <li>Complete o seu perfil na plataforma ZOLANGOLA</li>
                  <li>Explore as vagas disponíveis</li>
                  <li>Mantenha o seu perfil atualizado</li>
                </ul>
                
                <p style="margin-top: 30px;">Obrigado pelo seu interesse em fazer parte da nossa base de talentos!</p>
                
                <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 12px;">
                  Este é um email automático. Por favor, não responda a este email.<br>
                  Se tiver questões, entre em contacto através do nosso site.
                </p>
              </div>
            </body>
          </html>
        `;

        await emailService.sendEmail({
          to: email,
          subject: 'Candidatura Espontânea Recebida - ZOLANGOLA',
          html: confirmationHtml,
        });
      } catch (emailError: any) {
        console.error('❌ Erro ao enviar email de confirmação:', emailError);
        // Continuar mesmo se o email falhar
      }

      // Enviar notificação para o admin (opcional - pode ser implementado depois)
      // Por enquanto, apenas armazenamos no banco

      res.status(201).json(
        createSuccessResponse(
          {
            id: applicationId,
            message: 'Candidatura espontânea enviada com sucesso. Você receberá um email de confirmação em breve.',
          },
          'Candidatura espontânea criada com sucesso'
        )
      );
    } catch (error) {
      next(error);
    }
  }
}

