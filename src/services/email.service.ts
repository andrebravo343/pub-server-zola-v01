import nodemailer from 'nodemailer';
import { config } from '../config/env';

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private initializationAttempted = false;

  /**
   * Inicializar transporter do nodemailer
   */
  private initializeTransporter(): nodemailer.Transporter | null {
    // Se já foi inicializado, retornar
    if (this.transporter) {
      return this.transporter;
    }

    // Evitar múltiplas tentativas de inicialização
    if (this.initializationAttempted) {
      return null;
    }

    this.initializationAttempted = true;

    // Debug: verificar valores de config e process.env
    console.log('\n📧 Inicializando serviço de email...');
    console.log('   Verificando configurações SMTP:');
    
    // Verificar se as configurações SMTP estão disponíveis
    // Debug: mostrar valores lidos (sem expor senha completa)
    // Suportar tanto SMTP_PASSWORD quanto SMTP_PASS (compatibilidade)
    const smtpHost = (config.smtp.host || process.env.SMTP_HOST || '').trim();
    const smtpUser = (config.smtp.user || process.env.SMTP_USER || '').trim();
    const smtpPassword = (config.smtp.password || process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim();
    const smtpPort = config.smtp.port || parseInt(process.env.SMTP_PORT || '587', 10);
    
    console.log(`     SMTP_HOST: ${smtpHost || '(vazio)'}`);
    console.log(`     SMTP_PORT: ${smtpPort}`);
    console.log(`     SMTP_USER: ${smtpUser || '(vazio)'}`);
    console.log(`     SMTP_PASSWORD: ${smtpPassword ? '***' + smtpPassword.slice(-4) : '(vazio)'}`);
    
    // Verificar se todas as variáveis obrigatórias estão presentes
    const missingVars: string[] = [];
    if (!smtpHost) missingVars.push('SMTP_HOST');
    if (!smtpUser) missingVars.push('SMTP_USER');
    if (!smtpPassword) missingVars.push('SMTP_PASSWORD');
    
    if (missingVars.length > 0) {
      console.warn('\n⚠️  SMTP não configurado completamente. Emails não serão enviados.');
      console.warn('   Variáveis faltando:');
      missingVars.forEach(v => console.warn(`     ✗ ${v}`));
      console.warn('\n   Valores atuais:');
      console.warn(`     SMTP_HOST: ${smtpHost || '(vazio)'}`);
      console.warn(`     SMTP_PORT: ${smtpPort}`);
      console.warn(`     SMTP_USER: ${smtpUser || '(vazio)'}`);
      console.warn(`     SMTP_PASSWORD: ${smtpPassword ? '***' + smtpPassword.slice(-4) : '(vazio)'}`);
      console.warn(`     SMTP_FROM: ${config.smtp.from || '(vazio)'}`);
      console.warn('\n   Adicione as variáveis faltando no arquivo .env na pasta server/');
      console.warn('   Exemplo:\n');
      console.warn('     SMTP_HOST=smtp.exemplo.com');
      console.warn('     SMTP_PORT=465');
      console.warn('     SMTP_USER=seu-email@exemplo.com');
      console.warn('     SMTP_PASSWORD=sua-senha-aqui\n');
      return null;
    }

    try {
      // Usar valores já validados acima
      const host = smtpHost;
      const port = smtpPort;
      const user = smtpUser;
      const password = smtpPassword;
      
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true para 465, false para outras portas
        auth: {
          user,
          pass: password,
        },
        // Para desenvolvimento local (Gmail, etc.)
        tls: {
          rejectUnauthorized: false,
        },
      });

      console.log('\n✅ Serviço de email configurado com sucesso!');
      console.log(`   Host: ${host}`);
      console.log(`   Port: ${port}`);
      console.log(`   User: ${user}`);
      console.log('   Pronto para enviar emails.\n');
      return this.transporter;
    } catch (error) {
      console.error('❌ Erro ao configurar serviço de email:', error);
      return null;
    }
  }

  /**
   * Verificar conexão SMTP
   */
  async verifyConnection(): Promise<boolean> {
    const transporter = this.initializeTransporter();
    if (!transporter) {
      return false;
    }

    try {
      await transporter.verify();
      return true;
    } catch (error) {
      console.error('❌ Erro ao verificar conexão SMTP:', error);
      return false;
    }
  }

  /**
   * Enviar email genérico
   */
  async sendEmail(options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    const transporter = this.initializeTransporter();
    if (!transporter) {
      console.warn('⚠️  Email não enviado: SMTP não configurado');
      return false;
    }

    try {
      await transporter.sendMail({
        from: config.smtp.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''), // Remover HTML para versão texto
      });

      console.log(`✅ Email enviado para: ${options.to}`);
      return true;
    } catch (error) {
      console.error(`❌ Erro ao enviar email para ${options.to}:`, error);
      return false;
    }
  }

  /**
   * Enviar email de convite para administrador
   */
  async sendAdminInviteEmail(
    email: string,
    tempPassword: string,
    inviteUrl: string,
    invitedBy: string,
    role: string
  ): Promise<boolean> {
    const roleLabels: Record<string, string> = {
      super_admin: 'Super Administrador',
      admin: 'Administrador',
      moderator: 'Moderador',
      finance: 'Financeiro',
      hr: 'Recursos Humanos',
    };

    const roleLabel = roleLabels[role] || role;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Convite para ZOLANGOLA</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #8f3934; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">ZOLANGOLA</h1>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0;">
            <h2 style="color: #8f3934; margin-top: 0;">Convite para Administrador</h2>
            
            <p>Olá,</p>
            
            <p>Você foi convidado por <strong>${invitedBy}</strong> para se tornar um <strong>${roleLabel}</strong> na plataforma ZOLANGOLA.</p>
            
            <div style="background-color: #fff; padding: 20px; border: 2px solid #8f3934; border-radius: 8px; margin: 20px 0; text-align: center;">
              <p style="margin: 0 0 10px 0; font-weight: bold; color: #8f3934;">Suas credenciais temporárias:</p>
              <p style="margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #333;">
                Email: <strong>${email}</strong><br>
                Senha temporária: <strong style="background-color: #f0f0f0; padding: 5px 10px; border-radius: 4px; font-family: monospace;">${tempPassword}</strong>
              </p>
            </div>
            
            <p style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <strong>⚠️ Importante:</strong><br>
              • Use estas credenciais para fazer login pela primeira vez<br>
              • Você será solicitado a alterar sua senha após o primeiro acesso<br>
              • Este convite expira em 7 dias
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${inviteUrl}" 
                 style="background-color: #8f3934; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Acessar Plataforma
              </a>
            </div>
            
            <p style="font-size: 12px; color: #666; margin-top: 30px;">
              <strong>Instruções:</strong><br>
              1. Acesse a plataforma usando o botão acima ou o link: <a href="${inviteUrl}" style="color: #8f3934; word-break: break-all;">${inviteUrl}</a><br>
              2. Faça login com o email e senha temporária fornecidos acima<br>
              3. Você será redirecionado para definir uma nova senha<br>
              4. Após definir sua senha, você terá acesso completo à plataforma
            </p>
            
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #666; margin: 0;">
              Este é um email automático, por favor não responda.
            </p>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `Convite para Administrador - ZOLANGOLA`,
      html,
    });
  }

  /**
   * Enviar email de recuperação de senha
   */
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Recuperação de Senha - ZOLANGOLA</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #8f3934; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">ZOLANGOLA</h1>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0;">
            <h2 style="color: #8f3934; margin-top: 0;">Recuperação de Senha</h2>
            
            <p>Olá,</p>
            
            <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
            
            <p style="background-color: #fff; padding: 15px; border-left: 4px solid #8f3934; margin: 20px 0;">
              <strong>⚠️ Importante:</strong> Este link expira em 1 hora. Se você não solicitou esta alteração, ignore este email.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #8f3934; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Redefinir Senha
              </a>
            </div>
            
            <p style="font-size: 12px; color: #666; margin-top: 30px;">
              Se o botão não funcionar, copie e cole este link no seu navegador:<br>
              <a href="${resetUrl}" style="color: #8f3934; word-break: break-all;">${resetUrl}</a>
            </p>
            
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #666; margin: 0;">
              Este é um email automático, por favor não responda.
            </p>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `Recuperação de Senha - ZOLANGOLA`,
      html,
    });
  }
}

export const emailService = new EmailService();
export default emailService;

