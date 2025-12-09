import { Request, Response, NextFunction } from 'express';
import { createSuccessResponse } from '../../utils/response';
import { query, queryOne } from '../../utils/database';

export class PublicNewsController {
  /**
   * GET /public/news
   * Listar notícias publicadas (sem autenticação)
   */
  static async listNews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        search = '',
        category = '',
        author = '',
        page = 1,
        limit = 10,
      } = req.query;

      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.max(1, Number(limit) || 10);
      const offset = Math.max(0, (pageNum - 1) * limitNum);

      const whereConditions: string[] = ['n.is_published = TRUE'];
      const params: any[] = [];

      if (search) {
        whereConditions.push('(n.title LIKE ? OR n.content LIKE ? OR n.excerpt LIKE ?)');
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      if (category) {
        whereConditions.push('n.category = ?');
        params.push(category);
      }

      if (author) {
        whereConditions.push('au.full_name LIKE ?');
        params.push(`%${author}%`);
      }

      const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

      // Contar total
      const countResult = await queryOne<{ total: number }>(
        `SELECT COUNT(*) as total 
         FROM news n
         LEFT JOIN admin_users au ON n.author_id = au.user_id
         ${whereClause}`,
        params
      );

      const total = countResult?.total || 0;

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
          n.category,
          n.tags,
          n.published_at,
          n.views_count,
          n.created_at,
          n.updated_at,
          au.full_name as author_name
        FROM news n
        LEFT JOIN admin_users au ON n.author_id = au.user_id
        ${whereClause}
        ORDER BY n.published_at DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      // Normalizar dados
      const normalizedNews = news.map((item: any) => {
        // Converter content de string para array de parágrafos
        let content: string[] = [];
        if (item.content) {
          try {
            // Se for JSON, parsear
            const parsed = JSON.parse(item.content);
            content = Array.isArray(parsed) ? parsed : [item.content];
          } catch {
            // Se não for JSON, dividir por quebras de linha duplas ou simples
            // Primeiro tenta por \n\n, depois por \n, e se não tiver, usa o texto inteiro
            if (item.content.includes('\n\n')) {
              content = item.content.split('\n\n').filter((p: string) => p.trim());
            } else if (item.content.includes('\n')) {
              content = item.content.split('\n').filter((p: string) => p.trim());
            } else {
              // Se não tiver quebras, usar o texto inteiro como um parágrafo
              content = [item.content.trim()];
            }
          }
        }

        // Parsear tags se for JSON
        let tags: string[] = [];
        if (item.tags) {
          try {
            tags = JSON.parse(item.tags);
          } catch {
            tags = [];
          }
        }

        return {
          id: item.id,
          slug: item.slug,
          title: item.title,
          excerpt: item.excerpt || '',
          content,
          date: item.published_at ? new Date(item.published_at).toLocaleDateString('pt-AO', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }) : '',
          author: item.author_name || 'Equipa ZOLANGOLA',
          category: item.category || 'Geral',
          publishedAt: item.published_at,
          updatedAt: item.updated_at,
          featuredImage: item.featured_image_url || null,
          tags,
        };
      });

      res.status(200).json(
        createSuccessResponse({
          news: normalizedNews,
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
   * GET /public/news/:slug
   * Obter notícia por slug (sem autenticação)
   */
  static async getNewsBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;

      const news = await queryOne<any>(
        `SELECT 
          n.id,
          n.title,
          n.slug,
          n.content,
          n.excerpt,
          n.featured_image_url,
          n.category,
          n.tags,
          n.published_at,
          n.views_count,
          n.created_at,
          n.updated_at,
          au.full_name as author_name
        FROM news n
        LEFT JOIN admin_users au ON n.author_id = au.user_id
        WHERE n.slug = ? AND n.is_published = TRUE`,
        [slug]
      );

      if (!news) {
        res.status(404).json({
          success: false,
          message: 'Notícia não encontrada',
        });
        return;
      }

      // Incrementar contador de visualizações
      await query(
        `UPDATE news SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?`,
        [news.id]
      );

      // Converter content de string para array de parágrafos
      let content: string[] = [];
      if (news.content) {
        try {
          const parsed = JSON.parse(news.content);
          content = Array.isArray(parsed) ? parsed : [news.content];
        } catch {
          // Se não for JSON, dividir por quebras de linha duplas ou simples
          if (news.content.includes('\n\n')) {
            content = news.content.split('\n\n').filter((p: string) => p.trim());
          } else if (news.content.includes('\n')) {
            content = news.content.split('\n').filter((p: string) => p.trim());
          } else {
            // Se não tiver quebras, usar o texto inteiro como um parágrafo
            content = [news.content.trim()];
          }
        }
      }

      // Parsear tags se for JSON
      let tags: string[] = [];
      if (news.tags) {
        try {
          tags = JSON.parse(news.tags);
        } catch {
          tags = [];
        }
      }

      const normalizedNews = {
        id: news.id,
        slug: news.slug,
        title: news.title,
        excerpt: news.excerpt || '',
        content,
        date: news.published_at ? new Date(news.published_at).toLocaleDateString('pt-AO', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }) : '',
        author: news.author_name || 'Equipa ZOLANGOLA',
        category: news.category || 'Geral',
        publishedAt: news.published_at,
        updatedAt: news.updated_at,
        featuredImage: news.featured_image_url || null,
        tags,
      };

      res.status(200).json(createSuccessResponse(normalizedNews));
    } catch (error) {
      next(error);
    }
  }
}

