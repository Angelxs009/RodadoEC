import { PaymentsService } from '../../apps/payments/src/payments.service';

const future = new Date().getFullYear() + 2;
const card = (number: string, extra: any = {}) => ({ holder_name: 'Ana', number, expiry_month: 12, expiry_year: future, cvv: '123', ...extra });

function setup() {
  const repo: any = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, created_at: new Date('2026-12-01T00:00:00Z') })),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
  return { repo, svc: new PaymentsService(repo) };
}
const req = (c: any) => ({ order_preview_id: 'P1', amount: 100, currency: 'USD', card: c });

describe('PaymentsService (pasarela simulada)', () => {
  it('aprueba una tarjeta Visa válida (4242…)', async () => {
    const { svc } = setup();
    const r = await svc.charge(req(card('4242424242424242')));
    expect(r.status).toBe('APPROVED');
    expect(r.card_brand).toBe('VISA');
    expect(r.card_last4).toBe('4242');
    expect(r.payment_reference).toMatch(/^PAY-/);
  });
  it('detecta Mastercard y Amex', async () => {
    const { svc } = setup();
    expect((await svc.charge(req(card('5555555555554444')))).card_brand).toBe('MASTERCARD');
    expect((await svc.charge(req(card('378282246310005')))).card_brand).toBe('AMEX');
  });
  it('rechaza 4000000000000002 por fondos insuficientes y guarda el pago DECLINED', async () => {
    const { svc, repo } = setup();
    await expect(svc.charge(req(card('4000000000000002')))).rejects.toMatchObject({ status: 402 });
    expect(repo.save.mock.calls[0][0].status).toBe('DECLINED');
    expect(repo.save.mock.calls[0][0].decline_reason).toBe('Fondos insuficientes.');
  });
  it('rechaza 4000000000000069 (bloqueada)', async () => {
    const { svc } = setup();
    await expect(svc.charge(req(card('4000000000000069')))).rejects.toMatchObject({ status: 402 });
  });
  it('rechaza número inválido por Luhn', async () => {
    const { svc, repo } = setup();
    await expect(svc.charge(req(card('4242424242424241')))).rejects.toBeDefined();
    expect(repo.save.mock.calls[0][0].decline_reason).toMatch(/inválido/);
  });
  it('rechaza tarjeta vencida', async () => {
    const { svc, repo } = setup();
    await expect(svc.charge(req(card('4242424242424242', { expiry_year: 2020 })))).rejects.toBeDefined();
    expect(repo.save.mock.calls[0][0].decline_reason).toMatch(/vencida/);
  });
  it('canal B2B aprueba sin tarjeta', async () => {
    const { svc } = setup();
    const r = await svc.charge({ order_preview_id: 'P', amount: 50, currency: 'USD', channel: 'B2B' });
    expect(r.status).toBe('APPROVED');
    expect(r.card_brand).toBe('B2B');
  });
  it('consume: falla (402) si el pago no está aprobado o ya se usó', async () => {
    const { svc, repo } = setup();
    repo.update.mockResolvedValue({ affected: 0 });
    await expect(svc.consume({ payment_reference: 'PAY-X', order_id: 'O1' })).rejects.toMatchObject({ status: 402 });
  });
  it('consume: liga el pago a la orden si es válido', async () => {
    const { svc, repo } = setup();
    repo.update.mockResolvedValue({ affected: 1 });
    repo.findOneBy.mockResolvedValue({ reference: 'PAY-X', status: 'APPROVED', amount: 100, currency: 'USD', created_at: new Date(), order_id: 'O1', order_preview_id: 'P1' });
    const r = await svc.consume({ payment_reference: 'PAY-X', order_id: 'O1' });
    expect(r.order_id).toBe('O1');
  });
  it('getPayment: 404 si no existe', async () => {
    const { svc, repo } = setup();
    repo.findOneBy.mockResolvedValue(null);
    await expect(svc.getPayment({ payment_reference: 'NOPE' })).rejects.toMatchObject({ status: 404 });
  });
  it('refund marca REFUNDED', async () => {
    const { svc, repo } = setup();
    repo.findOneBy.mockResolvedValue({ reference: 'PAY-X', status: 'REFUNDED', amount: 1, currency: 'USD', created_at: new Date(), order_preview_id: 'P' });
    const r = await svc.refund({ payment_reference: 'PAY-X' });
    expect(repo.update).toHaveBeenCalledWith({ reference: 'PAY-X' }, { status: 'REFUNDED' });
    expect(r.status).toBe('REFUNDED');
  });
});
