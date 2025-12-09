import { Request, Response, NextFunction } from 'express';
import { CustomError } from '../../middlewares/errorHandler';
import { createSuccessResponse } from '../../utils/response';
import { queryOne, query, execute } from '../../utils/database';
import { generateUUID } from '../../utils/uuid';
import { getOrCreateCompanyProfileId } from '../../utils/companyHelper';

export class CompanySubscriptionsController {
  /**
   * GET /company/subscriptions
   * Obter informações sobre subscrições da empresa
   */
  static async getSubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      // Buscar subscrição ativa
      const activeSubscription = await queryOne<any>(
        `SELECT 
          s.*,
          sp.plan_type,
          sp.name as plan_name,
          sp.description,
          sp.price,
          sp.price_currency as currency,
          sp.features,
          sp.billing_period
        FROM subscriptions s
        INNER JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE s.company_id = ? AND s.status = 'active'
        ORDER BY s.created_at DESC
        LIMIT 1`,
        [companyProfileId]
      );

      // Buscar todos os planos disponíveis
      const availablePlans = await query<any>(
        `SELECT 
          id,
          plan_type,
          name,
          description,
          price,
          price_currency,
          billing_period,
          features,
          is_active
        FROM subscription_plans
        WHERE is_active = TRUE
        ORDER BY price ASC`
      );

      // Histórico de subscrições
      const subscriptionHistory = await query<any>(
        `SELECT 
          s.*,
          sp.plan_type,
          sp.name as plan_name
        FROM subscriptions s
        INNER JOIN subscription_plans sp ON s.plan_id = sp.id
        WHERE s.company_id = ?
        ORDER BY s.created_at DESC
        LIMIT 10`,
        [companyProfileId]
      );

      // Serviços disponíveis baseados no plano atual
      const services = [
        {
          id: 'triagem',
          name: 'Triagem Automatizada',
          description: 'Sistema de triagem inteligente de candidatos',
          available: activeSubscription?.plan_type === 'premium' || activeSubscription?.plan_type === 'enterprise',
        },
        {
          id: 'analytics',
          name: 'Analytics Avançado',
          description: 'Relatórios e métricas detalhadas',
          available: activeSubscription?.plan_type === 'premium' || activeSubscription?.plan_type === 'enterprise',
        },
        {
          id: 'support',
          name: 'Suporte Prioritário',
          description: 'Atendimento prioritário 24/7',
          available: activeSubscription?.plan_type === 'enterprise',
        },
        {
          id: 'branding',
          name: 'Branding Personalizado',
          description: 'Personalização da marca nas vagas',
          available: activeSubscription?.plan_type === 'enterprise',
        },
      ];

      const response = {
        currentPlan: activeSubscription ? (() => {
          let features: any[] = [];
          if (activeSubscription.features) {
            try {
              if (typeof activeSubscription.features === 'string') {
                features = JSON.parse(activeSubscription.features);
              } else {
                features = activeSubscription.features;
              }
            } catch (error) {
              console.warn(`Erro ao parsear features da subscrição ${activeSubscription.id}:`, error);
              features = [];
            }
          }
          return {
            id: activeSubscription.id,
            type: activeSubscription.plan_type,
            name: activeSubscription.plan_name,
            description: activeSubscription.description,
            price: activeSubscription.price,
            currency: activeSubscription.currency,
            billingPeriod: activeSubscription.billing_period,
            features,
            startDate: activeSubscription.started_at,
            endDate: activeSubscription.expires_at,
            status: activeSubscription.status,
            autoRenew: Boolean(activeSubscription.auto_renew),
          };
        })() : null,
        plans: availablePlans.map((plan: any) => {
          let features: any[] = [];
          if (plan.features) {
            try {
              // Se já for um objeto/array, usar diretamente
              if (typeof plan.features === 'string') {
                features = JSON.parse(plan.features);
              } else {
                features = plan.features;
              }
            } catch (error) {
              // Se não for JSON válido, tratar como string simples
              console.warn(`Erro ao parsear features do plano ${plan.id}:`, error);
              features = [];
            }
          }
          return {
            id: plan.id,
            type: plan.plan_type,
            name: plan.name,
            description: plan.description,
            price: plan.price,
            currency: plan.price_currency,
            billingPeriod: plan.billing_period,
            features,
          };
        }),
        services,
        history: subscriptionHistory.map((sub: any) => ({
          id: sub.id,
          planType: sub.plan_type,
          planName: sub.plan_name,
          status: sub.status,
          startDate: sub.started_at,
          endDate: sub.expires_at,
          createdAt: sub.created_at,
        })),
      };

      res.status(200).json(createSuccessResponse(response));
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /company/subscriptions
   * Criar/atualizar subscrição
   */
  static async createSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { planId } = req.body;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      if (!planId) {
        throw new CustomError('ID do plano é obrigatório', 400);
      }

      // Verificar se o plano existe
      const plan = await queryOne<any>(
        `SELECT id, plan_type, price, price_currency FROM subscription_plans WHERE id = ? AND is_active = TRUE`,
        [planId]
      );

      if (!plan) {
        throw new CustomError('Plano não encontrado ou inativo', 404);
      }

      // Obter company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      // Verificar se já existe subscrição ativa
      const existingSubscription = await queryOne<any>(
        `SELECT id FROM subscriptions WHERE company_id = ? AND status = 'active'`,
        [companyProfileId]
      );

      if (existingSubscription) {
        // Atualizar subscrição existente
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1); // 1 mês

        await execute(
          `UPDATE subscriptions 
           SET plan_id = ?, started_at = ?, expires_at = ?, status = 'active', updated_at = NOW()
           WHERE id = ?`,
          [planId, startDate, endDate, existingSubscription.id]
        );

        res.status(200).json(createSuccessResponse({ message: 'Subscrição atualizada com sucesso' }));
      } else {
        // Criar nova subscrição
        const subscriptionId = generateUUID();
        const startDate = new Date();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1); // 1 mês

        await execute(
          `INSERT INTO subscriptions (
            id, company_id, plan_id, status, started_at, expires_at, auto_renew, created_at, updated_at
          ) VALUES (?, ?, ?, 'active', ?, ?, TRUE, NOW(), NOW())`,
          [subscriptionId, companyProfileId, planId, startDate, endDate]
        );

        res.status(201).json(createSuccessResponse({ id: subscriptionId, message: 'Subscrição criada com sucesso' }));
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /company/subscriptions/:id/cancel
   * Cancelar subscrição
   */
  static async cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { id } = req.params;

      if (!userId) {
        throw new CustomError('Usuário não autenticado', 401);
      }

      // Obter company_profile_id
      const companyProfileId = await getOrCreateCompanyProfileId(userId);

      // Verificar se a subscrição pertence à empresa
      const subscription = await queryOne<any>(
        `SELECT id FROM subscriptions WHERE id = ? AND company_id = ?`,
        [id, companyProfileId]
      );

      if (!subscription) {
        throw new CustomError('Subscrição não encontrada ou acesso negado', 404);
      }

      // Cancelar subscrição
      await execute(
        `UPDATE subscriptions SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
        [id]
      );

      res.status(200).json(createSuccessResponse({ message: 'Subscrição cancelada com sucesso' }));
    } catch (error) {
      next(error);
    }
  }
}

