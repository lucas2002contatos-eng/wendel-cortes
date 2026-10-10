# WENDEL CORTES — PRD

## Visão
Aplicativo mobile de gestão para barbearia com dois perfis (cliente e admin/barbeiro), tema dark luxe com detalhes em dourado champagne.

## Perfis
- **Cliente**: cadastro, agendamentos, assinatura Cliente Mensal (4 cortes/mês), fila por ordem de chegada, perfil e histórico.
- **Admin/Barbeiro**: dashboard, agenda, fila, mensalistas, serviços/preços, horários por dia (agenda|fila|fechado), clientes, financeiro.

## Funcionalidades entregues (MVP)
1. Autenticação JWT (registro + login), sessão local com AsyncStorage.
2. Serviços padrão pré-populados: Alisante, Barba, Corte, Corte+Barba, Limpeza de Pele, Progressiva, Sobrancelha. Admin CRUD (preço, duração, ativar/desativar).
3. Agenda com slots por duração do serviço; bloqueia duplo booking (409); horários bloqueados; regra de cancelamento (h configurável, TZ America/Sao_Paulo).
4. Cliente Mensal: assinatura, ciclo de 30 dias, 4 cortes, dots visuais, histórico de uso, bloqueio quando 0 restantes ou assinatura inativa.
5. Fila por ordem de chegada: modo do dia configurável, entrar/sair fila, posição em tempo real (poll 8s), chamar próximo, iniciar, concluir (com desconto opcional de corte mensal), não compareceu.
6. Pagamentos: PIX/cartão/dinheiro/mensal; dinheiro fica pagamento_pendente até admin marcar como pago; mensal desconta corte.
7. Confirmação por WhatsApp via wa.me (deep link) após confirmar agendamento e entrar na fila.
8. Dashboard admin: faturamento hoje, agendamentos, concluídos, fila, pagamento pendente, mensalistas ativos, próximos horários.
9. Painel Mensalistas com filtros (ativos, pgto pendente, expirados, cancelados, 0/1/2/3/4 cortes restantes) e marcar pago manual.
10. Financeiro: hoje/semana/mês, por método de pagamento.
11. Push notifications (Emergent managed) — estrutura pronta; envia após agendamento, entrada na fila, chamada de próximo. `EMERGENT_PUSH_KEY=placeholder` (real após deploy).
12. Versão Web (site): mesmo código roda no navegador. Em telas ≥768px o app é centralizado em coluna de 520px com marca lateral (`src/components/web-frame.tsx`); em mobile web ocupa largura total. Título do navegador "Wendel Cortes — Barbearia". Testado E2E (iteration_1).
13. Página inicial pública (`app/index.tsx`), WhatsApp/endereço editáveis (Mais → Barbearia), layout desktop admin (sidebar + agenda/fila lado a lado), lembrete de presença (iteration_2).
14. **Múltiplos barbeiros** (`backend/barbers.py` + `src/admin/*`, `app/(admin)/barbeiros.tsx`, `src/components/barber-picker.tsx`):
    - Coleções: `barbers` {name, phone, photo_url, description, active, work_hours[7]{weekday,enabled,start,end}, commission_pct}, `barber_blocks` {barber_id,date,time,reason}, `barber_day_overrides` {barber_id,date,working,start?,end?}.
    - Appointments/queue carregam `barber_id`/`barber_name`. Conflito só para o mesmo barbeiro (overlap por duração). Slots a cada 30 min dentro do horário do barbeiro.
    - `GET /agenda/available/{d}?service_id&barber_id=any|id` → slots `{time, barber_id, barber_name}`; "any" balanceia por menor carga.
    - Fila separada por barbeiro: `GET /queue/today` → `queues[]`; `POST /queue/join {service_id, barber_id|any}` (any = fila mais curta); concluir/não compareceu chama automaticamente o próximo da mesma fila.
    - Cliente Mensal: corte reservado no agendamento (`used_mensal`), **consumido só ao concluir** (`mensal_consumed`), com `usage_history` detalhado (barbeiro, serviço, data, hora, ciclo).
    - Admin: aba Barbeiros (Equipe / Escala do dia / Bloqueios), Agenda dos Barbeiros com filtro por barbeiro e visão Dia/Semana/Mês, Filas por barbeiro, Relatórios por barbeiro (Mais → Relatórios; `GET /admin/reports/barbers`).
    - Logo oficial em `frontend/assets/images/logo.jpeg` (landing, login, web frame).
    - Seed: barbeiros Wendel (Seg–Sáb 09–18) e João (Ter–Sáb 10–20); registros antigos migrados para Wendel.
15. **Hardening de segurança (auditoria)**: JWT_SECRET forte obrigatório (≥32 chars, sem fallback), tokens de 7 dias; login sem pré-preenchimento; rate limit em `/auth/login` (10 falhas/15 min por IP e e-mail → 429); senha mínima 6; mensagem neutra no cadastro; `/api/seed` só admin; dados demo (clientes de teste) só com `SEED_DEMO_DATA=true` (dev); admin criado com `ADMIN_PASSWORD` (padrão admin123 apenas em dev — **definir em produção**); `/queue/today` anonimiza outros clientes para não-admin (sem telefone/user_id, nome abreviado); `/register-push` autenticado; CORS via `CORS_ORIGINS`; validação de data/hora → 400.

## Credenciais (produção limpa — iteração 7)
- Admin: `admin@wendelcortes.com` / `WC6DeNDoXnWy#2026` (ADMIN_PASSWORD no backend/.env)
- Banco zerado em 2026-10-06; sem clientes/barbeiros de teste (`SEED_DEMO_DATA=false`). Ver `/app/memory/test_credentials.md`.
- Entrega final (URL + credenciais + tutorial) enviada ao usuário em pt-BR.

## Stack
- Backend: FastAPI + MongoDB + JWT + bcrypt + httpx (push relay)
- Frontend: Expo Router, React Native, react-native-safe-area-context, expo-notifications, expo-image, expo-linear-gradient, @react-native-vector-icons/feather, @gorhom/bottom-sheet
- Tema: `/app/frontend/src/theme.ts` — Dark Luxe (surface #0a0a0a, brand #d4af37)

## Limitações do MVP
- Pagamentos PIX/cartão: estrutura pronta (status pagamento_pendente) — Stripe/PIX real precisa das chaves do usuário no futuro.
- WhatsApp: usa wa.me (abre o app com mensagem pronta) — migração para Twilio/Meta Cloud API futura.
- Push notifications precisam de build (não funcionam no Expo Go) — funcionam após deploy + build.
16. **Centro de controle do Administrador Fundador (iteração 5)** — SITE/WEB APP responsivo (sem app nativo):
    - Papéis: `admin` (Fundador, acesso total), `barber` (conta vinculada a `barber_id`; vê só própria agenda/fila/pagamentos; `require_staff` + `barber_scope` no backend), `client`.
    - `backend/admin_config.py`: branding (logo/favicon upload base64 → coleção `branding_assets`, servido em `GET /api/public/branding/{kind}`, histórico/restauração), plano Cliente Mensal (`settings.plan` {name, price, cuts, cycle_days, rules, allowed_service_ids, active}; assinaturas guardam `plan_snapshot`), ajuste manual de assinatura (`admin_history`), PIX (`settings.pix` modo shop|barber; barbeiro tem `pix_key`), pagamentos (`payment_status`: aguardando_pagamento|pendente_confirmacao|pago|expirado|cancelado; `PUT /appointments/{id}/payment`), config geral (`settings.general`), auditoria (`audit_logs`: quem/quando/ação/antes/depois), contas de barbeiro (`/admin/barbers/{id}/account`), recuperação de senha (`/auth/forgot` gera código 6 dígitos 30 min visível ao admin em Config → Recuperação de senha, enviado via WhatsApp; `/auth/reset`).
    - `backend/pix.py`: BR Code EMV estático com CRC16 (QR válido) — `GET /appointments/{id}/pix`.
    - Serviços: `archived`, `image_url`; excluir com histórico → arquiva. Barbeiros idem.
    - Frontend: `src/branding.tsx` (logo dinâmico em landing/login/home/painéis/web frame + favicon), `app/(auth)/forgot.tsx`, `src/components/pix-payment.tsx` (QR + copia e cola), Config hub em `app/(admin)/mais.tsx` com `src/admin/config-sections.tsx` e `services-section.tsx`, `app/(admin)/perfil.tsx` (barbeiro), tabs por papel em `(admin)/_layout.tsx`, cliente edita nome/telefone (`PUT /auth/me`).
17. **Iteração 6**: upload de imagens genérico (`POST /admin/images` → `GET /public/images/{id}`; componente `src/components/image-field.tsx` usado na foto do barbeiro e imagem do serviço); e-mail de recuperação via Emergent Resend (`backend/email_service.py`, env `EMERGENT_EMAIL_KEY`/`EMAIL_FROM_NAME`; código também fica visível ao admin como fallback; domínios inválidos como test.com são rejeitados pelo provedor → 422 logado); confirmação PIX automática: `settings.pix_provider` {provider none|mercadopago|asaas|efi|outro, access_token, webhook_secret, auto_confirm}, `PUT/GET /admin/pix-provider`, webhook `POST /api/webhooks/pix/{provider}?secret=...` (txid = id do agendamento sem hífens, 25 chars; status aprovado → payment_status pago + auditoria + `payment_events`), `GET /appointments/{id}/payment-status` (tela PIX faz polling 5s e mostra "Pagamento confirmado").

18. **Iteração 7b**: troca de senha do admin — `PUT /auth/password` {new_password} (require_admin, min 6, auditado como `senha_alterada`); aba **Minha conta** em Config. (`app/(admin)/mais.tsx`, tab `account`, testIDs pw-new-input/pw-confirm-input/pw-save-btn).

19. **Iteração 7c — assinatura paga no local**: `POST /subscription` sempre cria `pending_payment` (PIX/cartão/dinheiro são pagos na barbearia); bloqueia 2ª solicitação enquanto houver pendente. `PUT /subscription/{id}/mark-paid` (admin) ativa e reinicia o ciclo a partir da confirmação (`paid_at`, `paid_confirmed_by`, auditoria `subscription.mark_paid`, push). `PUT /subscription/{id}/cancel` (admin). Status unificado `canceled` (antes havia `cancelled` em admin_config). Cliente (`mensal.tsx`, `home.tsx`): plano dinâmico via `/public/info` (sem preço hardcoded), aviso de 'Aguardando pagamento', botão Renovar só em expirado/cancelado. Admin `mensalistas.tsx`: método/valor, botões Confirmar pagamento / Cancelar.
- Senha do admin foi alterada pelo usuário em 07/10 (não é mais a do .env). Para testes, criar admin temporário via Mongo e remover depois.
