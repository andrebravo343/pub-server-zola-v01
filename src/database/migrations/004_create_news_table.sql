-- Migração: Criar tabela de notícias
-- Data: 2024-12-19

CREATE TABLE IF NOT EXISTS news (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT NULL,
    featured_image_url VARCHAR(500) NULL,
    author_id VARCHAR(36) NOT NULL,
    category VARCHAR(100) NULL,
    tags JSON NULL,
    is_published BOOLEAN DEFAULT FALSE,
    published_at DATETIME NULL,
    views_count INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_author (author_id),
    INDEX idx_published (is_published),
    INDEX idx_slug (slug),
    FULLTEXT idx_search (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

