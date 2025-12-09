import { Router } from 'express';
import { authenticate, requireUserType } from '../middlewares/auth';
import { InviteController } from '../controllers/invite.controller';
import { DashboardController } from '../controllers/dashboard.controller';
import { ProfilesController } from '../controllers/profiles.controller';
import { JobsController } from '../controllers/jobs.controller';
import { BadgesController } from '../controllers/badges.controller';
import { CoursesController } from '../controllers/courses.controller';
import { NewsController } from '../controllers/news.controller';
import { ReportsController } from '../controllers/reports.controller';
import { NotificationsController } from '../controllers/notifications.controller';
import { AdminApplicationsController } from '../controllers/admin/applications.controller';
import { AdminSpontaneousController } from '../controllers/admin/spontaneous.controller';
import { body } from 'express-validator';
import { validateRequest } from '../middlewares/validateRequest';

const router = Router();

// Todas as rotas de admin requerem autenticação
router.use(authenticate);
router.use(requireUserType('admin'));

/**
 * POST /admin/invites
 * Criar convite para novo administrador (apenas super_admin)
 */
router.post(
  '/invites',
  [
    body('email').isEmail().withMessage('Email inválido'),
    body('role').isIn(['super_admin', 'admin', 'moderator', 'finance', 'hr']).withMessage('Função inválida'),
    body('permissions').optional().isArray().withMessage('Permissões devem ser um array'),
    validateRequest,
  ],
  InviteController.createInvite
);

/**
 * GET /admin/invites
 * Listar todos os convites (apenas super_admin)
 */
router.get(
  '/invites',
  InviteController.listInvites
);

/**
 * DELETE /admin/invites/:id
 * Cancelar convite (apenas super_admin)
 */
router.delete(
  '/invites/:id',
  InviteController.cancelInvite
);

/**
 * GET /admin/dashboard/stats
 * Obter estatísticas do dashboard
 */
router.get(
  '/dashboard/stats',
  DashboardController.getStats
);

/**
 * GET /admin/profiles
 * Listar perfis com filtros
 */
router.get(
  '/profiles',
  ProfilesController.listProfiles
);

/**
 * GET /admin/profiles/search/talents
 * Buscar talentos por email (autocomplete)
 */
router.get(
  '/profiles/search/talents',
  ProfilesController.searchTalentsByEmail
);

/**
 * GET /admin/profiles/:id
 * Obter detalhes de um perfil
 */
router.get(
  '/profiles/:id',
  ProfilesController.getProfileDetails
);

/**
 * PUT /admin/profiles/:id/status
 * Atualizar status do perfil
 */
router.put(
  '/profiles/:id/status',
  [
    body('status').isIn(['active', 'suspended', 'blocked']).withMessage('Status inválido'),
    validateRequest,
  ],
  ProfilesController.updateProfileStatus
);

/**
 * PUT /admin/profiles/:id/approval
 * Aprovar/rejeitar empresa
 */
router.put(
  '/profiles/:id/approval',
  [
    body('approvalStatus').isIn(['approved', 'rejected', 'pending']).withMessage('Status de aprovação inválido'),
    validateRequest,
  ],
  ProfilesController.updateCompanyApproval
);

/**
 * PUT /admin/profiles/:id/verify
 * Verificar perfil (apenas talentos)
 */
router.put(
  '/profiles/:id/verify',
  ProfilesController.verifyProfile
);

/**
 * GET /admin/jobs/internal
 * Listar vagas internas
 */
router.get(
  '/jobs/internal',
  JobsController.listInternalJobs
);

/**
 * POST /admin/jobs/internal
 * Criar vaga interna
 */
router.post(
  '/jobs/internal',
  [
    body('title').notEmpty().withMessage('Título é obrigatório'),
    body('description').notEmpty().withMessage('Descrição é obrigatória'),
    body('requirements').notEmpty().withMessage('Requisitos são obrigatórios'),
    validateRequest,
  ],
  JobsController.createInternalJob
);

/**
 * PUT /admin/jobs/internal/:id
 * Atualizar vaga interna
 */
router.put(
  '/jobs/internal/:id',
  JobsController.updateInternalJob
);

/**
 * DELETE /admin/jobs/internal/:id
 * Deletar vaga interna
 */
router.delete(
  '/jobs/internal/:id',
  JobsController.deleteInternalJob
);

/**
 * GET /admin/badges
 * Listar selos AMANGOLA
 */
router.get(
  '/badges',
  BadgesController.listBadges
);

/**
 * POST /admin/badges
 * Emitir selo AMANGOLA
 */
router.post(
  '/badges',
  [
    body('talentProfileId').notEmpty().withMessage('ID do perfil de talento é obrigatório'),
    validateRequest,
  ],
  BadgesController.issueBadge
);

/**
 * PUT /admin/badges/:id/revoke
 * Revogar selo AMANGOLA
 */
router.put(
  '/badges/:id/revoke',
  [
    body('reason').notEmpty().withMessage('Motivo da revogação é obrigatório'),
    validateRequest,
  ],
  BadgesController.revokeBadge
);

/**
 * GET /admin/badges/:id/history
 * Histórico do selo
 */
router.get(
  '/badges/:id/history',
  BadgesController.getBadgeHistory
);

/**
 * GET /admin/courses
 * Listar cursos/e-books
 */
router.get(
  '/courses',
  CoursesController.listCourses
);

/**
 * POST /admin/courses
 * Criar curso/e-book
 */
router.post(
  '/courses',
  [
    body('title').notEmpty().withMessage('Título é obrigatório'),
    body('description').notEmpty().withMessage('Descrição é obrigatória'),
    validateRequest,
  ],
  CoursesController.createCourse
);

/**
 * PUT /admin/courses/:id
 * Atualizar curso/e-book
 */
router.put(
  '/courses/:id',
  CoursesController.updateCourse
);

/**
 * DELETE /admin/courses/:id
 * Deletar curso/e-book
 */
router.delete(
  '/courses/:id',
  CoursesController.deleteCourse
);

/**
 * GET /admin/news
 * Listar notícias
 */
router.get(
  '/news',
  NewsController.listNews
);

/**
 * POST /admin/news
 * Criar notícia
 */
router.post(
  '/news',
  [
    body('title').notEmpty().withMessage('Título é obrigatório'),
    body('content').notEmpty().withMessage('Conteúdo é obrigatório'),
    validateRequest,
  ],
  NewsController.createNews
);

/**
 * PUT /admin/news/:id
 * Atualizar notícia
 */
router.put(
  '/news/:id',
  NewsController.updateNews
);

/**
 * DELETE /admin/news/:id
 * Deletar notícia
 */
router.delete(
  '/news/:id',
  NewsController.deleteNews
);

/**
 * GET /admin/reports/financial
 * Relatório financeiro
 */
router.get(
  '/reports/financial',
  ReportsController.getFinancialReport
);

/**
 * GET /admin/reports/operational
 * Relatório operacional
 */
router.get(
  '/reports/operational',
  ReportsController.getOperationalReport
);

/**
 * GET /admin/notifications
 * Listar notificações do usuário
 */
router.get(
  '/notifications',
  NotificationsController.listNotifications
);

/**
 * GET /admin/notifications/unread-count
 * Obter contagem de notificações não lidas
 */
router.get(
  '/notifications/unread-count',
  NotificationsController.getUnreadCount
);

/**
 * POST /admin/notifications
 * Criar notificação (individual ou em massa)
 * Se audience for especificado ('all', 'talents', 'companies'), cria notificações em massa
 * Caso contrário, requer targetUserId para criar notificação individual
 */
router.post(
  '/notifications',
  [
    body('title').notEmpty().withMessage('Título é obrigatório'),
    body('message').notEmpty().withMessage('Mensagem é obrigatória'),
    body('audience').optional().isIn(['all', 'talents', 'companies']).withMessage('Audience inválido'),
    body('targetUserId').optional().notEmpty().withMessage('ID do usuário alvo é obrigatório quando audience não é especificado'),
    body('notificationType').optional().notEmpty().withMessage('Tipo de notificação é obrigatório'),
    validateRequest,
  ],
  NotificationsController.createNotification
);

/**
 * PUT /admin/notifications/:id/read
 * Marcar notificação como lida
 */
router.put(
  '/notifications/:id/read',
  NotificationsController.markAsRead
);

/**
 * PUT /admin/notifications/read-all
 * Marcar todas as notificações como lidas
 */
router.put(
  '/notifications/read-all',
  NotificationsController.markAllAsRead
);

/**
 * DELETE /admin/notifications/:id
 * Deletar notificação
 */
router.delete(
  '/notifications/:id',
  NotificationsController.deleteNotification
);

/**
 * GET /admin/notifications/all
 * Listar todas as notificações criadas (histórico para admin)
 */
router.get(
  '/notifications/all',
  NotificationsController.listAllNotifications
);

/**
 * GET /admin/applications
 * Listar todas as candidaturas (admin pode ver todas)
 */
router.get(
  '/applications',
  AdminApplicationsController.listApplications
);

/**
 * GET /admin/applications/stats
 * Obter estatísticas de candidaturas
 */
router.get(
  '/applications/stats',
  AdminApplicationsController.getStats
);

/**
 * GET /admin/jobs/:jobId/applications
 * Listar candidaturas de uma vaga específica
 */
router.get(
  '/jobs/:jobId/applications',
  AdminApplicationsController.getJobApplications
);

/**
 * GET /admin/spontaneous
 * Listar candidaturas espontâneas
 */
router.get(
  '/spontaneous',
  AdminSpontaneousController.listSpontaneous
);

/**
 * GET /admin/spontaneous/:id
 * Obter detalhes de uma candidatura espontânea
 */
router.get(
  '/spontaneous/:id',
  AdminSpontaneousController.getSpontaneous
);

/**
 * PUT /admin/spontaneous/:id
 * Atualizar candidatura espontânea
 */
router.put(
  '/spontaneous/:id',
  AdminSpontaneousController.updateSpontaneous
);

/**
 * DELETE /admin/spontaneous/:id
 * Deletar candidatura espontânea
 */
router.delete(
  '/spontaneous/:id',
  AdminSpontaneousController.deleteSpontaneous
);

export default router;

