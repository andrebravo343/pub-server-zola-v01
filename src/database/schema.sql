-- ============================================
-- SCHEMA COMPLETO DO BANCO DE DADOS ZOLANGOLA
-- ============================================
-- Este arquivo contém todas as tabelas necessárias para a plataforma
-- Execute este script após criar o banco de dados:
-- CREATE DATABASE zolangola_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE zolangola_db;
-- source schema.sql;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- 1. TABELAS DE USUÁRIOS
-- ============================================

-- Tabela base de usuários
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type ENUM('talent', 'company', 'admin') NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at DATETIME NULL,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255) NULL,
    last_login_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    INDEX idx_email (email),
    INDEX idx_user_type (user_type),
    INDEX idx_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuários Talentos (Candidatos)
CREATE TABLE IF NOT EXISTS talent_users (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NULL,
    phone_verified BOOLEAN DEFAULT FALSE,
    date_of_birth DATE NULL,
    nationality VARCHAR(100) NULL,
    gender ENUM('male', 'female', 'other', 'prefer_not_to_say') NULL,
    profile_picture_url VARCHAR(500) NULL,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_name (first_name, last_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuários Empresas
CREATE TABLE IF NOT EXISTS company_users (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) UNIQUE NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    nif VARCHAR(20) UNIQUE NOT NULL,
    certidao_url VARCHAR(500) NULL,
    approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    approved_at DATETIME NULL,
    approved_by VARCHAR(36) NULL,
    rejection_reason TEXT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_nif (nif),
    INDEX idx_approval_status (approval_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuários Administradores
CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'admin', 'moderator', 'finance', 'hr') NOT NULL,
    permissions JSON NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. AUTENTICAÇÃO E TOKENS
-- ============================================

-- Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token VARCHAR(500) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_token (user_id, token),
    INDEX idx_user (user_id),
    INDEX idx_token (token),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens de Reset de Senha
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    token VARCHAR(100) UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_token (token),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tokens OAuth (Google, LinkedIn)
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    provider ENUM('google', 'linkedin') NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT NULL,
    refresh_token TEXT NULL,
    expires_at DATETIME NULL,
    profile_data JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_provider_user (provider, provider_user_id),
    INDEX idx_user (user_id),
    INDEX idx_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Códigos 2FA
CREATE TABLE IF NOT EXISTS two_factor_codes (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    code VARCHAR(10) NOT NULL,
    method ENUM('sms', 'email', 'app') NOT NULL,
    expires_at DATETIME NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    used_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_code (user_id, code),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. PERFIS DE TALENTOS
-- ============================================

-- Perfil Completo do Talento
CREATE TABLE IF NOT EXISTS talent_profiles (
    id VARCHAR(36) PRIMARY KEY,
    talent_user_id VARCHAR(36) UNIQUE NOT NULL,
    title VARCHAR(255) NULL,
    bio TEXT NULL,
    city VARCHAR(100) NULL,
    province VARCHAR(100) NULL,
    country VARCHAR(100) DEFAULT 'Angola',
    is_remote BOOLEAN DEFAULT FALSE,
    availability_status ENUM('available', 'employed', 'in_process') DEFAULT 'available',
    availability_date DATE NULL,
    has_zolangola_badge BOOLEAN DEFAULT FALSE,
    badge_issued_at DATETIME NULL,
    badge_revoked_at DATETIME NULL,
    badge_revocation_reason TEXT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at DATETIME NULL,
    profile_visibility ENUM('public', 'private') DEFAULT 'public',
    applications_count INT DEFAULT 0,
    certificates_count INT DEFAULT 0,
    profile_views INT DEFAULT 0,
    last_update DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (talent_user_id) REFERENCES talent_users(id) ON DELETE CASCADE,
    INDEX idx_city (city),
    INDEX idx_availability (availability_status),
    INDEX idx_badge (has_zolangola_badge),
    INDEX idx_verified (is_verified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Experiência Profissional
CREATE TABLE IF NOT EXISTS talent_experience (
    id VARCHAR(36) PRIMARY KEY,
    talent_profile_id VARCHAR(36) NOT NULL,
    position VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NULL,
    is_current BOOLEAN DEFAULT FALSE,
    description TEXT NULL,
    location VARCHAR(255) NULL,
    order_index INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (talent_profile_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    INDEX idx_profile (talent_profile_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Formação Académica
CREATE TABLE IF NOT EXISTS talent_education (
    id VARCHAR(36) PRIMARY KEY,
    talent_profile_id VARCHAR(36) NOT NULL,
    degree VARCHAR(255) NOT NULL,
    institution VARCHAR(255) NOT NULL,
    start_year INT NULL,
    end_year INT NULL,
    is_completed BOOLEAN DEFAULT TRUE,
    field_of_study VARCHAR(255) NULL,
    order_index INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (talent_profile_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    INDEX idx_profile (talent_profile_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Competências (Skills)
CREATE TABLE IF NOT EXISTS talent_skills (
    id VARCHAR(36) PRIMARY KEY,
    talent_profile_id VARCHAR(36) NOT NULL,
    skill_name VARCHAR(100) NOT NULL,
    skill_type ENUM('technical', 'soft', 'language') DEFAULT 'technical',
    proficiency_level ENUM('beginner', 'intermediate', 'advanced', 'expert') NULL,
    years_of_experience INT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (talent_profile_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    UNIQUE KEY unique_skill (talent_profile_id, skill_name),
    INDEX idx_skill_type (skill_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idiomas
CREATE TABLE IF NOT EXISTS talent_languages (
    id VARCHAR(36) PRIMARY KEY,
    talent_profile_id VARCHAR(36) NOT NULL,
    language VARCHAR(100) NOT NULL,
    proficiency_level ENUM('basic', 'intermediate', 'advanced', 'fluent', 'native') NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (talent_profile_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    UNIQUE KEY unique_language (talent_profile_id, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Documentos
CREATE TABLE IF NOT EXISTS talent_documents (
    id VARCHAR(36) PRIMARY KEY,
    talent_profile_id VARCHAR(36) NOT NULL,
    document_type ENUM('bi', 'certificate', 'diploma', 'portfolio', 'other') NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_size INT NULL,
    mime_type VARCHAR(100) NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at DATETIME NULL,
    verified_by VARCHAR(36) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (talent_profile_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_type (document_type),
    INDEX idx_verified (is_verified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. PERFIS DE EMPRESAS
-- ============================================

-- Perfil Completo da Empresa
CREATE TABLE IF NOT EXISTS company_profiles (
    id VARCHAR(36) PRIMARY KEY,
    company_user_id VARCHAR(36) UNIQUE NOT NULL,
    description TEXT NULL,
    website VARCHAR(255) NULL,
    phone VARCHAR(20) NULL,
    address TEXT NULL,
    city VARCHAR(100) NULL,
    province VARCHAR(100) NULL,
    country VARCHAR(100) DEFAULT 'Angola',
    industry VARCHAR(100) NULL,
    company_size ENUM('1-10', '11-50', '51-200', '201-500', '500+') NULL,
    logo_url VARCHAR(500) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_user_id) REFERENCES company_users(id) ON DELETE CASCADE,
    INDEX idx_city (city),
    INDEX idx_industry (industry)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. VAGAS DE EMPREGO
-- ============================================

-- Vagas Publicadas
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(36) PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    benefits TEXT NULL,
    location_type ENUM('onsite', 'remote', 'hybrid') NOT NULL,
    city VARCHAR(100) NULL,
    province VARCHAR(100) NULL,
    country VARCHAR(100) DEFAULT 'Angola',
    job_type ENUM('full_time', 'part_time', 'temporary', 'contract', 'internship') NOT NULL,
    job_category VARCHAR(100) NULL,
    experience_level ENUM('entry', 'mid', 'senior', 'executive') NULL,
    salary_min DECIMAL(10,2) NULL,
    salary_max DECIMAL(10,2) NULL,
    salary_currency VARCHAR(3) DEFAULT 'AOA',
    salary_period ENUM('hourly', 'daily', 'monthly', 'yearly') NULL,
    is_premium BOOLEAN DEFAULT FALSE,
    is_internal BOOLEAN DEFAULT FALSE,
    status ENUM('draft', 'active', 'paused', 'closed', 'filled') DEFAULT 'draft',
    published_at DATETIME NULL,
    closed_at DATETIME NULL,
    applications_count INT DEFAULT 0,
    views_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE,
    INDEX idx_company (company_id),
    INDEX idx_status (status),
    INDEX idx_location (city, province),
    INDEX idx_type (job_type),
    INDEX idx_premium (is_premium),
    FULLTEXT idx_search (title, description, requirements)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. CANDIDATURAS
-- ============================================

-- Candidaturas a Vagas
CREATE TABLE IF NOT EXISTS applications (
    id VARCHAR(36) PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    talent_profile_id VARCHAR(36) NOT NULL,
    status ENUM('pending', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn') DEFAULT 'pending',
    cover_letter TEXT NULL,
    application_source ENUM('direct', 'zolangola_triage', 'premium') DEFAULT 'direct',
    feedback TEXT NULL,
    feedback_given_at DATETIME NULL,
    feedback_given_by VARCHAR(36) NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status_changed_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (talent_profile_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (feedback_given_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_application (job_id, talent_profile_id),
    INDEX idx_job (job_id),
    INDEX idx_talent (talent_profile_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Histórico de Status (Kanban)
CREATE TABLE IF NOT EXISTS application_status_history (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    old_status VARCHAR(50) NULL,
    new_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(36) NULL,
    notes TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_application (application_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. CURSOS E FORMAÇÕES
-- ============================================

-- Cursos Disponíveis
CREATE TABLE IF NOT EXISTS courses (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    instructor_name VARCHAR(255) NULL,
    instructor_bio TEXT NULL,
    category VARCHAR(100) NULL,
    level ENUM('beginner', 'intermediate', 'advanced') NULL,
    course_type ENUM('free', 'paid', 'certificate', 'workshop') NOT NULL,
    duration_hours INT NULL,
    content_syllabus JSON NULL,
    prerequisites TEXT NULL,
    price DECIMAL(10,2) NULL,
    price_currency VARCHAR(3) DEFAULT 'AOA',
    is_active BOOLEAN DEFAULT TRUE,
    enrollment_count INT DEFAULT 0,
    rating DECIMAL(3,2) NULL,
    rating_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_type (course_type),
    INDEX idx_active (is_active),
    FULLTEXT idx_search (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inscrições em Cursos
CREATE TABLE IF NOT EXISTS course_enrollments (
    id VARCHAR(36) PRIMARY KEY,
    course_id VARCHAR(36) NOT NULL,
    talent_profile_id VARCHAR(36) NOT NULL,
    enrollment_status ENUM('enrolled', 'in_progress', 'completed', 'dropped') DEFAULT 'enrolled',
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (talent_profile_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    UNIQUE KEY unique_enrollment (course_id, talent_profile_id),
    INDEX idx_talent (talent_profile_id),
    INDEX idx_status (enrollment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. CERTIFICADOS E SELOS
-- ============================================

-- Certificados Emitidos
CREATE TABLE IF NOT EXISTS certificates (
    id VARCHAR(36) PRIMARY KEY,
    certificate_number VARCHAR(50) UNIQUE NOT NULL,
    talent_profile_id VARCHAR(36) NOT NULL,
    course_id VARCHAR(36) NULL,
    certificate_type ENUM('course_completion', 'zolangola_badge') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at DATETIME NULL,
    revocation_reason TEXT NULL,
    revoked_by VARCHAR(36) NULL,
    verification_url VARCHAR(500) NULL,
    qr_code_url VARCHAR(500) NULL,
    pdf_url VARCHAR(500) NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (talent_profile_id) REFERENCES talent_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
    FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_talent (talent_profile_id),
    INDEX idx_type (certificate_type),
    INDEX idx_certificate_number (certificate_number),
    INDEX idx_issued (issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 9. SUBSCRIÇÕES EMPRESARIAIS
-- ============================================

-- Planos de Subscrição
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT NULL,
    plan_type ENUM('basic', 'premium', 'enterprise', 'custom') NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    price_currency VARCHAR(3) DEFAULT 'AOA',
    billing_period ENUM('monthly', 'quarterly', 'yearly') NOT NULL,
    features JSON NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_type (plan_type),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subscrições Ativas
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(36) PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    plan_id VARCHAR(36) NOT NULL,
    status ENUM('active', 'cancelled', 'expired', 'suspended') DEFAULT 'active',
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    cancelled_at DATETIME NULL,
    cancellation_reason TEXT NULL,
    auto_renew BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES company_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    INDEX idx_company (company_id),
    INDEX idx_status (status),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 10. PAGAMENTOS
-- ============================================

-- Transações de Pagamento
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    user_type ENUM('talent', 'company') NOT NULL,
    payment_type ENUM('course', 'certificate', 'subscription', 'badge', 'other') NOT NULL,
    related_id VARCHAR(36) NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'AOA',
    payment_method ENUM('pay4all', 'paypay', 'emis_express', 'stripe', 'paypal', 'other') NOT NULL,
    payment_gateway_transaction_id VARCHAR(255) NULL,
    status ENUM('pending', 'processing', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    failure_reason TEXT NULL,
    webhook_received BOOLEAN DEFAULT FALSE,
    webhook_data JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id, user_type),
    INDEX idx_status (status),
    INDEX idx_type (payment_type),
    INDEX idx_gateway_id (payment_gateway_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 11. ENTREVISTAS
-- ============================================

-- Entrevistas Agendadas
CREATE TABLE IF NOT EXISTS interviews (
    id VARCHAR(36) PRIMARY KEY,
    application_id VARCHAR(36) NOT NULL,
    interview_type ENUM('phone', 'video', 'onsite') NOT NULL,
    scheduled_at DATETIME NOT NULL,
    duration_minutes INT DEFAULT 60,
    location VARCHAR(255) NULL,
    video_link VARCHAR(500) NULL,
    interviewer_name VARCHAR(255) NULL,
    interviewer_email VARCHAR(255) NULL,
    status ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show') DEFAULT 'scheduled',
    cancelled_at DATETIME NULL,
    cancellation_reason TEXT NULL,
    cancelled_by VARCHAR(36) NULL,
    notes TEXT NULL,
    rating INT NULL,
    feedback TEXT NULL,
    candidate_confirmed BOOLEAN DEFAULT FALSE,
    candidate_confirmed_at DATETIME NULL,
    company_confirmed BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
    FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_application (application_id),
    INDEX idx_scheduled (scheduled_at),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 12. NOTIFICAÇÕES
-- ============================================

-- Notificações do Sistema
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    user_type ENUM('talent', 'company', 'admin') NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url VARCHAR(500) NULL,
    sent_email BOOLEAN DEFAULT FALSE,
    sent_sms BOOLEAN DEFAULT FALSE,
    sent_push BOOLEAN DEFAULT FALSE,
    sent_in_app BOOLEAN DEFAULT TRUE,
    is_read BOOLEAN DEFAULT FALSE,
    read_at DATETIME NULL,
    metadata JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id, user_type),
    INDEX idx_read (is_read),
    INDEX idx_type (notification_type),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 13. LOGS DE AUDITORIA
-- ============================================

-- Logs de Auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    user_type ENUM('talent', 'company', 'admin') NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    changes JSON NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_action (action),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- FIM DO SCHEMA
-- ============================================
-- Total de tabelas criadas: 25
-- 
-- Tabelas principais:
-- - users, talent_users, company_users, admin_users
-- - refresh_tokens, password_reset_tokens, oauth_tokens, two_factor_codes
-- - talent_profiles, talent_experience, talent_education, talent_skills, talent_languages, talent_documents
-- - company_profiles
-- - jobs, applications, application_status_history
-- - courses, course_enrollments
-- - certificates
-- - subscription_plans, subscriptions
-- - payments
-- - interviews
-- - notifications
-- - audit_logs

