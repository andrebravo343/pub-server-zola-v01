import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middlewares/errorHandler';
import { createSuccessResponse } from '../utils/response';
import { queryOne } from '../utils/database';

export class DashboardController {
  /**
   * GET /admin/dashboard/stats
   * Obter estatísticas do dashboard
   */
  static async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Data atual e do mês anterior
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - 7);

      // Total de candidatos
      const totalCandidates = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM users WHERE user_type = 'talent' AND deleted_at IS NULL`
      );

      // Total de empresas
      const totalCompanies = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM users WHERE user_type = 'company' AND deleted_at IS NULL`
      );

      // Candidatos este mês
      const candidatesThisMonth = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM users 
         WHERE user_type = 'talent' 
         AND created_at >= ? 
         AND deleted_at IS NULL`,
        [startOfMonth]
      );

      // Empresas este mês
      const companiesThisMonth = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM users 
         WHERE user_type = 'company' 
         AND created_at >= ? 
         AND deleted_at IS NULL`,
        [startOfMonth]
      );

      // Vagas ativas (internas e públicas)
      const activeJobs = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM jobs WHERE status = 'active'`
      );

      // Selos ativos
      const activeBadges = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM certificates 
         WHERE certificate_type = 'zolangola_badge' 
         AND is_revoked = FALSE`
      );

      // Selos emitidos este mês
      const badgesThisMonth = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM certificates 
         WHERE certificate_type = 'zolangola_badge' 
         AND issued_at >= ? 
         AND is_revoked = FALSE`,
        [startOfMonth]
      );

      // Candidaturas recentes (últimos 7 dias)
      const applicationsThisWeek = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM applications 
         WHERE applied_at >= ?`,
        [startOfWeek]
      );

      // Receita mensal (do mês atual)
      const monthlyRevenue = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
         WHERE status = 'completed' 
         AND created_at >= ? 
         AND created_at < ?`,
        [startOfMonth, new Date(now.getFullYear(), now.getMonth() + 1, 1)]
      );

      // Receita do mês anterior
      const lastMonthRevenue = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
         WHERE status = 'completed' 
         AND created_at >= ? 
         AND created_at <= ?`,
        [startOfLastMonth, endOfLastMonth]
      );

      // Calcular mudança percentual
      const revenueChange =
        lastMonthRevenue?.total && lastMonthRevenue.total > 0
          ? ((monthlyRevenue?.total || 0) - lastMonthRevenue.total) / lastMonthRevenue.total * 100
          : 0;

      const stats = {
        totalCandidates: totalCandidates?.count || 0,
        totalCompanies: totalCompanies?.count || 0,
        activeJobs: activeJobs?.count || 0,
        activeBadges: activeBadges?.count || 0,
        recentApplications: applicationsThisWeek?.count || 0,
        monthlyRevenue: monthlyRevenue?.total || 0,
        candidatesThisMonth: candidatesThisMonth?.count || 0,
        companiesThisMonth: companiesThisMonth?.count || 0,
        badgesThisMonth: badgesThisMonth?.count || 0,
        applicationsThisWeek: applicationsThisWeek?.count || 0,
        revenueChange: Math.round(revenueChange * 100) / 100, // 2 casas decimais
      };

      res.status(200).json(createSuccessResponse(stats));
    } catch (error) {
      next(error);
    }
  }
}

