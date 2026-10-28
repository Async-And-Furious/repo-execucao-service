-- Seed da fila de execucao (#320) para local e HML. Reexecutavel: ignora OS ja semeada.
INSERT INTO "execucoes" ("id", "ordem_servico_id", "status", "responsavel_id", "diagnostico_iniciado_em", "reparo_iniciado_em", "concluida_em", "created_at")
VALUES
  (gen_random_uuid()::text, '00000000-0000-4000-8000-000000000001', 'AGUARDANDO_DIAGNOSTICO', NULL, NULL, NULL, NULL, NOW() - INTERVAL '6 hours'),
  (gen_random_uuid()::text, '00000000-0000-4000-8000-000000000002', 'AGUARDANDO_DIAGNOSTICO', NULL, NULL, NULL, NULL, NOW() - INTERVAL '5 hours'),
  (gen_random_uuid()::text, '00000000-0000-4000-8000-000000000003', 'EM_DIAGNOSTICO', 'mec-seed', NOW() - INTERVAL '4 hours', NULL, NULL, NOW() - INTERVAL '5 hours'),
  (gen_random_uuid()::text, '00000000-0000-4000-8000-000000000004', 'AGUARDANDO_REPARO', 'mec-seed', NOW() - INTERVAL '5 hours', NULL, NULL, NOW() - INTERVAL '6 hours'),
  (gen_random_uuid()::text, '00000000-0000-4000-8000-000000000005', 'EM_REPARO', 'mec-seed', NOW() - INTERVAL '7 hours', NOW() - INTERVAL '2 hours', NULL, NOW() - INTERVAL '8 hours'),
  (gen_random_uuid()::text, '00000000-0000-4000-8000-000000000006', 'CONCLUIDA', 'mec-seed', NOW() - INTERVAL '9 hours', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '10 hours')
ON CONFLICT ("ordem_servico_id") DO NOTHING;
