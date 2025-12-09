import { Router } from 'express';
import { authenticate, requireUserType } from '../middlewares/auth';
import { CompanyJobsController } from '../controllers/company/jobs.controller';
import { CompanyApplicationsController } from '../controllers/company/applications.controller';
import { CompanyDashboardController } from '../controllers/company/dashboard.controller';
import { CompanyKanbanController } from '../controllers/company/kanban.controller';
import { CompanyCandidatesController } from '../controllers/company/candidates.controller';
import { CompanyReportsController } from '../controllers/company/reports.controller';
import { CompanySubscriptionsController } from '../controllers/company/subscriptions.controller';
import { CompanyNotificationsController } from '../controllers/company/notifications.controller';
import { body } from 'express-validator';
import { validateRequest } from '../middlewares/validateRequest';

const router = Router();

// Todas as rotas de empresa requerem autenticação e tipo 'company'
router.use(authenticate);
router.use(requireUserType('company'));

/**
 * GET /company/dashboard/stats
 * Obter estatísticas do dashboard
 */
router.get('/dashboard/stats', CompanyDashboardController.getStats);

/**
 * GET /company/jobs
 * Listar vagas da empresa
 */
router.get('/jobs', CompanyJobsController.listJobs);

/**
 * GET /company/jobs/:id
 * Obter detalhes de uma vaga
 */
router.get('/jobs/:id', CompanyJobsController.getJob);

/**
 * POST /company/jobs
 * Criar nova vaga
 */
router.post(
  '/jobs',
  [
    body('title').notEmpty().withMessage('Título é obrigatório'),
    body('description').notEmpty().withMessage('Descrição é obrigatória'),
    body('requirements').notEmpty().withMessage('Requisitos são obrigatórios'),
    body('locationType').isIn(['onsite', 'remote', 'hybrid']).withMessage('Tipo de localização inválido'),
    body('jobType').isIn(['full_time', 'part_time', 'temporary', 'contract', 'internship']).withMessage('Tipo de trabalho inválido'),
    body('status').optional().isIn(['draft', 'active', 'paused', 'closed', 'filled']).withMessage('Status inválido'),
    validateRequest,
  ],
  CompanyJobsController.createJob
);

/**
 * PUT /company/jobs/:id
 * Atualizar vaga
 */
router.put('/jobs/:id', CompanyJobsController.updateJob);

/**
 * DELETE /company/jobs/:id
 * Deletar vaga
 */
router.delete('/jobs/:id', CompanyJobsController.deleteJob);

/**
 * PUT /company/jobs/:id/status
 * Atualizar apenas o status da vaga
 */
router.put(
  '/jobs/:id/status',
  [
    body('status').isIn(['draft', 'active', 'paused', 'closed', 'filled']).withMessage('Status inválido'),
    validateRequest,
  ],
  CompanyJobsController.updateJobStatus
);

/**
 * GET /company/jobs/:id/stats
 * Obter estatísticas de uma vaga
 */
router.get('/jobs/:id/stats', CompanyJobsController.getJobStats);

/**
 * GET /company/applications
 * Listar candidaturas
 */
router.get('/applications', CompanyApplicationsController.listApplications);

/**
 * GET /company/applications/:id
 * Obter detalhes de uma candidatura
 */
router.get('/applications/:id', CompanyApplicationsController.getApplication);

/**
 * PUT /company/applications/:id/status
 * Atualizar status de uma candidatura
 */
router.put(
  '/applications/:id/status',
  [
    body('status').isIn(['pending', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']).withMessage('Status inválido'),
    validateRequest,
  ],
  CompanyApplicationsController.updateApplicationStatus
);

/**
 * POST /company/applications/:id/feedback
 * Adicionar feedback a uma candidatura
 */
router.post(
  '/applications/:id/feedback',
  [
    body('feedback').notEmpty().withMessage('Feedback é obrigatório'),
    validateRequest,
  ],
  CompanyApplicationsController.addFeedback
);

/**
 * GET /company/applications/:id/history
 * Obter histórico de mudanças de status
 */
router.get('/applications/:id/history', CompanyApplicationsController.getApplicationHistory);

/**
 * GET /company/jobs/:jobId/applications
 * Listar candidaturas de uma vaga específica
 */
router.get('/jobs/:jobId/applications', CompanyApplicationsController.getJobApplications);

/**
 * GET /company/kanban
 * Obter dados do Kanban
 */
router.get('/kanban', CompanyKanbanController.getKanbanData);

/**
 * PUT /company/kanban/move
 * Mover candidatura entre estágios
 */
router.put(
  '/kanban/move',
  [
    body('applicationId').notEmpty().withMessage('ID da candidatura é obrigatório'),
    body('newStatus').isIn(['pending', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn']).withMessage('Status inválido'),
    validateRequest,
  ],
  CompanyKanbanController.moveApplication
);

/**
 * POST /company/kanban/:applicationId/notes
 * Adicionar notas a uma candidatura
 */
router.post(
  '/kanban/:applicationId/notes',
  [
    body('notes').notEmpty().withMessage('Notas são obrigatórias'),
    validateRequest,
  ],
  CompanyKanbanController.addNote
);

/**
 * GET /company/kanban/stats
 * Obter estatísticas do Kanban
 */
router.get('/kanban/stats', CompanyKanbanController.getKanbanStats);

/**
 * GET /company/candidates
 * Buscar candidatos com filtros avançados
 */
router.get('/candidates', CompanyCandidatesController.searchCandidates);

/**
 * GET /company/candidates/:id
 * Obter perfil completo de um candidato
 */
router.get('/candidates/:id', CompanyCandidatesController.getCandidateProfile);

/**
 * POST /company/candidates/:id/contact
 * Enviar mensagem/convite para candidato
 */
router.post(
  '/candidates/:id/contact',
  [
    body('message').notEmpty().withMessage('Mensagem é obrigatória'),
    validateRequest,
  ],
  CompanyCandidatesController.contactCandidate
);

/**
 * GET /company/reports
 * Obter relatórios e métricas
 */
router.get('/reports', CompanyReportsController.getReports);

/**
 * GET /company/subscriptions
 * Obter informações sobre subscrições
 */
router.get('/subscriptions', CompanySubscriptionsController.getSubscriptions);

/**
 * POST /company/subscriptions
 * Criar/atualizar subscrição
 */
router.post(
  '/subscriptions',
  [
    body('planId').notEmpty().withMessage('ID do plano é obrigatório'),
    validateRequest,
  ],
  CompanySubscriptionsController.createSubscription
);

/**
 * PUT /company/subscriptions/:id/cancel
 * Cancelar subscrição
 */
router.put('/subscriptions/:id/cancel', CompanySubscriptionsController.cancelSubscription);

/**
 * GET /company/notifications
 * Listar notificações da empresa
 */
router.get('/notifications', CompanyNotificationsController.listNotifications);

/**
 * GET /company/notifications/unread-count
 * Obter contagem de notificações não lidas
 */
router.get('/notifications/unread-count', CompanyNotificationsController.getUnreadCount);

/**
 * PUT /company/notifications/:id/read
 * Marcar notificação como lida
 */
router.put('/notifications/:id/read', CompanyNotificationsController.markAsRead);

/**
 * PUT /company/notifications/read-all
 * Marcar todas as notificações como lidas
 */
router.put('/notifications/read-all', CompanyNotificationsController.markAllAsRead);

/**
 * DELETE /company/notifications/:id
 * Deletar notificação
 */
router.delete('/notifications/:id', CompanyNotificationsController.deleteNotification);

export default router;

