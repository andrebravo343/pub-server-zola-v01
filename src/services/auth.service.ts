import { UserModel, CreateUserData } from '../models/User.model';
import { generateToken, generateRefreshToken, JWTPayload } from '../utils/jwt';
import { CustomError } from '../middlewares/errorHandler';
import { generateUUID } from '../utils/uuid';
import { queryOne, execute } from '../utils/database';
import { emailService } from './email.service';

export interface AuthResult {
  user: {
    id: string;
    email: string;
    userType: 'talent' | 'company' | 'admin';
  };
  token: string;
  refreshToken: string;
}

export interface OAuthProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: 'google' | 'linkedin';
}

export class AuthService {
  /**
   * Registro com email e senha
   */
  static async register(data: CreateUserData): Promise<AuthResult> {
    // Verificar se email já existe
    const emailExists = await UserModel.emailExists(data.email);
    if (emailExists) {
      throw new CustomError('Email já está em uso', 400);
    }

    // Criar usuário
    const user = await UserModel.create(data);

    // Gerar tokens
    const payload: JWTPayload = {
      userId: user.id,
      userType: user.userType,
      email: user.email,
    };

    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Salvar refresh token (se necessário)
    await this.saveRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
      },
      token,
      refreshToken,
    };
  }

  /**
   * Login com email e senha
   * @param expectedUserType - Tipo de usuário esperado pelo app (admin, company, talent). Se fornecido, valida que o usuário é do tipo correto.
   */
  static async login(email: string, password: string, expectedUserType?: 'admin' | 'company' | 'talent'): Promise<AuthResult> {
    // Buscar usuário
    const user = await UserModel.findByEmail(email);
    if (!user) {
      throw new CustomError('Email ou senha incorretos', 401);
    }

    // Verificar se está ativo
    if (!user.isActive) {
      throw new CustomError('Conta desativada', 403);
    }

    // Validar tipo de usuário se esperado
    if (expectedUserType && user.userType !== expectedUserType) {
      throw new CustomError(`Este login é apenas para ${expectedUserType === 'admin' ? 'administradores' : expectedUserType === 'company' ? 'empresas' : 'candidatos'}. Por favor, use o app correto.`, 403);
    }

    // Verificar senha
    const passwordValid = await UserModel.verifyPassword(user, password);
    if (!passwordValid) {
      throw new CustomError('Email ou senha incorretos', 401);
    }

    // Se for admin, verificar se há convite pendente e marcar como usado
    if (user.userType === 'admin') {
      const pendingInvite = await queryOne<any>(
        `SELECT * FROM admin_invites 
         WHERE email = ? AND is_used = FALSE AND expires_at > NOW()`,
        [email.toLowerCase().trim()]
      );

      if (pendingInvite) {
        // Marcar convite como usado no primeiro login
        await execute(
          `UPDATE admin_invites 
           SET is_used = TRUE, accepted_at = NOW(), accepted_by = ?
           WHERE id = ?`,
          [user.id, pendingInvite.id]
        );
      }
    }

    // Atualizar último login
    await UserModel.updateLastLogin(user.id);

    // Gerar tokens
    const payload: JWTPayload = {
      userId: user.id,
      userType: user.userType,
      email: user.email,
    };

    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Salvar refresh token
    await this.saveRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
      },
      token,
      refreshToken,
    };
  }

  /**
   * OAuth - Google ou LinkedIn
   * @param expectedUserType - Tipo de usuário esperado pelo app (admin, company, talent). Se fornecido, valida que o usuário é do tipo correto.
   */
  static async oauthLogin(profile: OAuthProfile, userType: 'talent' | 'company' | 'admin' = 'talent', expectedUserType?: 'admin' | 'company' | 'talent'): Promise<AuthResult> {
    // Verificar se já existe usuário com este email
    let user = await UserModel.findByEmail(profile.email);

    if (!user) {
      // Criar novo usuário via OAuth
      user = await UserModel.create({
        email: profile.email,
        password: generateUUID(), // Senha aleatória (não será usada)
        userType,
      });

      // Marcar email como verificado (vem de OAuth)
      await UserModel.update(user.id, { emailVerified: true });
    }

    // Verificar se está ativo
    if (!user.isActive) {
      throw new CustomError('Conta desativada', 403);
    }

    // Validar tipo de usuário se esperado
    if (expectedUserType && user.userType !== expectedUserType) {
      throw new CustomError(`Este login é apenas para ${expectedUserType === 'admin' ? 'administradores' : expectedUserType === 'company' ? 'empresas' : 'candidatos'}. Por favor, use o app correto.`, 403);
    }

    // Salvar/atualizar token OAuth
    await this.saveOAuthToken(user.id, profile.provider, profile.id, profile);

    // Atualizar último login
    await UserModel.updateLastLogin(user.id);

    // Gerar tokens
    const payload: JWTPayload = {
      userId: user.id,
      userType: user.userType,
      email: user.email,
    };

    const token = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Salvar refresh token
    await this.saveRefreshToken(user.id, refreshToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
      },
      token,
      refreshToken,
    };
  }

  /**
   * Refresh token
   */
  static async refreshToken(refreshToken: string): Promise<AuthResult> {
    const { verifyRefreshToken } = await import('../utils/jwt');
    
    try {
      const payload = verifyRefreshToken(refreshToken);

      // Verificar se refresh token existe no banco
      const tokenExists = await this.verifyRefreshToken(payload.userId, refreshToken);
      if (!tokenExists) {
        throw new CustomError('Refresh token inválido', 401);
      }

      // Buscar usuário
      const user = await UserModel.findById(payload.userId);
      if (!user || !user.isActive) {
        throw new CustomError('Usuário não encontrado ou inativo', 401);
      }

      // Gerar novos tokens
      const newPayload: JWTPayload = {
        userId: user.id,
        userType: user.userType,
        email: user.email,
      };

      const newToken = generateToken(newPayload);
      const newRefreshToken = generateRefreshToken(newPayload);

      // Atualizar refresh token no banco
      await this.saveRefreshToken(user.id, newRefreshToken);

      return {
        user: {
          id: user.id,
          email: user.email,
          userType: user.userType,
        },
        token: newToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new CustomError('Refresh token inválido ou expirado', 401);
    }
  }

  /**
   * Solicitar recuperação de senha
   */
  static async requestPasswordReset(email: string): Promise<void> {
    const user = await UserModel.findByEmail(email);
    
    // Por segurança, não revelar se o email existe ou não
    if (!user) {
      return;
    }

    // Gerar token de reset
    const resetToken = generateUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Válido por 24 horas

    // Salvar token no banco
    const sql = `
      INSERT INTO password_reset_tokens (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `;

    await execute(sql, [
      generateUUID(),
      user.id,
      resetToken,
      expiresAt,
      new Date(),
    ]);

    // Enviar email com link de reset
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${frontendUrl}/admin/reset-password?token=${resetToken}`;
      await emailService.sendPasswordResetEmail(user.email, resetUrl);
    } catch (emailError: any) {
      console.error('❌ Erro ao enviar email de recuperação de senha:', emailError);
      // Continuar mesmo se o email falhar (por segurança, não revelar se o email existe)
    }
  }

  /**
   * Resetar senha com token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    // Buscar token válido
    const sql = `
      SELECT user_id as userId, expires_at as expiresAt
      FROM password_reset_tokens
      WHERE token = ? AND used = false AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const tokenData = await queryOne<{ userId: string; expiresAt: Date }>(sql, [token]);

    if (!tokenData) {
      throw new CustomError('Token inválido ou expirado', 400);
    }

    // Atualizar senha
    await UserModel.update(tokenData.userId, { password: newPassword });

    // Marcar token como usado
    await execute(
      'UPDATE password_reset_tokens SET used = true WHERE token = ?',
      [token]
    );
  }

  /**
   * Salvar refresh token no banco
   */
  private static async saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const sql = `
      INSERT INTO refresh_tokens (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY), NOW())
      ON DUPLICATE KEY UPDATE token = ?, expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY), updated_at = NOW()
    `;

    await execute(sql, [generateUUID(), userId, refreshToken, refreshToken]);
  }

  /**
   * Verificar refresh token
   */
  private static async verifyRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
    const sql = `
      SELECT COUNT(*) as count
      FROM refresh_tokens
      WHERE user_id = ? AND token = ? AND expires_at > NOW()
    `;

    const result = await queryOne<{ count: number }>(sql, [userId, refreshToken]);
    return (result?.count || 0) > 0;
  }

  /**
   * Salvar token OAuth
   */
  private static async saveOAuthToken(
    userId: string,
    provider: 'google' | 'linkedin',
    providerUserId: string,
    profileData: OAuthProfile
  ): Promise<void> {
    const sql = `
      INSERT INTO oauth_tokens (
        id, user_id, provider, provider_user_id, profile_data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        profile_data = ?,
        updated_at = NOW()
    `;

    await execute(sql, [
      generateUUID(),
      userId,
      provider,
      providerUserId,
      JSON.stringify(profileData),
      JSON.stringify(profileData),
    ]);
  }
}

