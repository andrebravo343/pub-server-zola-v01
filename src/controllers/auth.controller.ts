import { Request, Response, NextFunction } from 'express';
import { AuthService, OAuthProfile } from '../services/auth.service';
import { createSuccessResponse } from '../utils/response';
import { CustomError } from '../middlewares/errorHandler';
import { googleOAuthService } from '../services/oauth/google.service';
import { linkedinOAuthService } from '../services/oauth/linkedin.service';

export class AuthController {
  /**
   * POST /auth/register
   * Registro com email e senha
   */
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, userType } = req.body;

      // Validações básicas
      if (!email || !password) {
        throw new CustomError('Email e senha são obrigatórios', 400);
      }

      if (!['talent', 'company', 'admin'].includes(userType)) {
        throw new CustomError('Tipo de usuário inválido', 400);
      }

      if (password.length < 8) {
        throw new CustomError('Senha deve ter no mínimo 8 caracteres', 400);
      }

      const result = await AuthService.register({
        email: email.toLowerCase().trim(),
        password,
        userType,
      });

      res.status(201).json(
        createSuccessResponse(result, 'Registro realizado com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/login
   * Login com email e senha
   * @param expectedUserType - Tipo de usuário esperado pelo app (admin, company, talent)
   */
  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, expectedUserType } = req.body;

      if (!email || !password) {
        throw new CustomError('Email e senha são obrigatórios', 400);
      }

      // Validar expectedUserType se fornecido
      if (expectedUserType && !['admin', 'company', 'talent'].includes(expectedUserType)) {
        throw new CustomError('Tipo de usuário esperado inválido', 400);
      }

      const result = await AuthService.login(
        email.toLowerCase().trim(),
        password,
        expectedUserType
      );

      res.status(200).json(
        createSuccessResponse(result, 'Login realizado com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/oauth/google
   * Login/Registro com Google OAuth
   * @param expectedUserType - Tipo de usuário esperado pelo app (admin, company, talent)
   */
  static async googleOAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { idToken, userType, expectedUserType } = req.body;

      if (!idToken) {
        throw new CustomError('ID Token do Google é obrigatório', 400);
      }

      // Validar expectedUserType se fornecido
      if (expectedUserType && !['admin', 'company', 'talent'].includes(expectedUserType)) {
        throw new CustomError('Tipo de usuário esperado inválido', 400);
      }

      // Verificar token do Google e obter perfil
      const googleProfile = await googleOAuthService.verifyToken(idToken);

      const oauthProfile: OAuthProfile = {
        id: googleProfile.sub,
        email: googleProfile.email,
        name: googleProfile.name,
        picture: googleProfile.picture,
        provider: 'google',
      };

      const result = await AuthService.oauthLogin(
        oauthProfile,
        userType || 'talent',
        expectedUserType
      );

      res.status(200).json(
        createSuccessResponse(result, 'Login com Google realizado com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  // Cache para prevenir requisições simultâneas com o mesmo código
  private static linkedinProcessingCodes = new Set<string>();

  /**
   * POST /auth/oauth/linkedin
   * Login/Registro com LinkedIn OAuth
   * @param expectedUserType - Tipo de usuário esperado pelo app (admin, company, talent)
   */
  static async linkedinOAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    let code: string | undefined;
    
    try {
      const { code: codeFromBody, userType, redirectUri, expectedUserType } = req.body;
      code = codeFromBody;

      if (!code) {
        throw new CustomError('Código de autorização do LinkedIn é obrigatório', 400);
      }

      // Validar expectedUserType se fornecido
      if (expectedUserType && !['admin', 'company', 'talent'].includes(expectedUserType)) {
        throw new CustomError('Tipo de usuário esperado inválido', 400);
      }

      // Prevenir processamento simultâneo do mesmo código
      if (AuthController.linkedinProcessingCodes.has(code)) {
        throw new CustomError('Código de autorização já está sendo processado. Aguarde...', 429);
      }

      // Marcar código como sendo processado
      AuthController.linkedinProcessingCodes.add(code);

      try {
        // Trocar código por access token e obter perfil
        // Passar redirectUri se fornecido (para garantir correspondência exata)
        const linkedinProfile = await linkedinOAuthService.getUserProfile(code, redirectUri);

        const oauthProfile: OAuthProfile = {
          id: linkedinProfile.id,
          email: linkedinProfile.email,
          name: `${linkedinProfile.firstName} ${linkedinProfile.lastName}`,
          picture: linkedinProfile.profilePicture?.displayImage,
          provider: 'linkedin',
        };

        const result = await AuthService.oauthLogin(
          oauthProfile,
          userType || 'talent',
          expectedUserType
        );

        res.status(200).json(
          createSuccessResponse(result, 'Login com LinkedIn realizado com sucesso')
        );
      } finally {
        // Remover código do cache após processamento (com delay para prevenir race conditions)
        if (code) {
          setTimeout(() => {
            AuthController.linkedinProcessingCodes.delete(code!);
          }, 5000); // 5 segundos
        }
      }
    } catch (error) {
      // Remover código do cache em caso de erro
      if (code) {
        AuthController.linkedinProcessingCodes.delete(code);
      }
      next(error);
    }
  }

  /**
   * POST /auth/refresh
   * Renovar token usando refresh token
   */
  static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new CustomError('Refresh token é obrigatório', 400);
      }

      const result = await AuthService.refreshToken(refreshToken);

      res.status(200).json(
        createSuccessResponse(result, 'Token renovado com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/forgot-password
   * Solicitar recuperação de senha
   */
  static async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        throw new CustomError('Email é obrigatório', 400);
      }

      await AuthService.requestPasswordReset(email.toLowerCase().trim());

      // Sempre retornar sucesso (por segurança)
      res.status(200).json(
        createSuccessResponse(
          null,
          'Se o email existir, você receberá instruções para redefinir sua senha'
        )
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/reset-password
   * Resetar senha com token
   */
  static async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw new CustomError('Token e nova senha são obrigatórios', 400);
      }

      if (newPassword.length < 8) {
        throw new CustomError('Senha deve ter no mínimo 8 caracteres', 400);
      }

      await AuthService.resetPassword(token, newPassword);

      res.status(200).json(
        createSuccessResponse(null, 'Senha redefinida com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/logout
   * Logout (invalidar refresh token)
   */
  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const userId = req.user?.userId;

      if (refreshToken && userId) {
        // Invalidar refresh token
        const { execute } = await import('../utils/database');
        await execute(
          'UPDATE refresh_tokens SET expires_at = NOW() WHERE user_id = ? AND token = ?',
          [userId, refreshToken]
        );
      }

      res.status(200).json(
        createSuccessResponse(null, 'Logout realizado com sucesso')
      );
    } catch (error) {
      next(error);
    }
  }
}

