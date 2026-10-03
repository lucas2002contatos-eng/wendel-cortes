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

## Credenciais
- Admin: `admin@wendelcortes.com` / `admin123`
- Clientes seed: carlos, joao, rafael, marcos, lucas @test.com / `cliente123`

## Stack
- Backend: FastAPI + MongoDB + JWT + bcrypt + httpx (push relay)
- Frontend: Expo Router, React Native, react-native-safe-area-context, expo-notifications, expo-image, expo-linear-gradient, @react-native-vector-icons/feather, @gorhom/bottom-sheet
- Tema: `/app/frontend/src/theme.ts` — Dark Luxe (surface #0a0a0a, brand #d4af37)

## Limitações do MVP
- Pagamentos PIX/cartão: estrutura pronta (status pagamento_pendente) — Stripe/PIX real precisa das chaves do usuário no futuro.
- WhatsApp: usa wa.me (abre o app com mensagem pronta) — migração para Twilio/Meta Cloud API futura.
- Push notifications precisam de build (não funcionam no Expo Go) — funcionam após deploy + build.
