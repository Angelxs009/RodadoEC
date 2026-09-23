import { Injectable } from '@nestjs/common';
import { CreateAtraccionDto } from './dto/create-atraccion.dto';
import { UpdateAtraccionDto } from './dto/update-atraccion.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { SearchAtraccionesDto } from './dto/search-atracciones.dto';
import { DetailsRequestDto } from './dto/details-request.dto';
import { AvailabilityResponseDto } from './dto/availability.dto';
import { ReservationRequestDto, ReservationResponseDto, ReservationStatus, CancelReservationRequestDto } from './dto/reservation.dto';

@Injectable()
export class AtraccionesService {
  search(searchDto: SearchAtraccionesDto): any {
    return {
      data: [{
        id: 'PRahAzWtTraa',
        free_cancellation: true,
        price: { currency: 'EUR', total: 20 },
        url: { web: 'https://www.booking.com/attractions/nl/prahazwttraa' }
      }],
      metadata: { 
        total_results: 128,
        next_page: Buffer.from(JSON.stringify({ page: 2 })).toString('base64')
      },
      request_id: 'mock-request-id'
    };
  }

  getDetailsBatch(dto: DetailsRequestDto): any {
    const data = dto.attractions.map(id => ({
      id,
      name: `Atracción ${id}`,
      categories: ['food_drinks'],
      duration: 'PT2H',
      badges: ['best_seller'],
      photos: [{ url: 'https://cf.bstatic.com/xdata/images/xphoto/500x375/170335205.jpg' }],
      locations: [{
        address: 'Centro',
        city: -2140479,
        country: 'nl',
        coordinates: { latitude: 52.36, longitude: 4.88 },
        type: 'attraction'
      }],
      long_description: `Detalles de la atracción ${id}`,
      ratings: { number_of_reviews: 120, score: 4.8 },
      supported_languages: dto.languages || ['en-gb'],
      url: { web: `https://www.booking.com/attractions/nl/${id}`, app: `booking://attractions/product?slug=${id}` }
    }));

    return {
      request_id: 'mock-batch-req',
      data
    };
  }

  create(createAtraccionDto: CreateAtraccionDto): any {
    return { id: 'uuid-1234' };
  }

  findAll(query: PaginationQueryDto): any[] {
    return [];
  }

  findOne(id: string): any {
    return null;
  }

  getAvailability(id: string, date: string): AvailabilityResponseDto {
    return {
      date: date,
      available_spots: Math.floor(Math.random() * 50) + 1,
      times: ['10:00', '14:00', '16:00']
    };
  }

  reserve(id: string, dto: ReservationRequestDto, idempotencyKey: string): ReservationResponseDto {
    return {
      reservation_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      status: ReservationStatus.CONFIRMED,
      ticket_count: dto.ticket_count,
      total_price: { currency: 'USD', total: dto.ticket_count * 45.0 }
    };
  }

  cancelReservation(reservationId: string, dto: CancelReservationRequestDto, idempotencyKey: string): ReservationResponseDto {
    return {
      reservation_id: reservationId,
      status: ReservationStatus.CANCELLED,
      ticket_count: 0,
      total_price: { currency: 'USD', total: 0 }
    };
  }

  getReservations(): ReservationResponseDto[] {
    return [];
  }

  getReservationById(reservationId: string): ReservationResponseDto {
    return {
      reservation_id: reservationId,
      status: ReservationStatus.CONFIRMED,
      ticket_count: 2,
      total_price: { currency: 'USD', total: 90.0 }
    };
  }

  replace(id: string, createAtraccionDto: CreateAtraccionDto): void {
    // Reemplazo completo
  }

  update(id: string, updateAtraccionDto: UpdateAtraccionDto): any {
    return null;
  }

  delete(id: string): void {
    // Eliminación
  }
}

