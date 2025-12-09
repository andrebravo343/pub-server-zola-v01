import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne, execute } from '../../utils/database';

export class AdminSpontaneousController {
  /**
   * GET /admin/spontaneous
   * Listar candidaturas espontâneas
   */
  static async listSpontaneous(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        search = '',
        status = 'all',
        page = 1,
        limit = 10,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = [];
      const params: any[] = [];

      if (search) {
        whereConditions.push(
          '(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR title LIKE ?)'
        );
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
      }

      if (status !== 'all') {
        whereConditions.push('status = ?');
        params.push(status);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM spontaneous_applications ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      // Buscar candidaturas
      const applications = await query<any>(
        `SELECT 
          sa.*,
          u.email as reviewed_by_email,
          au.full_name as reviewed_by_name
        FROM spontaneous_applications sa
        LEFT JOIN users u ON sa.reviewed_by = u.id
        LEFT JOIN admin_users au ON u.id = au.user_id
        ${whereClause}
        ORDER BY sa.created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Parsear documents JSON se existir
      const normalizedApplications = applications.map((app: any) => {
        let documents: any[] = [];
        if (app.documents) {
          try {
            documents = JSON.parse(app.documents);
          } catch {
            documents = [];
          }
        }

        return {
          id: app.id,
          firstName: app.first_name,
          lastName: app.last_name,
          email: app.email,
          phone: app.phone,
          title: app.title,
          bio: app.bio,
          city: app.city,
          province: app.province,
          country: app.country,
          coverLetter: app.cover_letter,
          resumeUrl: app.resume_url,
          documents,
          status: app.status,
          reviewedBy: app.reviewed_by,
          reviewedByEmail: app.reviewed_by_email,
          reviewedByName: app.reviewed_by_name,
          reviewedAt: app.reviewed_at,
          notes: app.notes,
          createdAt: app.created_at,
          updatedAt: app.updated_at,
        };
      });

      res.status(200).json(
        createSuccessResponse({
          applications: normalizedApplications,
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
   * GET /admin/spontaneous/:id
   * Obter detalhes de uma candidatura espontânea
   */
  static async getSpontaneous(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      const application = await queryOne<any>(
        `SELECT 
          sa.*,
          u.email as reviewed_by_email,
          au.full_name as reviewed_by_name
        FROM spontaneous_applications sa
        LEFT JOIN users u ON sa.reviewed_by = u.id
        LEFT JOIN admin_users au ON u.id = au.user_id
        WHERE sa.id = ?`,
        [id]
      );

      if (!application) {
        throw new CustomError('Candidatura espontânea não encontrada', 404);
      }

      // Parsear documents JSON se existir
      let documents: any[] = [];
      if (application.documents) {
        try {
          documents = JSON.parse(application.documents);
        } catch {
          documents = [];
        }
      }

      const normalizedApplication = {
        id: application.id,
        firstName: application.first_name,
        lastName: application.last_name,
        email: application.email,
        phone: application.phone,
        title: application.title,
        bio: application.bio,
        city: application.city,
        province: application.province,
        country: application.country,
        coverLetter: application.cover_letter,
        resumeUrl: application.resume_url,
        documents,
        status: application.status,
        reviewedBy: application.reviewed_by,
        reviewedByEmail: application.reviewed_by_email,
        reviewedByName: application.reviewed_by_name,
        reviewedAt: application.reviewed_at,
        notes: application.notes,
        createdAt: application.created_at,
        updatedAt: application.updated_at,
      };

      res.status(200).json(createSuccessResponse(normalizedApplication));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/spontaneous/:id
   * Atualizar candidatura espontânea (status, notas, etc.)
   */
  static async updateSpontaneous(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      const { status, notes } = req.body;

      // Verificar se a candidatura existe
      const existing = await queryOne<any>(
        `SELECT id, status FROM spontaneous_applications WHERE id = ?`,
        [id]
      );

      if (!existing) {
        throw new CustomError('Candidatura espontânea não encontrada', 404);
      }

      const updateFields: string[] = [];
      const values: any[] = [];

      if (status !== undefined) {
        updateFields.push('status = ?');
        values.push(status);

        // Se mudando para reviewed/contacted, definir reviewed_by e reviewed_at
        if ((status === 'reviewed' || status === 'contacted') && !existing.reviewed_by) {
          updateFields.push('reviewed_by = ?');
          updateFields.push('reviewed_at = NOW()');
          values.push(userId);
        }
      }

      if (notes !== undefined) {
        updateFields.push('notes = ?');
        values.push(notes);
      }

      if (updateFields.length === 0) {
        throw new CustomError('Nenhum campo para atualizar', 400);
      }

      updateFields.push('updated_at = NOW()');
      values.push(id);

      await execute(
        `UPDATE spontaneous_applications SET ${updateFields.join(', ')} WHERE id = ?`,
        values
      );

      res.status(200).json(createSuccessResponse({ message: 'Candidatura atualizada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/spontaneous/:id
   * Deletar candidatura espontânea
   */
  static async deleteSpontaneous(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      // Verificar se a candidatura existe
      const existing = await queryOne<any>(
        `SELECT id FROM spontaneous_applications WHERE id = ?`,
        [id]
      );

      if (!existing) {
        throw new CustomError('Candidatura espontânea não encontrada', 404);
      }

      await execute(`DELETE FROM spontaneous_applications WHERE id = ?`, [id]);

      res.status(200).json(createSuccessResponse({ message: 'Candidatura deletada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }
}

