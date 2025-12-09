import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../middlewares/errorHandler';
import { createSuccessResponse } from '../utils/response';
import { query, queryOne, execute } from '../utils/database';
import { generateUUID } from '../utils/uuid';

export class NewsController {
  /**
   * GET /admin/news
   * Listar notícias
   */
  static async listNews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        search = '',
        status = 'all', // 'all' | 'published' | 'draft'
        page = 1,
        limit = 10,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = [];
      const params: any[] = [];

      if (search) {
        whereConditions.push('(n.title LIKE ? OR n.content LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam);
      }

      if (status === 'published') {
        whereConditions.push('n.is_published = TRUE');
      } else if (status === 'draft') {
        whereConditions.push('n.is_published = FALSE');
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM news n ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

      // LIMIT e OFFSET não funcionam com placeholders no MySQL2, usar valores literais
      const safeLimit = Math.floor(limitNum);
      const safeOffset = Math.floor(offset);

      // Buscar notícias
      const news = await query<any>(
        `SELECT 
          n.id,
          n.title,
          n.slug,
          n.content,
          n.excerpt,
          n.featured_image_url,
          n.author_id,
          n.category,
          n.tags,
          n.is_published,
          n.published_at,
          n.views_count,
          n.created_at,
          n.updated_at,
          au.full_name as author_name
        FROM news n
        LEFT JOIN admin_users au ON n.author_id = au.user_id
        ${whereClause}
        ORDER BY n.created_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Normalizar dados
      const normalizedNews = news.map((item: any) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        content: item.content,
        excerpt: item.excerpt,
        featuredImageUrl: item.featured_image_url,
        authorId: item.author_id,
        authorName: item.author_name,
        category: item.category,
        tags: item.tags,
        isPublished: item.is_published,
        publishedAt: item.published_at,
        viewsCount: item.views_count,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }));

      res.status(200).json(
        createSuccessResponse({
          news: normalizedNews,
          pagination: {
            total,
            page: Number(page),
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
   * POST /admin/news
   * Criar notícia
   */
  static async createNews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const {
        title,
        content,
        excerpt,
        featuredImageUrl,
        category,
        tags,
        isPublished = false,
      } = req.body;

      if (!title || !content) {
        throw new CustomError('Título e conteúdo são obrigatórios', 400);
      }

      // Gerar slug único
      const baseSlug = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      let slug = baseSlug;
      let counter = 1;
      while (await queryOne<any>(`SELECT id FROM news WHERE slug = ?`, [slug])) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const newsId = generateUUID();
      const now = new Date();

      await execute(
        `INSERT INTO news (
          id, title, slug, content, excerpt, featured_image_url,
          author_id, category, tags, is_published, published_at,
          views_count, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          newsId,
          title,
          slug,
          content,
          excerpt || null,
          featuredImageUrl || null,
          userId,
          category || null,
          tags ? JSON.stringify(tags) : null,
          isPublished,
          isPublished ? now : null,
          now,
          now,
        ]
      );

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'create_news', 'news', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          newsId,
          JSON.stringify({ title, isPublished }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(201).json(createSuccessResponse({ id: newsId, slug, message: 'Notícia criada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /admin/news/:id
   * Atualizar notícia
   */
  static async updateNews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      const updates = req.body;

      // Verificar se a notícia existe
      const news = await queryOne<any>(`SELECT id, is_published FROM news WHERE id = ?`, [id]);

      if (!news) {
        throw new CustomError('Notícia não encontrada', 404);
      }

      const updateFields: string[] = [];
      const values: any[] = [];

      const allowedFields = [
        'title', 'content', 'excerpt', 'featured_image_url',
        'category', 'tags', 'is_published',
      ];

      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === 'tags' && updates[field]) {
            updateFields.push(`${field} = ?`);
            values.push(JSON.stringify(updates[field]));
          } else {
            updateFields.push(`${field} = ?`);
            values.push(updates[field]);
          }
        }
      }

      // Se título mudou, atualizar slug
      if (updates.title) {
        const baseSlug = updates.title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

        let slug = baseSlug;
        let counter = 1;
        while (await queryOne<any>(`SELECT id FROM news WHERE slug = ? AND id != ?`, [slug, id])) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
        updateFields.push('slug = ?');
        values.push(slug);
      }

      // Se status mudou para publicado, definir published_at
      if (updates.is_published === true && !news.is_published) {
        updateFields.push('published_at = ?');
        values.push(new Date());
      }

      if (updateFields.length === 0) {
        throw new CustomError('Nenhum campo para atualizar', 400);
      }

      updateFields.push('updated_at = ?');
      values.push(new Date());
      values.push(id);

      await execute(`UPDATE news SET ${updateFields.join(', ')} WHERE id = ?`, values);

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'update_news', 'news', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          id,
          JSON.stringify(updates),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(200).json(createSuccessResponse({ message: 'Notícia atualizada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /admin/news/:id
   * Deletar notícia
   */
  static async deleteNews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      const { id } = req.params;

      // Verificar se a notícia existe
      const news = await queryOne<any>(`SELECT id FROM news WHERE id = ?`, [id]);

      if (!news) {
        throw new CustomError('Notícia não encontrada', 404);
      }

      await execute(`DELETE FROM news WHERE id = ?`, [id]);

      // Registrar em audit_logs
      await execute(
        `INSERT INTO audit_logs (id, user_id, user_type, action, entity_type, entity_id, changes, ip_address, user_agent)
         VALUES (?, ?, 'admin', 'delete_news', 'news', ?, ?, ?, ?)`,
        [
          generateUUID(),
          userId,
          id,
          JSON.stringify({ deleted: true }),
          req.ip,
          req.get('user-agent'),
        ]
      );

      res.status(200).json(createSuccessResponse({ message: 'Notícia deletada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }
}

