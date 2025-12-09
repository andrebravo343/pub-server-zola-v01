import { Router } from 'express';
import { authenticate, requireUserType } from '../middlewares/auth';
import { TalentNotificationsController } from '../controllers/talent/notifications.controller';
import { TalentDashboardController } from '../controllers/talent/dashboard.controller';
import { TalentJobsController } from '../controllers/talent/jobs.controller';
import { TalentApplicationsController } from '../controllers/talent/applications.controller';
import { TalentCoursesController } from '../controllers/talent/courses.controller';
import { TalentCertificatesController } from '../controllers/talent/certificates.controller';
import { TalentAgendaController } from '../controllers/talent/agenda.controller';
import { TalentSettingsController } from '../controllers/talent/settings.controller';

const router = Router();

// Todas as rotas de talent requerem autenticação
router.use(authenticate);
router.use(requireUserType('talent'));

/**
 * Dashboard
 */
router.get('/dashboard/stats', TalentDashboardController.getStats);

/**
 * Vagas
 */
router.get('/jobs', TalentJobsController.listJobs);
router.get('/jobs/:id', TalentJobsController.getJob);
router.post('/jobs/:id/save', TalentJobsController.saveJob);
router.delete('/jobs/:id/save', TalentJobsController.unsaveJob);

/**
 * Candidaturas
 */
router.get('/applications', TalentApplicationsController.listApplications);
router.get('/applications/:id', TalentApplicationsController.getApplication);
router.post('/applications', TalentApplicationsController.createApplication);
router.delete('/applications/:id', TalentApplicationsController.cancelApplication);

/**
 * Cursos
 */
router.get('/courses', TalentCoursesController.listCourses);
router.get('/courses/stats', TalentCoursesController.getStats);

/**
 * Certificados
 */
router.get('/certificates', TalentCertificatesController.listCertificates);

/**
 * Agenda
 */
router.get('/agenda/events', TalentAgendaController.listEvents);

/**
 * Notificações
 */
router.get('/notifications', TalentNotificationsController.listNotifications);
router.get('/notifications/unread-count', TalentNotificationsController.getUnreadCount);
router.put('/notifications/:id/read', TalentNotificationsController.markAsRead);
router.put('/notifications/read-all', TalentNotificationsController.markAllAsRead);
router.delete('/notifications/:id', TalentNotificationsController.deleteNotification);

/**
 * Configurações
 */
router.get('/settings', TalentSettingsController.getSettings);
router.put('/settings', TalentSettingsController.updateSettings);
router.put('/settings/password', TalentSettingsController.changePassword);

export default router;

