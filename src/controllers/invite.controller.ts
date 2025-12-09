import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middlewares/errorHandler';
import { createSuccessResponse } from '../utils/response';
import { queryOne, execute, query } from '../utils/database';
import { UserModel } from '../models/User.model';
import { generateUUID } from '../utils/uuid';
import crypto from 'crypto';
import { emailService } from '../services/email.service';

export class InviteController {
  /**
   * POST /admin/invites
   * Criar convite para novo administrador
   */
  static async createInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se o usuário é super_admin
      const currentUser = await UserModel.findById(userId);
      if (!currentUser || currentUser.userType !== 'admin') {
        throw new CustomError('Apenas administradores podem criar convites', 403);
      }

      const adminUser = await queryOne<any>(
        `SELECT role FROM admin_users WHERE user_id = ?`,
        [userId]
      );

      if (!adminUser || adminUser.role !== 'super_admin') {
        throw new CustomError('Apenas super administradores podem criar convites', 403);
      }

      const { email, role, permissions } = req.body;

      if (!email || !role) {
        throw new CustomError('Email e função são obrigatórios', 400);
      }

      // Validar email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new CustomError('Email inválido', 400);
      }

      // Verificar se o email já está em uso
      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        throw new CustomError('Este email já está em uso', 400);
      }

      // Verificar se já existe convite pendente para este email
      const existingInvite = await queryOne<any>(
        `SELECT * FROM admin_invites WHERE email = ? AND is_used = FALSE AND expires_at > NOW()`,
        [email]
      );

      if (existingInvite) {
        throw new CustomError('Já existe um convite pendente para este email', 400);
      }

      // Gerar token único
      const token = crypto.randomBytes(32).toString('hex');
      const inviteId = generateUUID();
      
      // Gerar senha temporária (8 caracteres alfanuméricos)
      const tempPassword = crypto.randomBytes(4).toString('hex').toUpperCase();
      
      // Expira em 7 dias
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Criar convite (armazenar senha temporária no token ou criar campo separado)
      // Por segurança, vamos criar o usuário apenas quando o convite for aceito
      // Mas vamos enviar a senha temporária no email
      await execute(
        `INSERT INTO admin_invites (id, email, role, permissions, token, invited_by, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          inviteId,
          email.toLowerCase().trim(),
          role,
          permissions ? JSON.stringify(permissions) : null,
          token,
          userId,
          expiresAt,
        ]
      );

      // Buscar email do usuário que está enviando o convite
      const inviterEmail = currentUser?.email || 'Administrador';

      // Criar usuário com senha temporária imediatamente
      const newAdminUser = await UserModel.create({
        email: email.toLowerCase().trim(),
        password: tempPassword,
        userType: 'admin',
      });

      // Criar registro em admin_users
      const adminUserId = generateUUID();
      await execute(
        `INSERT INTO admin_users (id, user_id, full_name, role, permissions)
         VALUES (?, ?, ?, ?, ?)`,
        [
          adminUserId,
          newAdminUser.id,
          'Administrador', // Nome temporário, será atualizado no primeiro login
          role,
          permissions ? JSON.stringify(permissions) : JSON.stringify([]),
        ]
      );

      // Criar URL do login (usuário já foi criado, só precisa fazer login)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const inviteUrl = `${frontendUrl}/admin/login`;

      // Enviar email com senha temporária
      let emailSent = false;
      try {
        emailSent = await emailService.sendAdminInviteEmail(
          email,
          tempPassword,
          inviteUrl,
          inviterEmail,
          role
        );
      } catch (emailError: any) {
        console.error('❌ Erro ao enviar email de convite:', emailError);
        // Continuar mesmo se o email falhar
      }

      // Preparar resposta
      const responseData: any = {
        inviteId,
        email,
        expiresAt,
      };

      // Em desenvolvimento ou se email não foi enviado, incluir senha temporária na resposta
      if (process.env.NODE_ENV === 'development' || !emailSent) {
        responseData.tempPassword = tempPassword;
        responseData.inviteUrl = inviteUrl;
        if (!emailSent) {
          responseData.warning = 'Email não enviado. Use a senha temporária acima para fazer login.';
        }
      }

      res.status(201).json(
        createSuccessResponse(
          responseData,
          emailSent ? 'Convite criado e enviado por email com sucesso' : 'Convite criado com sucesso (email não enviado - verifique configuração SMTP)'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/invites
   * Listar todos os convites
   */
  static async listInvites(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se o usuário é super_admin
      const user = await UserModel.findById(userId);
      if (!user || user.userType !== 'admin') {
        throw new CustomError('Apenas administradores podem ver convites', 403);
      }

      const adminUser = await queryOne<any>(
        `SELECT role FROM admin_users WHERE user_id = ?`,
        [userId]
      );

      if (!adminUser || adminUser.role !== 'super_admin') {
        throw new CustomError('Apenas super administradores podem ver convites', 403);
      }

      const invites = await query<any>(
        `SELECT 
          ai.id,
          ai.email,
          ai.role,
          ai.permissions,
          ai.is_used,
          ai.expires_at,
          ai.accepted_at,
          ai.created_at,
          u1.email as invited_by_email,
          u2.email as accepted_by_email
         FROM admin_invites ai
         LEFT JOIN users u1 ON ai.invited_by = u1.id
         LEFT JOIN users u2 ON ai.accepted_by = u2.id
         ORDER BY ai.created_at DESC`
      );

      res.status(200).json(
        createSuccessResponse(invites, 'Convites listados com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/invites/:id
   * Cancelar convite
   */
  static async cancelInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Verificar se o usuário é super_admin
      const user = await UserModel.findById(userId);
      if (!user || user.userType !== 'admin') {
        throw new CustomError('Apenas administradores podem cancelar convites', 403);
      }

      const adminUser = await queryOne<any>(
        `SELECT role FROM admin_users WHERE user_id = ?`,
        [userId]
      );

      if (!adminUser || adminUser.role !== 'super_admin') {
        throw new CustomError('Apenas super administradores podem cancelar convites', 403);
      }

      const { id } = req.params;

      const invite = await queryOne<any>(
        `SELECT * FROM admin_invites WHERE id = ?`,
        [id]
      );

      if (!invite) {
        throw new CustomError('Convite não encontrado', 404);
      }

      if (invite.is_used) {
        throw new CustomError('Não é possível cancelar um convite já aceito', 400);
      }

      await execute(
        `DELETE FROM admin_invites WHERE id = ?`,
        [id]
      );

      res.status(200).json(
        createSuccessResponse(null, 'Convite cancelado com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/invite/:token
   * Validar token de convite
   */
  static async validateInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;

      const invite = await queryOne<any>(
        `SELECT 
          ai.*,
          u.email as invited_by_email
         FROM admin_invites ai
         LEFT JOIN users u ON ai.invited_by = u.id
         WHERE ai.token = ?`,
        [token]
      );

      if (!invite) {
        throw new CustomError('Convite inválido', 404);
      }

      if (invite.is_used) {
        throw new CustomError('Este convite já foi utilizado', 400);
      }

      if (new Date(invite.expires_at) < new Date()) {
        throw new CustomError('Este convite expirou', 400);
      }

      // Verificar se o email já está em uso
      const existingUser = await UserModel.findByEmail(invite.email);
      if (existingUser) {
        throw new CustomError('Este email já está em uso', 400);
      }

      res.status(200).json(
        createSuccessResponse(
          {
            email: invite.email,
            role: invite.role,
            permissions: invite.permissions ? JSON.parse(invite.permissions) : null,
            invitedBy: invite.invited_by_email,
            expiresAt: invite.expires_at,
          },
          'Convite válido'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/register-with-invite
   * Atualizar nome completo do admin após primeiro login
   * O usuário já foi criado quando o convite foi enviado
   */
  static async registerWithInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, fullName } = req.body;

      if (!token || !fullName) {
        throw new CustomError('Token e nome completo são obrigatórios', 400);
      }

      // Validar convite
      const invite = await queryOne<any>(
        `SELECT * FROM admin_invites WHERE token = ?`,
        [token]
      );

      if (!invite) {
        throw new CustomError('Convite inválido', 404);
      }

      // Se já foi usado, apenas verificar se não expirou (para permitir atualização do nome)
      if (invite.is_used && new Date(invite.expires_at) < new Date()) {
        throw new CustomError('Este convite expirou', 400);
      }

      // Se não foi usado, verificar se não expirou
      if (!invite.is_used && new Date(invite.expires_at) < new Date()) {
        throw new CustomError('Este convite expirou', 400);
      }

      // Buscar usuário criado quando o convite foi enviado
      const user = await UserModel.findByEmail(invite.email);
      if (!user) {
        throw new CustomError('Usuário não encontrado. O convite pode ter sido cancelado.', 404);
      }

      // Atualizar nome completo em admin_users
      await execute(
        `UPDATE admin_users 
         SET full_name = ?
         WHERE user_id = ?`,
        [fullName, user.id]
      );

      // Marcar convite como usado apenas se ainda não foi usado
      if (!invite.is_used) {
        await execute(
          `UPDATE admin_invites 
           SET is_used = TRUE, accepted_at = NOW(), accepted_by = ?
           WHERE id = ?`,
          [user.id, invite.id]
        );
      }

      res.status(200).json(
        createSuccessResponse(
          { email: invite.email },
          'Nome atualizado com sucesso. Faça login com suas credenciais.'
        )
      );
    } catch (error) {
      next(error);
    }
  }
}

