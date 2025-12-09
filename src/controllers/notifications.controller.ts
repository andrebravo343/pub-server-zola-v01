import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middlewares/errorHandler';
import { createSuccessResponse } from '../utils/response';
import { query, queryOne, execute } from '../utils/database';
import { generateUUID } from '../utils/uuid';

export class NotificationsController {
  /**
   * GET /admin/notifications
   * Listar notificações do usuário
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

      const whereConditions: string[] = ['user_id = ?'];
      const params: any[] = [userId];

      if (read === 'read') {
        whereConditions.push('is_read = TRUE');
      } else if (read === 'unread') {
        whereConditions.push('is_read = FALSE');
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      // Buscar notificações
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      const notifications = await query<any>(
        `SELECT 
          id,
          notification_type,
          title,
          message,
          action_url,
          is_read,
          read_at,
          metadata,
          created_at
        FROM notifications 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      res.status(200).json(
        createSuccessResponse({
          notifications: notifications || [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /admin/notifications/unread-count
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
         FROM notifications 
         WHERE user_id = ? AND is_read = FALSE`,
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
   * POST /admin/notifications
   * Criar notificação (individual ou em massa)
   */
  static async createNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        targetUserId,
        audience, // 'all' | 'talents' | 'companies'
        notificationType = 'admin_announcement',
        title,
        message,
        actionUrl,
        metadata,
      } = req.body;

      if (!title || !message) {
        throw new CustomError('Título e mensagem são obrigatórios', 400);
      }

      // Se audience for especificado, criar notificações em massa
      if (audience) {
        if (!['all', 'talents', 'companies'].includes(audience)) {
          throw new CustomError('Audience inválido. Use: all, talents ou companies', 400);
        }

        // Buscar IDs dos usuários baseado no audience
        let userQuery = '';
        if (audience === 'talents') {
          userQuery = `SELECT id FROM users WHERE user_type = 'talent' AND deleted_at IS NULL AND is_active = TRUE`;
        } else if (audience === 'companies') {
          userQuery = `SELECT id FROM users WHERE user_type = 'company' AND deleted_at IS NULL AND is_active = TRUE`;
        } else {
          userQuery = `SELECT id FROM users WHERE user_type IN ('talent', 'company') AND deleted_at IS NULL AND is_active = TRUE`;
        }

        const targetUsers = await query<{ id: string }>(userQuery);

        if (targetUsers.length === 0) {
          throw new CustomError('Nenhum usuário encontrado para o público-alvo especificado', 404);
        }

        // Criar notificações para todos os usuários
        const notificationIds: string[] = [];

        // Buscar user_type de cada usuário
        const usersWithType = await query<{ id: string; user_type: string }>(
          `SELECT id, user_type FROM users WHERE id IN (${targetUsers.map(() => '?').join(',')})`,
          targetUsers.map(u => u.id)
        );

        const userTypeMap = new Map(usersWithType.map(u => [u.id, u.user_type]));

        for (const user of targetUsers) {
          const notificationId = generateUUID();
          notificationIds.push(notificationId);

          const userType = userTypeMap.get(user.id) || 'talent';

          await execute(
            `INSERT INTO notifications (
              id, user_id, user_type, notification_type, title, message, 
              action_url, metadata, sent_in_app, is_read, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, FALSE, NOW())`,
            [
              notificationId,
              user.id,
              userType,
              notificationType,
              title,
              message,
              actionUrl || null,
              metadata ? JSON.stringify(metadata) : null,
            ]
          );
        }

        res.status(201).json(
          createSuccessResponse({
            count: notificationIds.length,
            message: `${notificationIds.length} notificação(ões) criada(s) com sucesso`,
          })
        );
        return;
      }

      // Criar notificação individual
      if (!targetUserId) {
        throw new CustomError('targetUserId é obrigatório quando audience não é especificado', 400);
      }

      const notificationId = generateUUID();

      await execute(
        `INSERT INTO notifications (
          id, user_id, user_type, notification_type, title, message, 
          action_url, metadata, sent_in_app, is_read, created_at
        ) VALUES (?, ?, 'admin', ?, ?, ?, ?, ?, TRUE, FALSE, NOW())`,
        [
          notificationId,
          targetUserId,
          notificationType,
          title,
          message,
          actionUrl || null,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      res.status(201).json(
        createSuccessResponse({
          id: notificationId,
          message: 'Notificação criada com sucesso',
        })
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/notifications/:id/read
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
        `SELECT id FROM notifications WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!notification) {
        throw new CustomError('Notificação não encontrada', 404);
      }

      await execute(
        `UPDATE notifications 
         SET is_read = TRUE, read_at = NOW() 
         WHERE id = ? AND user_id = ?`,
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
   * PUT /admin/notifications/read-all
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
         WHERE user_id = ? AND is_read = FALSE`,
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
   * DELETE /admin/notifications/:id
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
        `SELECT id FROM notifications WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!notification) {
        throw new CustomError('Notificação não encontrada', 404);
      }

      await execute(
        `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
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

  /**
   * GET /admin/notifications/all
   * Listar todas as notificações criadas pelo admin (histórico)
   */
  static async listAllNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        page = 1,
        limit = 50,
        audience,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 50);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      // Buscar todas as notificações criadas recentemente (últimas 30 dias)
      // Agrupadas por título e mensagem para mostrar notificações em massa
      let whereClause = `WHERE notification_type = 'admin_announcement' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
      const params: any[] = [];

      if (audience) {
        if (audience === 'talents') {
          whereClause += ` AND user_type = 'talent'`;
        } else if (audience === 'companies') {
          whereClause += ` AND user_type = 'company'`;
        }
      }

      // Contar total de notificações únicas (agrupadas por título/mensagem)
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(DISTINCT CONCAT(title, '|', message)) as total FROM notifications ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      // Buscar notificações agrupadas
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      const notifications = await query<any>(
        `SELECT 
          title,
          message,
          notification_type,
          action_url,
          MIN(created_at) as first_created_at,
          MAX(created_at) as last_created_at,
          COUNT(*) as sent_count,
          COUNT(DISTINCT user_id) as recipients_count,
          SUM(CASE WHEN is_read = TRUE THEN 1 ELSE 0 END) as read_count
        FROM notifications 
        ${whereClause}
        GROUP BY title, message, notification_type, action_url
        ORDER BY first_created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      res.status(200).json(
        createSuccessResponse({
          notifications: notifications || [],
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        })
      );
    } catch (error) {
      next(error);
    }
  }
}

