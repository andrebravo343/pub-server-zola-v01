-- Adicionar campo profile_picture_url à tabela admin_users
-- A verificação será feita no código TypeScript antes de executar este statement
ALTER TABLE admin_users 
ADD COLUMN profile_picture_url VARCHAR(500) NULL AFTER permissions;

