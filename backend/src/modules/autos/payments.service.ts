import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import type { CachedPreview } from './autos.service';
import { TtlCacheService } from './cache/ttl-cache.service';
import { CardDto, PaymentRequestDto, PaymentResponseDto } from './dto/payment.dto';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Vehicle, VehicleStatus } from './entities/vehicle.entity';
import { bookingNotConfirmed, paymentDeclined, vehicleReserved } from './errors/autos-errors';

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

/**
 * Pasarela de pago SIMULADA (no mueve dinero). Reglas de prueba:
 *  - número inválido (Luhn) o tarjeta vencida → rechazado
 *  - 4000 0000 0000 0002 → rechazado (fondos insuficientes)
 *  - 4000 0000 0000 0069 → rechazado (tarjeta bloqueada)
 *  - cualquier otra tarjeta válida → aprobado
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Vehicle) private readonly vehicleRepository: Repository<Vehicle>,
    private readonly cache: TtlCacheService,
  ) {}

  async charge(request: PaymentRequestDto): Promise<PaymentResponseDto> {
    const preview = this.cache.get<CachedPreview>(`preview:${request.order_preview_id}`);
    if (!preview) throw bookingNotConfirmed(request.order_preview_id);

    // No se cobra un auto que ya no está libre.
    const vehicle = await this.vehicleRepository.findOneBy({ vehicle_id: preview.vehicle_id });
    if (!vehicle || vehicle.status !== VehicleStatus.AVAILABLE) {
      throw vehicleReserved(preview.vehicle_id);
    }

    const declineReason = this.evaluateCard(request.card);
    const saved = await this.paymentRepository.save(
      this.paymentRepository.create({
        reference: `PAY-${randomUUID().slice(0, 10).toUpperCase()}`,
        status: declineReason ? PaymentStatus.DECLINED : PaymentStatus.APPROVED,
        amount: preview.total_price,
        currency: preview.currency,
        order_preview_id: request.order_preview_id,
        card_brand: cardBrand(request.card.number),
        card_last4: request.card.number.slice(-4),
        cardholder_name: request.card.holder_name,
        decline_reason: declineReason,
        order_id: null,
      }),
    );

    if (declineReason) throw paymentDeclined(declineReason);
    return {
      payment_reference: saved.reference,
      status: saved.status,
      amount: saved.amount,
      currency: saved.currency,
      card_brand: saved.card_brand,
      card_last4: saved.card_last4,
      created_at: saved.created_at.toISOString(),
    };
  }

  private evaluateCard(card: CardDto): string | null {
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
