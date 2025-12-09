-- Tabela de Convites para Administradores
CREATE TABLE IF NOT EXISTS admin_invites (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    role ENUM('super_admin', 'admin', 'moderator', 'finance', 'hr') NOT NULL,
    permissions JSON NULL,
    token VARCHAR(100) UNIQUE NOT NULL,
    invited_by VARCHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    accepted_at DATETIME NULL,
    accepted_by VARCHAR(36) NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_email (email),
    INDEX idx_token (token),
    INDEX idx_expires (expires_at),
    INDEX idx_used (is_used)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

