-- CreateEnum
CREATE TYPE "ExecucaoStatus" AS ENUM ('AGUARDANDO_DIAGNOSTICO', 'EM_DIAGNOSTICO', 'AGUARDANDO_REPARO', 'EM_REPARO', 'CONCLUIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "execucoes" (
    "id" TEXT NOT NULL,
    "ordem_servico_id" TEXT NOT NULL,
    "status" "ExecucaoStatus" NOT NULL DEFAULT 'AGUARDANDO_DIAGNOSTICO',
    "responsavel_id" TEXT,
    "diagnostico_iniciado_em" TIMESTAMP(3),
    "reparo_iniciado_em" TIMESTAMP(3),
    "concluida_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execucoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "execucoes_ordem_servico_id_key" ON "execucoes"("ordem_servico_id");

-- CreateIndex
CREATE INDEX "execucoes_status_created_at_idx" ON "execucoes"("status", "created_at");

