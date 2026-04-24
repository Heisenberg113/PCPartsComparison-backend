import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPgvectorExtension1704067200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector');
    await queryRunner.query(
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding vector(1536)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE products DROP COLUMN IF EXISTS embedding`,
    );
  }
}
