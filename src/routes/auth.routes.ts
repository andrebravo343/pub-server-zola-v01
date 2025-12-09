import { Router, Request, Response, NextFunction } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { ProfileController } from '../controllers/profile.controller';
import { authenticate } from '../middlewares/auth';
import { body } from 'express-validator';
import { validateRequest } from '../middlewares/validateRequest';

const router = Router();

/**
 * POST /auth/register
 * Registro com email e senha
 */
router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
    body('userType').isIn(['talent', 'company', 'admin']).withMessage('Tipo de usuário inválido'),
    validateRequest,
  ],
  AuthController.register
);

/**
 * POST /auth/login
 * Login com email e senha
 */
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('password').notEmpty().withMessage('Senha é obrigatória'),
    validateRequest,
  ],
  AuthController.login
);

/**
 * POST /auth/oauth/google
 * Login/Registro com Google OAuth
 */
router.post(
  '/oauth/google',
  [
    body('idToken').notEmpty().withMessage('ID Token do Google é obrigatório'),
    validateRequest,
  ],
  AuthController.googleOAuth
);

/**
 * POST /auth/oauth/linkedin
 * Login/Registro com LinkedIn OAuth
 */
router.post(
  '/oauth/linkedin',
  [
    body('code').notEmpty().withMessage('Código de autorização do LinkedIn é obrigatório'),
    validateRequest,
  ],
  AuthController.linkedinOAuth
);

/**
 * GET /auth/oauth/linkedin/url
 * Obter URL de autorização do LinkedIn
 * Aceita redirectUri opcional como query parameter para garantir correspondência exata
 */
router.get('/oauth/linkedin/url', (req, res, next) => {
  try {
    const { linkedinOAuthService } = require('../services/oauth/linkedin.service');
    const { createSuccessResponse, createErrorResponse } = require('../utils/response');
    
    if (!linkedinOAuthService.isConfigured()) {
      return res.status(500).json(
        createErrorResponse('LinkedIn OAuth não configurado. Configure LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET e LINKEDIN_REDIRECT_URI')
      );
    }
    
    // Aceitar redirectUri do query parameter (frontend pode passar)
    const redirectUriFromQuery = req.query.redirectUri as string | undefined;
    
    // Usar redirectUri do query se fornecido, senão usar o configurado
    const redirectUri = redirectUriFromQuery || linkedinOAuthService.getRedirectUri();
    
    // Gerar URL de autorização com o redirect URI correto
    const url = linkedinOAuthService.getAuthorizationUrl(undefined, redirectUri);
    
    return res.json(createSuccessResponse({ 
      url,
      redirectUri, // Retornar também para debug
    }));
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /auth/refresh
 * Renovar token usando refresh token
 */
router.post(
  '/refresh',
  [
    body('refreshToken').notEmpty().withMessage('Refresh token é obrigatório'),
    validateRequest,
  ],
  AuthController.refresh
);

/**
 * POST /auth/forgot-password
 * Solicitar recuperação de senha
 */
router.post(
  '/forgot-password',
  [
    body('email').isEmail().withMessage('Email inválido'),
    validateRequest,
  ],
  AuthController.forgotPassword
);

/**
 * POST /auth/reset-password
 * Resetar senha com token
 */
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Token é obrigatório'),
    body('newPassword').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
    validateRequest,
  ],
  AuthController.resetPassword
);

/**
 * POST /auth/logout
 * Logout (invalidar refresh token)
 */
router.post(
  '/logout',
  authenticate,
  AuthController.logout
);

/**
 * GET /auth/me
 * Obter perfil do usuário autenticado
 */
router.get(
  '/me',
  authenticate,
  ProfileController.getProfile
);

/**
 * PUT /auth/me
 * Atualizar perfil do usuário autenticado
 */
router.put(
  '/me',
  authenticate,
  [
    body('email').optional().isEmail().withMessage('Email inválido'),
    body('password').optional().isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
    validateRequest,
  ],
  ProfileController.updateProfile
);

/**
 * POST /auth/me/avatar
 * Upload de foto de perfil
 */
router.post(
  '/me/avatar',
  authenticate,
  ProfileController.uploadAvatar
);

/**
 * POST /auth/me/documents
 * Upload de documento (empresa ou talento)
 */
router.post(
  '/me/documents',
  authenticate,
  ProfileController.uploadDocument
);

/**
 * DELETE /auth/me
 * Deletar conta do usuário e todos os dados relacionados
 */
router.delete(
  '/me',
  authenticate,
  ProfileController.deleteAccount
);

/**
 * GET /auth/invite/:token
 * Validar token de convite
 */
router.get(
  '/invite/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    const { InviteController } = await import('../controllers/invite.controller');
    InviteController.validateInvite(req, res, next);
  }
);

/**
 * POST /auth/register-with-invite
 * Registrar novo admin usando token de convite
 */
router.post(
  '/register-with-invite',
  [
    body('token').notEmpty().withMessage('Token é obrigatório'),
    body('password').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
    body('fullName').notEmpty().withMessage('Nome completo é obrigatório'),
    validateRequest,
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    const { InviteController } = await import('../controllers/invite.controller');
    InviteController.registerWithInvite(req, res, next);
  }
);

export default router;

