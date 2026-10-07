import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Matches, Max, Min, MinLength, ValidateNested } from 'class-validator';

export class CardDto {
  @ApiProperty({ example: 'Angel Loor' })
  @IsString()
  @MinLength(3)
  holder_name: string;

  @ApiProperty({
    example: '4242424242424242',
    description:
      'Tarjeta de PRUEBA (simulación). 4242424242424242 = aprobada · 4000000000000002 = rechazada por fondos insuficientes. Debe pasar el algoritmo de Luhn.',
  })
  @Matches(/^\d{13,19}$/, { message: 'number debe tener entre 13 y 19 dígitos, sin espacios' })
  number: string;

  @ApiProperty({ example: 12, minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  expiry_month: number;

  @ApiProperty({ example: 2030 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  expiry_year: number;

  @ApiProperty({ example: '123' })
  @Matches(/^\d{3,4}$/, { message: 'cvv debe tener 3 o 4 dígitos' })
  cvv: string;
}

export class PaymentRequestDto {
  @ApiProperty({
    description:
      'order_preview_id devuelto por /orders/preview. El monto se toma de ahí, no lo envía el cliente.',
  })
  @IsString()
  @IsNotEmpty()
  order_preview_id: string;

  @ApiProperty({ type: CardDto })
  @ValidateNested()
  @Type(() => CardDto)
  card: CardDto;
}

export class PaymentResponseDto {
  @ApiProperty({ description: 'Úsalo como payment_reference en /orders/create.' })
  payment_reference: string;

  @ApiProperty({ enum: ['APPROVED', 'DECLINED', 'REFUNDED'] })
  status: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ example: 'VISA' })
  card_brand: string;

  @ApiProperty({ example: '4242' })
  card_last4: string;

  @ApiProperty()
  created_at: string;
}
