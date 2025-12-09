import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne, execute } from '../../utils/database';

export class TalentNotificationsController {
  /**
   * GET /talent/notifications
   * Listar notificações do talento
   */
  static async listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        read = 'all', // 'all' | 'read' | 'unread'
        page = 1,
        limit = 20,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 20);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = ['n.user_id = ?', "n.user_type = 'talent'"];
      const params: any[] = [userId];

      if (read === 'read') {
        whereConditions.push('n.is_read = TRUE');
      } else if (read === 'unread') {
        whereConditions.push('n.is_read = FALSE');
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total
         FROM notifications n
         ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      // Buscar notificações
      const notifications = await query<any>(
        `SELECT
          n.id,
          n.notification_type,
          n.title,
          n.message,
          n.action_url,
          n.is_read,
          n.read_at,
          n.metadata,
          n.created_at
        FROM notifications n
        ${whereClause}
        ORDER BY n.created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Normalizar dados
      const normalizedNotifications = notifications.map((notif: any) => ({
        id: notif.id,
        notificationType: notif.notification_type,
        title: notif.title,
        message: notif.message,
        actionUrl: notif.action_url,
        isRead: Boolean(notif.is_read),
        readAt: notif.read_at,
        metadata: notif.metadata ? (typeof notif.metadata === 'string' ? JSON.parse(notif.metadata) : notif.metadata) : null,
        createdAt: notif.created_at,
      }));

      res.status(200).json(
        createSuccessResponse({
          notifications: normalizedNotifications,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /talent/notifications/unread-count
   * Obter contagem de notificações não lidas
   */
  static async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const result = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count 
         FROM notifications n
         WHERE n.user_id = ? AND n.user_type = 'talent' AND n.is_read = FALSE`,
        [userId]
      );

      res.status(200).json(
        createSuccessResponse({
          unreadCount: result?.count || 0,
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /talent/notifications/:id/read
   * Marcar notificação como lida
   */
  static async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      // Verificar se a notificação pertence ao usuário
      const notification = await queryOne<any>(
        `SELECT id FROM notifications WHERE id = ? AND user_id = ? AND user_type = 'talent'`,
        [id, userId]
      );

      if (!notification) {
        throw new CustomError('Notificação não encontrada', 404);
      }

      await execute(
        `UPDATE notifications 
         SET is_read = TRUE, read_at = NOW() 
         WHERE id = ? AND user_id = ? AND user_type = 'talent'`,
        [id, userId]
      );

      res.status(200).json(
        createSuccessResponse({
          message: 'Notificação marcada como lida',
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /talent/notifications/read-all
   * Marcar todas as notificações como lidas
   */
  static async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      await execute(
        `UPDATE notifications 
         SET is_read = TRUE, read_at = NOW() 
         WHERE user_id = ? AND user_type = 'talent' AND is_read = FALSE`,
        [userId]
      );

      res.status(200).json(
        createSuccessResponse({
          message: 'Todas as notificações foram marcadas como lidas',
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /talent/notifications/:id
   * Deletar notificação
   */
  static async deleteNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      // Verificar se a notificação pertence ao usuário
      const notification = await queryOne<any>(
        `SELECT id FROM notifications WHERE id = ? AND user_id = ? AND user_type = 'talent'`,
        [id, userId]
      );

      if (!notification) {
        throw new CustomError('Notificação não encontrada', 404);
      }

      await execute(
        `DELETE FROM notifications WHERE id = ? AND user_id = ? AND user_type = 'talent'`,
        [id, userId]
      );

      res.status(200).json(
        createSuccessResponse({
          message: 'Notificação deletada com sucesso',
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

