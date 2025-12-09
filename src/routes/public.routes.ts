import { Router } from 'express';
import { PublicJobsController } from '../controllers/public/jobs.controller';
import { PublicCandidatesController } from '../controllers/public/candidates.controller';
import { PublicNewsController } from '../controllers/public/news.controller';
import { PublicSpontaneousController } from '../controllers/public/spontaneous.controller';

const router = Router();

/**
 * Rotas públicas - não requerem autenticação
 */

/**
 * GET /public/jobs
 * Listar vagas públicas disponíveis
 */
router.get('/jobs', PublicJobsController.listJobs);

/**
 * GET /public/jobs/:id
 * Obter detalhes de uma vaga pública
 */
router.get('/jobs/:id', PublicJobsController.getJob);

/**
 * GET /public/candidates
 * Listar candidatos públicos (sem dados sensíveis)
 */
router.get('/candidates', PublicCandidatesController.listCandidates);

/**
 * GET /public/news
 * Listar notícias publicadas
 */
router.get('/news', PublicNewsController.listNews);

/**
 * GET /public/news/:slug
 * Obter notícia por slug
 */
router.get('/news/:slug', PublicNewsController.getNewsBySlug);

/**
 * POST /public/spontaneous
 * Criar candidatura espontânea
 */
router.post('/spontaneous', PublicSpontaneousController.createSpontaneousApplication);

export default router;

