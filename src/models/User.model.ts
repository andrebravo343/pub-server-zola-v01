import { queryOne, execute } from '../utils/database';
import { hashPassword, comparePassword } from '../utils/password';
import { generateUUID } from '../utils/uuid';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  userType: 'talent' | 'company' | 'admin';
  isActive: boolean;
  emailVerified: boolean;
  emailVerifiedAt: Date | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateUserData {
  email: string;
  password: string;
  userType: 'talent' | 'company' | 'admin';
}

export interface UpdateUserData {
  email?: string;
  password?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
}

export class UserModel {
  /**
   * Criar novo usuário
   */
  static async create(data: CreateUserData): Promise<User> {
    const id = generateUUID();
    const passwordHash = await hashPassword(data.password);
    const now = new Date();

    const sql = `
      INSERT INTO users (
        id, email, password_hash, user_type, is_active, 
        email_verified, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await execute(sql, [
      id,
      data.email,
      passwordHash,
      data.userType,
      true,
      false,
      now,
      now,
    ]);

    const createdUser = await this.findById(id);
    if (!createdUser) {
      throw new Error('Erro ao criar usuário');
    }
    return createdUser;
  }

  /**
   * Buscar usuário por ID
   */
  static async findById(id: string): Promise<User | null> {
    const sql = `
      SELECT 
        id, email, password_hash as passwordHash, user_type as userType,
        is_active as isActive, email_verified as emailVerified,
        email_verified_at as emailVerifiedAt, two_factor_enabled as twoFactorEnabled,
        two_factor_secret as twoFactorSecret, last_login_at as lastLoginAt,
        created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt
      FROM users
      WHERE id = ? AND deleted_at IS NULL
    `;

    return queryOne<User>(sql, [id]);
  }

  /**
   * Buscar usuário por email
   */
  static async findByEmail(email: string): Promise<User | null> {
    const sql = `
      SELECT 
        id, email, password_hash as passwordHash, user_type as userType,
        is_active as isActive, email_verified as emailVerified,
        email_verified_at as emailVerifiedAt, two_factor_enabled as twoFactorEnabled,
        two_factor_secret as twoFactorSecret, last_login_at as lastLoginAt,
        created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt
      FROM users
      WHERE email = ? AND deleted_at IS NULL
    `;

    return queryOne<User>(sql, [email]);
  }

  /**
   * Verificar senha
   */
  static async verifyPassword(user: User, password: string): Promise<boolean> {
    return comparePassword(password, user.passwordHash);
  }

  /**
   * Atualizar usuário
   */
  static async update(id: string, data: UpdateUserData): Promise<User | null> {
    const updates: string[] = [];
    const values: any[] = [];

    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email);
    }

    if (data.password !== undefined) {
      updates.push('password_hash = ?');
      values.push(await hashPassword(data.password));
    }

    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive);
    }

    if (data.emailVerified !== undefined) {
      updates.push('email_verified = ?');
      values.push(data.emailVerified);
      if (data.emailVerified) {
        updates.push('email_verified_at = ?');
        values.push(new Date());
      }
    }

    if (data.twoFactorEnabled !== undefined) {
      updates.push('two_factor_enabled = ?');
      values.push(data.twoFactorEnabled);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = ?');
    values.push(new Date());
    values.push(id);

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND deleted_at IS NULL`;

    await execute(sql, values);
    return this.findById(id);
  }

  /**
   * Atualizar último login
   */
  static async updateLastLogin(id: string): Promise<void> {
    const sql = `
      UPDATE users 
      SET last_login_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `;

    await execute(sql, [new Date(), new Date(), id]);
  }

  /**
   * Soft delete usuário
   */
  static async delete(id: string): Promise<void> {
    const sql = `
      UPDATE users 
      SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `;

    await execute(sql, [new Date(), new Date(), id]);
  }

  /**
   * Verificar se email já existe
   */
  static async emailExists(email: string, excludeId?: string): Promise<boolean> {
    let sql = `
      SELECT COUNT(*) as count
      FROM users
      WHERE email = ? AND deleted_at IS NULL
    `;

    const params: any[] = [email];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const result = await queryOne<{ count: number }>(sql, params);
    return (result?.count || 0) > 0;
  }
}

