import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middlewares/errorHandler';
import { createSuccessResponse } from '../utils/response';
import { query, queryOne } from '../utils/database';

export class ReportsController {
  /**
   * GET /admin/reports/financial
   * Relatório financeiro
   */
  static async getFinancialReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        startDate,
        endDate,
        type = 'all', // 'all' | 'subscriptions' | 'courses' | 'badges'
      } = req.query;

      const whereConditions: string[] = ["p.status = 'completed'"];
      const params: any[] = [];

      if (startDate) {
        whereConditions.push('p.created_at >= ?');
        params.push(startDate);
      }

      if (endDate) {
        whereConditions.push('p.created_at <= ?');
        params.push(endDate);
      }

      if (type !== 'all') {
        whereConditions.push('p.payment_type = ?');
        params.push(type);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Total de receita
      const totalRevenue = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments p ${whereClause}`,
        params
      );

      // Receita por tipo
      const revenueByType = await query<any>(
        `SELECT 
          payment_type,
          COUNT(*) as count,
          COALESCE(SUM(amount), 0) as total
        FROM payments p
        ${whereClause}
        GROUP BY payment_type`,
        params
      );

      // Receita por mês
      const revenueByMonth = await query<any>(
        `SELECT 
          DATE_FORMAT(created_at, '%Y-%m') as month,
          COALESCE(SUM(amount), 0) as total,
          COUNT(*) as count
        FROM payments p
        ${whereClause}
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY month DESC
        LIMIT 12`,
        params
      );

      // Subscrições ativas
      const activeSubscriptions = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'`
      );

      // Receita de subscrições
      const subscriptionRevenue = await queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total 
         FROM payments p
         ${whereClause} AND p.payment_type = 'subscription'`,
        params
      );

      res.status(200).json(
        createSuccessResponse({
          totalRevenue: totalRevenue?.total || 0,
          revenueByType: revenueByType.map((item: any) => ({
            type: item.payment_type,
            count: item.count,
            total: item.total,
          })),
          revenueByMonth: revenueByMonth.map((item: any) => ({
            month: item.month,
            total: item.total,
            count: item.count,
          })),
          activeSubscriptions: activeSubscriptions?.count || 0,
          subscriptionRevenue: subscriptionRevenue?.total || 0,
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/reports/operational
   * Relatório operacional
   */
  static async getOperationalReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        startDate,
        endDate,
      } = req.query;

      const whereConditions: string[] = [];
      const params: any[] = [];

      if (startDate) {
        whereConditions.push('created_at >= ?');
        params.push(startDate);
      }

      if (endDate) {
        whereConditions.push('created_at <= ?');
        params.push(endDate);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Total de usuários
      const totalUsers = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL`
      );

      // Novos usuários no período
      const newUsersWhereClause = whereClause 
        ? `${whereClause} AND deleted_at IS NULL`
        : 'WHERE deleted_at IS NULL';
      const newUsers = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM users ${newUsersWhereClause}`,
        params
      );

      // Total de candidaturas
      const totalApplications = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM applications ${whereClause}`,
        params
      );

      // Candidaturas por status
      const applicationsByStatus = await query<any>(
        `SELECT 
          status,
          COUNT(*) as count
        FROM applications
        ${whereClause}
        GROUP BY status`,
        params
      );

      // Total de vagas
      const totalJobs = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM jobs ${whereClause}`,
        params
      );

      // Vagas ativas
      const activeJobs = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM jobs WHERE status = 'active'`
      );

      // Total de selos emitidos
      let badgeWhereClause = '';
      if (whereClause) {
        badgeWhereClause = whereClause.replace(/created_at/g, 'issued_at').replace('WHERE', 'AND');
      }
      const totalBadges = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM certificates 
         WHERE certificate_type = 'zolangola_badge'${badgeWhereClause}`,
        params
      );

      // Selos ativos
      const activeBadges = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM certificates 
         WHERE certificate_type = 'zolangola_badge' AND is_revoked = FALSE`
      );

      // Total de cursos
      const totalCourses = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM courses`
      );

      // Inscrições em cursos (usar enrolled_at em vez de created_at)
      let enrollmentWhereClause = '';
      if (whereClause) {
        enrollmentWhereClause = whereClause.replace(/created_at/g, 'enrolled_at');
      }
      const courseEnrollments = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM course_enrollments ${enrollmentWhereClause}`,
        params
      );

      res.status(200).json(
        createSuccessResponse({
          users: {
            total: totalUsers?.count || 0,
            new: newUsers?.count || 0,
          },
          applications: {
            total: totalApplications?.count || 0,
            byStatus: applicationsByStatus.map((item: any) => ({
              status: item.status,
              count: item.count,
            })),
          },
          jobs: {
            total: totalJobs?.count || 0,
            active: activeJobs?.count || 0,
          },
          badges: {
            total: totalBadges?.count || 0,
            active: activeBadges?.count || 0,
          },
          courses: {
            total: totalCourses?.count || 0,
            enrollments: courseEnrollments?.count || 0,
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

