import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { notFound, paymentDeclined, paymentRequired } from '@autos/common';
import { Payment, PaymentStatus } from './entities/payment.entity';

interface Card {
  holder_name: string;
  number: string;
  expiry_month: number;
  expiry_year: number;
  cvv: string;
}

function luhnValid(number: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = Number(number[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function cardBrand(number: string): string {
  if (number.startsWith('4')) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'MASTERCARD';
  if (/^3[47]/.test(number)) return 'AMEX';
  return 'CARD';
}

export function toPaymentMsg(p: Payment) {
  return {
    payment_reference: p.reference,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    card_brand: p.card_brand,
    card_last4: p.card_last4,
    created_at: p.created_at.toISOString(),
    order_id: p.order_id ?? '',
    order_preview_id: p.order_preview_id,
    decline_reason: p.decline_reason ?? '',
  };
}

/**
 * Pasarela de pago SIMULADA (no mueve dinero). Reglas de prueba:
 *  - número inválido (Luhn) o tarjeta vencida → rechazado
 *  - 4000 0000 0000 0002 → rechazado (fondos insuficientes) · 4000 0000 0000 0069 → bloqueada
 *  - cualquier otra tarjeta válida → aprobado
 */
@Injectable()
export class PaymentsService {
  constructor(@InjectRepository(Payment) private readonly payments: Repository<Payment>) {}

  async charge(req: { order_preview_id: string; amount: number; currency: string; card: Card }) {
    const reason = this.evaluateCard(req.card);
    const saved = await this.payments.save(
      this.payments.create({
        reference: `PAY-${randomUUID().slice(0, 10).toUpperCase()}`,
        status: reason ? PaymentStatus.DECLINED : PaymentStatus.APPROVED,
        amount: req.amount,
        currency: req.currency || 'USD',
        order_preview_id: req.order_preview_id,
        card_brand: cardBrand(req.card.number),
        card_last4: req.card.number.slice(-4),
        cardholder_name: req.card.holder_name,
        decline_reason: reason,
        order_id: null,
      }),
    );
    if (reason) throw paymentDeclined(reason);
    return toPaymentMsg(saved);
  }

  async getPayment(req: { payment_reference: string }) {
    const p = await this.payments.findOneBy({ reference: req.payment_reference });
    if (!p) throw notFound('Pago no encontrado', `No existe un pago con referencia "${req.payment_reference}".`);
    return toPaymentMsg(p);
  }

  /** Atómico: solo un pago APROBADO y sin usar puede ligarse a una orden. */
  async consume(req: { payment_reference: string; order_id: string }) {
    const r = await this.payments.update(
      { reference: req.payment_reference, status: PaymentStatus.APPROVED, order_id: IsNull() },
      { order_id: req.order_id },
    );
    if (!r.affected) {
      throw paymentRequired('El pago no existe, no está aprobado o ya se usó en otra orden.');
    }
    return this.getPayment({ payment_reference: req.payment_reference });
  }

  async refund(req: { payment_reference: string }) {
    await this.payments.update({ reference: req.payment_reference }, { status: PaymentStatus.REFUNDED });
    return this.getPayment(req);
  }

  async refundByOrder(req: { order_id: string }) {
    await this.payments.update({ order_id: req.order_id }, { status: PaymentStatus.REFUNDED });
  }

  private evaluateCard(card: Card): string | null {
    if (!luhnValid(card.number)) return 'Número de tarjeta inválido.';
    const now = new Date();
    const expired =
      card.expiry_year < now.getFullYear() ||
      (card.expiry_year === now.getFullYear() && card.expiry_month < now.getMonth() + 1);
    if (expired) return 'La tarjeta está vencida.';
    if (card.number === '4000000000000002') return 'Fondos insuficientes.';
    if (card.number === '4000000000000069') return 'Tarjeta bloqueada por el emisor.';
    return null;
  }
}
