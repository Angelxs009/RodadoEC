import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../entities/order.entity';

export class OrderDetailDto {
  @ApiProperty({ format: 'uuid' })
  order_id: string;

  @ApiProperty({ description: 'Equivalente al PNR. Código alfanumérico de confirmación.' })
  locator: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty()
  vehicle_details: Record<string, unknown>;

  @ApiProperty()
  route_details: Record<string, unknown>;

  @ApiProperty({
    type: [String],
    description: 'Extra no contractual: lista de extras activos, útil para el frontend de modificación.',
  })
  extras: string[];

  @ApiProperty()
  total_price: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  creation_date: string;

  @ApiProperty({
    description: 'HATEOAS – Acciones disponibles según el estado de la orden.',
  })
  _links: Record<string, string>;
}
